require('dotenv').config();
const runMigration = require('./migrate');
const express   = require('express');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const fs        = require('fs');
const path      = require('path');

const callRoutes    = require('./routes/call');
const contactRoutes = require('./routes/contacts');
const authRoutes    = require('./routes/auth');
const adminRoutes   = require('./routes/admin');
const stripeRoutes  = require('./routes/stripe');
const pageRoutes    = require('./routes/pages');

const app  = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const limiter = rateLimit({ windowMs: 60_000, max: 60 });
app.use(limiter);

// Stripe webhook precisa do body raw ANTES do express.json()
app.use('/webhook/stripe', stripeRoutes);

// audio preview recebe blob binário
app.use('/api/call/preview', express.raw({ type: '*/*', limit: '5mb' }));
app.use(express.json({ limit: '64kb' }));

app.use('/api/auth',     authRoutes);
app.use('/api/call',     callRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/admin',        adminRoutes);
app.use('/',             pageRoutes);

// serve MP3 gerado para o Twilio
app.get('/audio/:msgId', (req, res) => {
  const safe = req.params.msgId.replace(/[^a-z0-9\-]/gi, '');
  const file = path.join('/tmp', 'ivox-audio', `${safe}.mp3`);
  if (!fs.existsSync(file)) return res.status(404).send('not found');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.sendFile(file);
});

// serve APK do volume persistente
const APK_PATH = path.join('/data/ivox-apk', 'ivox-latest.apk');
const APK_PATH_FALLBACK = path.join(__dirname, 'admin', 'ivox.apk');
app.get('/download/ivox.apk', (req, res) => {
  const file = fs.existsSync(APK_PATH) ? APK_PATH : (fs.existsSync(APK_PATH_FALLBACK) ? APK_PATH_FALLBACK : null);
  if (!file) return res.status(404).send('APK not available yet — build in progress');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="ivox.apk"');
  res.sendFile(file);
});

app.get('/health', (_, res) => res.json({ ok: true }));

// ── Cron jobs ────────────────────────────────────────────────────────────────

// Limpeza de áudios temporários a cada hora (remove arquivos > 24h)
setInterval(() => {
  const dir = path.join('/tmp', 'ivox-audio');
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
      }
    } catch {}
  });
}, 60 * 60 * 1000);

// Alerta de créditos baixos — roda 1x por dia às 10h UTC
const { getUsersWithLowCredits } = require('./services/supabase');
const { sendLowCreditsAlert }    = require('./services/email');

function scheduleDailyAt(hourUTC, fn) {
  function msUntilNext() {
    const now  = new Date();
    const next = new Date(now);
    next.setUTCHours(hourUTC, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next - now;
  }
  setTimeout(function tick() {
    fn().catch(err => console.error('daily job error:', err.message));
    setTimeout(tick, msUntilNext());
  }, msUntilNext());
}

scheduleDailyAt(14, async () => {
  const users = await getUsersWithLowCredits(2);
  for (const u of users) {
    await sendLowCreditsAlert({ email: u.email, name: u.name, credits: u.credits });
  }
  if (users.length) console.log(`Low credits alert sent to ${users.length} users`);
});

app.listen(PORT, () => {
  console.log(`iVox API running on port ${PORT}`);
  runMigration();
});
