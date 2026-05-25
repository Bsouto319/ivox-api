const express = require('express');
const { supabase } = require('../services/supabase');
const auth    = require('../middleware/auth');
const db      = require('../services/supabase');

const router = express.Router();
router.use(express.json());

// POST /api/auth/register (admin — criação de usuário confirmado)
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name: name || '' },
  });
  if (error) return res.status(400).json({ error: error.message });

  await supabase.from('ivox_users').insert({ id: data.user.id, email, name: name || '', credits: 5 });
  res.status(201).json({ ok: true, userId: data.user.id });
});

// GET /api/auth/credits (protegido)
router.get('/credits', auth, async (req, res) => {
  try {
    const user = await db.getUser(req.userId);
    res.json({ credits: user?.credits ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/credits/add (webhook de pagamento)
router.post('/credits/add', async (req, res) => {
  const { userId, credits, secret } = req.body || {};
  if (secret !== process.env.CREDITS_WEBHOOK_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { error } = await supabase.rpc('ivox_add_credits', { p_user_id: userId, amount: credits });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
