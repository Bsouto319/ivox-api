const express = require('express');
const Stripe   = require('stripe');
const { supabase, addCredits } = require('../services/supabase');
const { sendWelcomeEmail } = require('../services/email');

const router = express.Router();

const CREDITS_MONTHLY = 50;
const CREDITS_TOPUP   = 20;

function getStripe() {
  return Stripe(process.env.STRIPE_SECRET_KEY);
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
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
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

  if (existingUser) {
    // Usuário já existe — só adiciona créditos
    const amount = mode === 'subscription' ? CREDITS_MONTHLY : CREDITS_TOPUP;
    await addCredits(existingUser.id, amount);
    console.log(`Credits added to existing user ${email}: +${amount}`);
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

  const credits = mode === 'subscription' ? CREDITS_MONTHLY : CREDITS_TOPUP;
  await supabase.from('ivox_users').upsert({
    id: data.user.id, email, name, credits,
  }, { onConflict: 'id' });

  await sendWelcomeEmail({ email, name, tempPassword, credits });
  console.log(`New user created via Stripe: ${email}`);
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

  try {
    const stripe  = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode:                mode || 'subscription',
      customer_email:      email || undefined,
      payment_method_types: ['card'],
      line_items:          [{ price: priceId, quantity: 1 }],
      success_url:         `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:          `${process.env.LP_URL || process.env.BASE_URL}`,
      allow_promotion_codes: true,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = router;
