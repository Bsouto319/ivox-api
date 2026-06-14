require('dotenv').config();
const runMigration = require('./migrate');
const express   = require('express');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const fs        = require('fs');
const path      = require('path');

const callRoutes       = require('./routes/call');
const callStatusRoutes = require('./routes/callStatus');
const contactRoutes    = require('./routes/contacts');
const authRoutes       = require('./routes/auth');
const adminRoutes      = require('./routes/admin');
const stripeRoutes     = require('./routes/stripe');
const pageRoutes       = require('./routes/pages');
const twimlRoutes      = require('./routes/twiml');

const app  = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — allow only known origins
const ALLOWED_ORIGINS = new Set([
  'https://ivox-api.btechsouto.shop',
  'https://landing-ivox.vercel.app',
  process.env.EXTRA_CORS_ORIGIN,
].filter(Boolean));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Same-origin or server-to-server (Twilio webhooks)
    res.setHeader('Access-Control-Allow-Origin', 'https://ivox-api.btechsouto.shop');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Global: 60 req/min por IP
const limiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
app.use(limiter);

// Stricter para call endpoints — por usuário autenticado (userId) ou IP como fallback
const callLimiter = rateLimit({
  windowMs: 60_000, max: 8,
  keyGenerator: (req) => req.userId || req.ip,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde 1 minuto.' },
});

// Rate limiter para chamadas bidirecionais v2 (custo alto — Twilio + ElevenLabs)
const v2CallLimiter = rateLimit({
  windowMs: 60 * 60_000, max: 30,
  keyGenerator: (req) => req.userId || req.ip,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Limite de chamadas atingido. Tente novamente em 1 hora.' },
});

// Stripe webhook precisa do body raw ANTES do express.json()
app.use('/webhook/stripe', stripeRoutes);

// Twilio call status callback (urlencoded, sem auth)
app.use('/webhook/twilio', callStatusRoutes);

// audio preview recebe blob binário — rate limit antes de parsear o body
app.use('/api/call/preview',  callLimiter, express.raw({ type: '*/*', limit: '5mb' }));
app.use('/api/call/send',     callLimiter);
app.use('/api/call/v2/start', v2CallLimiter);
app.use(express.json({ limit: '64kb' }));

app.use('/api/auth',     authRoutes);
app.use('/api/call',     callRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/admin',        adminRoutes);
app.use('/twiml',        twimlRoutes);
app.use('/',             pageRoutes);

// serve MP3 gerado para o Twilio (preview one-way)
app.get('/audio/:msgId', (req, res) => {
  const safe = req.params.msgId.replace(/[^a-z0-9\-]/gi, '');
  const file = path.join('/tmp', 'ivox-audio', `${safe}.mp3`);
  if (!fs.existsSync(file)) return res.status(404).send('not found');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.sendFile(file);
});

// serve MP3 gerado pelas chamadas bidirecionais v2
app.get('/audio/call/:filename', (req, res) => {
  const safe = req.params.filename.replace(/[^a-z0-9\-_.]/gi, '');
  const file = path.join('/tmp', 'ivox-audio', safe);
  if (!fs.existsSync(file)) return res.status(404).send('not found');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.sendFile(file);
});

// serve APK — tenta disco local primeiro, depois redireciona para GitHub Releases
const APK_PATH = path.join('/data/ivox-apk', 'ivox-latest.apk');
const APK_GITHUB_URL = 'https://github.com/Bsouto319/ivox-app/releases/latest/download/ivox-latest.apk';
app.get('/download/ivox.apk', (req, res) => {
  if (fs.existsSync(APK_PATH)) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="ivox.apk"');
    return res.sendFile(APK_PATH);
  }
  return res.redirect(302, APK_GITHUB_URL);
});

app.get('/health', (_, res) => res.json({ ok: true }));

// Versão atual do APK — lida do volume persistente
const VERSION_FILE = path.join('/data/ivox-apk', 'version.json');
app.get('/version', (_, res) => {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      res.json(JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')));
    } else {
      res.json({ build: 0 });
    }
  } catch {
    res.json({ build: 0 });
  }
});

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
