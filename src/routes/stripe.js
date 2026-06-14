const express = require('express');
const Stripe   = require('stripe');
const { supabase, addCredits } = require('../services/supabase');
const { sendWelcomeEmail, sendPurchaseConfirmedEmail, sendAdminSaleAlert } = require('../services/email');

const router = express.Router();

const CREDITS_MONTHLY = 20;
const CREDITS_ANNUAL  = 240;
const CREDITS_TOPUP   = 15;

function getStripe() {
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

// Conjunto de priceIds válidos — apenas esses podem adicionar créditos
function getValidPriceIds() {
  return new Set([
    process.env.STRIPE_PRICE_MONTHLY,
    process.env.STRIPE_PRICE_ANNUAL,
    process.env.STRIPE_PRICE_TOPUP,
    process.env.STRIPE_PRICE_MONTHLY_BRL,
    process.env.STRIPE_PRICE_ANNUAL_BRL,
    process.env.STRIPE_PRICE_TOPUP_BRL,
  ].filter(Boolean));
}

// POST /webhook/stripe  — raw body para verificação de assinatura
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('Stripe webhook signature invalid:', err.message);
    return res.status(400).send('Webhook Error: invalid signature');
  }

  if (event.type === 'checkout.session.completed') {
    // Expandir line_items para garantir priceId correto
    let session = event.data.object;
    try {
      session = await getStripe().checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      });
    } catch (e) {
      console.error('Stripe: failed to expand session', e.message);
    }
    await handleCheckoutCompleted(session);
  }

  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    await handleRenewal(invoice);
  }

  res.json({ received: true });
});

async function handleCheckoutCompleted(session) {
  const email    = session.customer_details?.email || session.customer_email;
  const mode     = session.mode; // 'subscription' or 'payment'
  const metadata = session.metadata || {};

  if (!email) return console.error('Stripe: no email in session');

  // Verifica se usuário já existe
  const { data: existing } = await supabase.auth.admin.listUsers();
  const existingUser = existing?.users?.find(u => u.email === email);

  const priceId = session.line_items?.data?.[0]?.price?.id
    || session.metadata?.price_id;

  // Rejeita priceIds desconhecidos — nunca adicionar créditos por IDs não cadastrados
  if (priceId && !getValidPriceIds().has(priceId)) {
    console.error(`Stripe: unknown priceId blocked: ${priceId} for ${email}`);
    return;
  }

  const credits = resolveCredits(priceId, mode);

  if (existingUser) {
    const name = existingUser.user_metadata?.name || session.customer_details?.name || '';

    // Garante que o registro existe em ivox_users antes de adicionar créditos
    await supabase.from('ivox_users').upsert(
      { id: existingUser.id, email, name },
      { onConflict: 'id', ignoreDuplicates: false }
    );
    await addCredits(existingUser.id, credits);
    console.log(`Credits added to existing user ${email}: +${credits}`);

    // Envia email de confirmação com magic link
    try {
      const redirectTo = `${process.env.BASE_URL}/app`;
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'magiclink', email, options: { redirectTo },
      });
      const accessLink = linkData?.properties?.action_link || `${process.env.BASE_URL}/app`;
      await sendPurchaseConfirmedEmail({ email, name, credits, accessLink });
    } catch (e) {
      console.error('sendPurchaseConfirmedEmail error:', e.message);
    }

    // Alerta para Bruno
    const amount   = ((session.amount_total || 0) / 100).toFixed(2);
    const currency = session.currency || 'usd';
    const plan     = resolvePlanName(priceId);
    sendAdminSaleAlert({ email, name, plan, amount, currency, credits, isNewUser: false }).catch(() => {});
    return;
  }

  // Novo usuário — cria conta automaticamente
  const tempPassword = generatePassword();
  const name         = session.customer_details?.name || '';

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password:      tempPassword,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error) {
    console.error('Stripe: failed to create user', email, error.message);
    return;
  }

  await supabase.from('ivox_users').upsert({
    id: data.user.id, email, name, credits,
  }, { onConflict: 'id' });

  await sendWelcomeEmail({ email, name, tempPassword, credits });
  console.log(`New user created via Stripe: ${email} (+${credits} credits)`);

  // Alerta para Bruno
  const amount   = ((session.amount_total || 0) / 100).toFixed(2);
  const currency = session.currency || 'usd';
  const plan     = resolvePlanName(priceId);
  sendAdminSaleAlert({ email, name, plan, amount, currency, credits, isNewUser: true }).catch(() => {});
}

async function handleRenewal(invoice) {
  // Renovação mensal — adiciona créditos ao usuário existente
  if (invoice.billing_reason !== 'subscription_cycle') return;

  const email = invoice.customer_email;
  if (!email) return;

  const { data: existing } = await supabase.auth.admin.listUsers();
  const user = existing?.users?.find(u => u.email === email);
  if (!user) return;

  await addCredits(user.id, CREDITS_MONTHLY);
  console.log(`Monthly renewal: +${CREDITS_MONTHLY} credits for ${email}`);
}

// POST /webhook/stripe/checkout — cria sessão de checkout (chamado pela LP)
router.post('/create-checkout', express.json(), async (req, res) => {
  const { email, priceId, mode } = req.body || {};
  if (!priceId) return res.status(400).json({ error: 'priceId required' });

  // Só aceita priceIds conhecidos — bloqueia tentativas com IDs arbitrários
  if (!getValidPriceIds().has(priceId)) {
    return res.status(400).json({ error: 'Invalid price' });
  }

  try {
    const stripe  = getStripe();
    const isTopup = priceId === process.env.STRIPE_PRICE_TOPUP;
    const session = await stripe.checkout.sessions.create({
      mode:                 isTopup ? 'payment' : (mode || 'subscription'),
      customer_email:       email || undefined,
      line_items:           [{ price: priceId, quantity: 1 }],
      metadata:             { price_id: priceId },
      success_url:          `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:           `${process.env.LP_URL || process.env.BASE_URL}`,
      allow_promotion_codes: true,
      expand:               ['line_items'],
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session. Please try again.' });
  }
});

function resolvePlanName(priceId) {
  if (priceId === process.env.STRIPE_PRICE_ANNUAL     || priceId === process.env.STRIPE_PRICE_ANNUAL_BRL)  return 'Anual';
  if (priceId === process.env.STRIPE_PRICE_TOPUP      || priceId === process.env.STRIPE_PRICE_TOPUP_BRL)   return 'Top-up';
  if (priceId === process.env.STRIPE_PRICE_MONTHLY    || priceId === process.env.STRIPE_PRICE_MONTHLY_BRL) return 'Mensal';
  return 'Desconhecido';
}

function resolveCredits(priceId, mode) {
  if (priceId === process.env.STRIPE_PRICE_ANNUAL      || priceId === process.env.STRIPE_PRICE_ANNUAL_BRL)  return CREDITS_ANNUAL;
  if (priceId === process.env.STRIPE_PRICE_TOPUP       || priceId === process.env.STRIPE_PRICE_TOPUP_BRL)   return CREDITS_TOPUP;
  if (priceId === process.env.STRIPE_PRICE_MONTHLY     || priceId === process.env.STRIPE_PRICE_MONTHLY_BRL) return CREDITS_MONTHLY;
  if (mode === 'payment') return CREDITS_TOPUP;
  return CREDITS_MONTHLY;
}

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = router;
