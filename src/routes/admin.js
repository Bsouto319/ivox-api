const express    = require('express');
const { supabase } = require('../services/supabase');
const adminAuth  = require('../middleware/adminAuth');
const path       = require('path');

const router = express.Router();

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

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  await supabase.from('ivox_users').delete().eq('id', req.params.id);
  const { error } = await supabase.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
