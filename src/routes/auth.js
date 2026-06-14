const express    = require('express');
const { supabase } = require('../services/supabase');
const auth       = require('../middleware/auth');
const adminAuth  = require('../middleware/adminAuth');
const db         = require('../services/supabase');

const router = express.Router();
router.use(express.json());

// POST /api/auth/register — SOMENTE ADMIN (cria usuário confirmado)
router.post('/register', adminAuth, async (req, res) => {
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
    console.error('credits fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

// POST /api/auth/credits/add — REMOVIDO por segurança.
// Créditos SÃO adicionados APENAS via webhook Stripe com verificação de assinatura.
// Qualquer tentativa de adicionar créditos por esse endpoint retorna 404.
router.post('/credits/add', (req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = router;
