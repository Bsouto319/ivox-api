const express    = require('express');
const Stripe     = require('stripe');
const fs         = require('fs');
const { supabase } = require('../services/supabase');
const adminAuth  = require('../middleware/adminAuth');
const path       = require('path');
const { sendWelcomeEmail } = require('../services/email');

const router = express.Router();
const APK_DIR  = '/data/ivox-apk';
const APK_FILE = path.join(APK_DIR, 'ivox-latest.apk');

function getStripe() { return Stripe(process.env.STRIPE_SECRET_KEY); }

// Serve painel HTML
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

// Todos os endpoints abaixo exigem X-Admin-Key
router.use(adminAuth);

// GET /api/admin/users
router.get('/users', async (req, res) => {
  const { data, error } = await supabase
    .from('ivox_users')
    .select('id, email, name, credits, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/admin/users — cria usuário confirmado
router.post('/users', express.json(), async (req, res) => {
  const { email, password, name = '', credits = 10 } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email e password obrigatórios' });

  const { data, error } = await supabase.auth.admin.createUser({
    email, password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) return res.status(400).json({ error: error.message });

  const { error: dbErr } = await supabase
    .from('ivox_users')
    .upsert({ id: data.user.id, email, name, credits }, { onConflict: 'id' });
  if (dbErr) return res.status(500).json({ error: dbErr.message });

  await sendWelcomeEmail({ email, name, tempPassword: password, credits }).catch(() => {});

  res.status(201).json({ ok: true, userId: data.user.id });
});

// PATCH /api/admin/users/:id/credits
router.patch('/users/:id/credits', express.json(), async (req, res) => {
  const { credits } = req.body || {};
  if (credits === undefined) return res.status(400).json({ error: 'credits obrigatório' });
  const { error } = await supabase
    .from('ivox_users')
    .update({ credits: parseInt(credits, 10) })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// DELETE /admin/users/:id
router.delete('/users/:id', async (req, res) => {
  await supabase.from('ivox_users').delete().eq('id', req.params.id);
  const { error } = await supabase.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /admin/users/:id/access-link — gera link de acesso (magic link)
router.post('/users/:id/access-link', async (req, res) => {
  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(req.params.id);
  if (userErr || !userData?.user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const { data, error } = await supabase.auth.admin.generateLink({
    type:  'magiclink',
    email: userData.user.email,
  });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ link: data.properties.action_link, email: userData.user.email });
});

// POST /admin/upload-apk — recebe APK do CI e salva no volume persistente
router.post('/upload-apk', express.raw({ type: '*/*', limit: '150mb' }), (req, res) => {
  try {
    if (!fs.existsSync(APK_DIR)) fs.mkdirSync(APK_DIR, { recursive: true });
    fs.writeFileSync(APK_FILE, req.body);
    const sizeMB = (req.body.length / 1024 / 1024).toFixed(1);
    console.log(`APK uploaded: ${sizeMB}MB → ${APK_FILE}`);
    res.json({ ok: true, sizeMB });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/stats — métricas gerais (usuários + ligações)
router.get('/stats', async (req, res) => {
  const [usersRes, logsRes] = await Promise.all([
    supabase.from('ivox_users').select('credits, created_at'),
    supabase.from('ivox_call_logs').select('credits_used, created_at'),
  ]);
  const users = usersRes.data || [];
  const logs  = logsRes.data  || [];
  const now   = new Date();
  const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  res.json({
    totalUsers:        users.length,
    totalCredits:      users.reduce((s, u) => s + (u.credits || 0), 0),
    totalCalls:        logs.length,
    callsThisMonth:    logs.filter(l => l.created_at >= month).length,
    usersThisMonth:    users.filter(u => u.created_at >= month).length,
  });
});

// GET /admin/stripe — dados de assinaturas e receita do Stripe
router.get('/stripe', async (req, res) => {
  try {
    const stripe = getStripe();

    const [subs, charges] = await Promise.all([
      stripe.subscriptions.list({ limit: 100, expand: ['data.customer'] }),
      stripe.charges.list({ limit: 100 }),
    ]);

    const activeSubs   = subs.data.filter(s => s.status === 'active');
    const canceledSubs = subs.data.filter(s => s.status === 'canceled');
    const totalMRR     = activeSubs.reduce((s, sub) => {
      const amt = sub.items?.data?.[0]?.price?.unit_amount || 0;
      const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
      return s + (interval === 'year' ? amt / 12 : amt);
    }, 0) / 100;

    const successfulCharges = charges.data.filter(c => c.paid && !c.refunded);
    const totalRevenue = successfulCharges.reduce((s, c) => s + c.amount, 0) / 100;

    const recentSubs = subs.data.slice(0, 20).map(s => ({
      id:         s.id,
      customer:   s.customer?.email || s.customer,
      status:     s.status,
      plan:       s.items?.data?.[0]?.price?.nickname || s.items?.data?.[0]?.price?.id,
      amount:     (s.items?.data?.[0]?.price?.unit_amount || 0) / 100,
      interval:   s.items?.data?.[0]?.price?.recurring?.interval,
      created:    new Date(s.created * 1000).toISOString(),
      currentEnd: new Date(s.current_period_end * 1000).toISOString(),
    }));

    res.json({
      activeSubs:    activeSubs.length,
      canceledSubs:  canceledSubs.length,
      mrr:           totalMRR,
      totalRevenue,
      recentSubs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/call-logs — últimas ligações com usuário
router.get('/call-logs', async (req, res) => {
  const { data, error } = await supabase
    .from('ivox_call_logs')
    .select('id, phone, transcription, translation, credits_used, created_at, user_id, ivox_users(email, name)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

module.exports = router;
