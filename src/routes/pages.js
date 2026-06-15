const express = require('express');
const path    = require('path');
const Stripe  = require('stripe');
const router  = express.Router();

// Stripe checkout — redireciona direto para pagamento
router.get('/checkout', async (req, res) => {
  const plan = req.query.plan || 'monthly';
  const priceId = plan === 'annual'
    ? process.env.STRIPE_PRICE_ANNUAL
    : process.env.STRIPE_PRICE_MONTHLY;

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.BASE_URL}/`,
      allow_promotion_codes: true,
    });
    res.redirect(303, session.url);
  } catch (err) {
    console.error('[checkout]', err.message);
    res.status(500).send('Erro ao iniciar checkout. Tente novamente em instantes.');
  }
});

// Landing page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/landing.html'));
});

// Web app (iOS + Android browser)
router.get('/app', (req, res) => {
  if (req.query.v !== '5') return res.redirect(302, '/app?v=5');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, '../admin/app.html'));
});

// PWA manifest
router.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    name: 'iVox — Tradutor de Ligações',
    short_name: 'iVox',
    description: 'Ligue nos EUA em inglês falando só português',
    start_url: '/app?v=3&source=pwa',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#080d1a',
    theme_color: '#3b82f6',
    icons: [
      { src: '/ivox-icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/ivox-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/ivox-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  });
});

// Ícone SVG (favicon moderno — todos os navegadores modernos)
router.get('/ivox-icon.svg', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.sendFile(path.join(__dirname, '../admin/ivox-icon.svg'));
});
// Mantém compatibilidade com PNG legacy (redireciona para SVG)
router.get('/ivox-icon.png', (req, res) => res.redirect(301, '/ivox-icon.svg'));
router.get('/favicon.ico',   (req, res) => res.redirect(301, '/ivox-icon.svg'));
router.get('/favicon.svg',   (req, res) => res.redirect(301, '/ivox-icon.svg'));
router.get('/apple-touch-icon.png',            (req, res) => res.redirect(301, '/ivox-icon.svg'));
router.get('/apple-touch-icon-precomposed.png',(req, res) => res.redirect(301, '/ivox-icon.svg'));

// PWA service worker
router.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
  `.trim());
});

router.get('/privacy', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Política de Privacidade — iVox</title>
  <style>
    body { background:#0e1035; color:#ccc; font-family:system-ui,sans-serif; max-width:720px; margin:0 auto; padding:40px 24px; line-height:1.7; }
    h1 { color:#fff; font-size:28px; font-weight:900; margin-bottom:8px; }
    h2 { color:#c4b5fd; font-size:17px; font-weight:700; margin-top:32px; }
    p, li { color:#8888aa; font-size:14px; }
    a { color:#c4b5fd; }
    .badge { color:#555588; font-size:12px; }
  </style>
</head>
<body>
  <h1>iVox — Política de Privacidade</h1>
  <p class="badge">Última atualização: maio de 2026</p>

  <h2>1. Quem somos</h2>
  <p>O iVox é um aplicativo de tradução de voz desenvolvido pela BTechSouto. Ao usar o iVox, você concorda com esta política.</p>

  <h2>2. Dados coletados</h2>
  <ul>
    <li><strong>Email e senha</strong> — para criar e autenticar sua conta.</li>
    <li><strong>Gravações de voz</strong> — capturadas somente quando você pressiona o botão de gravar. Usadas exclusivamente para transcrição e tradução.</li>
    <li><strong>Número de telefone de destino</strong> — usado para realizar a ligação solicitada.</li>
    <li><strong>Dados de uso</strong> — número de ligações realizadas, créditos consumidos.</li>
  </ul>

  <h2>3. Armazenamento e exclusão de áudios</h2>
  <p>
    As gravações de voz são processadas em tempo real e os arquivos de áudio gerados são armazenados
    <strong>temporariamente por no máximo 24 horas</strong> em nossos servidores, apenas para permitir
    que o Twilio reproduza o áudio durante a ligação. Após esse período, os arquivos são excluídos
    automaticamente. Nenhuma gravação é armazenada permanentemente ou compartilhada com terceiros
    além dos serviços listados abaixo.
  </p>

  <h2>4. Serviços de terceiros</h2>
  <p>O iVox utiliza provedores terceirizados para processamento de voz, tradução, realização de chamadas telefônicas e pagamentos. Esses provedores recebem apenas os dados estritamente necessários para executar suas funções e estão sujeitos às suas próprias políticas de privacidade.</p>
  <p>Os pagamentos são processados pela <strong>Stripe, Inc.</strong> O iVox não armazena dados de cartão de crédito ou débito.</p>

  <h2>5. Compartilhamento de dados</h2>
  <p>Seus dados <strong>não são vendidos, alugados ou compartilhados</strong> com terceiros para fins de marketing. São compartilhados apenas com os serviços listados acima, estritamente para o funcionamento do app.</p>

  <h2>6. Seus direitos</h2>
  <p>Você pode solicitar a exclusão completa da sua conta e de todos os seus dados enviando um email para <a href="mailto:suporte@btechsouto.shop">suporte@btechsouto.shop</a>. Sua solicitação será atendida em até 30 dias.</p>

  <h2>7. Segurança</h2>
  <p>Usamos criptografia HTTPS em todas as comunicações. Senhas são armazenadas de forma criptografada via Supabase. Não temos acesso à sua senha.</p>

  <h2>8. Contato</h2>
  <p>Dúvidas? Fale conosco: <a href="mailto:suporte@btechsouto.shop">suporte@btechsouto.shop</a></p>
</body>
</html>`);
});

router.get('/terms', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Termos de Uso — iVox</title>
  <style>
    body { background:#0e1035; color:#ccc; font-family:system-ui,sans-serif; max-width:720px; margin:0 auto; padding:40px 24px; line-height:1.7; }
    h1 { color:#fff; font-size:28px; font-weight:900; margin-bottom:8px; }
    h2 { color:#c4b5fd; font-size:17px; font-weight:700; margin-top:32px; }
    p, li { color:#8888aa; font-size:14px; }
    a { color:#c4b5fd; }
    .badge { color:#555588; font-size:12px; }
  </style>
</head>
<body>
  <h1>iVox — Termos de Uso</h1>
  <p class="badge">Última atualização: maio de 2026</p>

  <h2>1. Aceitação</h2>
  <p>Ao usar o iVox, você concorda com estes termos. Se não concordar, não utilize o serviço.</p>

  <h2>2. O serviço</h2>
  <p>O iVox permite gravar mensagens de voz, traduzi-las automaticamente para inglês e realizar ligações telefônicas nos EUA com o áudio traduzido. O serviço é fornecido mediante assinatura mensal.</p>

  <h2>3. Uso permitido</h2>
  <ul>
    <li>Uso pessoal para comunicação legítima.</li>
    <li>Ligações para empresas, serviços de saúde, governo, landlords, etc.</li>
  </ul>

  <h2>4. Uso proibido</h2>
  <ul>
    <li>Spam, robocalls ou qualquer uso que viole a lei.</li>
    <li>Ligações para fins de fraude, assédio ou atividade ilegal.</li>
    <li>Revenda do serviço sem autorização.</li>
  </ul>

  <h2>5. Créditos e pagamento</h2>
  <p>Cada ligação consome 1 crédito. Créditos mensais não são cumulativos — expiram no final do ciclo de assinatura. Top-ups adquiridos separadamente não expiram. Não há reembolso de créditos já utilizados.</p>

  <h2>6. Cancelamento</h2>
  <p>Você pode cancelar sua assinatura a qualquer momento pelo Stripe. O acesso continua até o fim do período pago.</p>

  <h2>7. Limitação de responsabilidade</h2>
  <p>O iVox é um facilitador de comunicação. Não somos responsáveis pelo conteúdo das ligações nem por problemas de conectividade de terceiros (Twilio, operadoras).</p>

  <h2>8. Contato</h2>
  <p><a href="mailto:suporte@btechsouto.shop">suporte@btechsouto.shop</a></p>
</body>
</html>`);
});

router.get('/success', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Compra confirmada — iVox</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a1a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      min-height: 100vh;
      padding: 24px 16px 48px;
      color: #f0f0ff;
    }
    .wrap { max-width: 480px; margin: 0 auto; }

    /* ── Success card ── */
    .card-success {
      background: linear-gradient(135deg, #1a1a40 0%, #0f1035 100%);
      border: 1px solid #2d2d6b;
      border-radius: 24px;
      padding: 36px 28px;
      text-align: center;
      margin-bottom: 20px;
    }
    .icon-wrap { font-size: 52px; margin-bottom: 12px; }
    .card-success h1 { font-size: 26px; font-weight: 900; color: #fff; margin-bottom: 8px; }
    .card-success p { color: #8888bb; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .email-badge {
      background: #12124a;
      border: 1px solid #2d2d6b;
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 13px;
      color: #7777cc;
      margin-bottom: 24px;
    }
    .email-badge strong { color: #c4b5fd; }

    .btn { display: block; padding: 16px; border-radius: 14px; font-weight: 900; font-size: 16px; text-decoration: none; text-align: center; margin-bottom: 10px; transition: opacity .15s; }
    .btn:hover { opacity: .88; }
    .btn-purple { background: #7c3aed; color: #fff; }
    .btn-dark   { background: #1e293b; color: #cbd5e1; }
    .btn-sm     { font-size: 14px; padding: 13px; }

    /* ── Upsell card ── */
    .card-upsell {
      background: linear-gradient(135deg, #0d1f0d 0%, #0a1a0a 100%);
      border: 2px solid #22c55e44;
      border-radius: 24px;
      padding: 28px 24px;
      position: relative;
      overflow: hidden;
    }
    .upsell-badge {
      position: absolute;
      top: 16px; right: 16px;
      background: #22c55e;
      color: #000;
      font-size: 11px;
      font-weight: 900;
      padding: 4px 10px;
      border-radius: 99px;
      text-transform: uppercase;
      letter-spacing: .5px;
    }
    .upsell-logo { font-size: 32px; margin-bottom: 8px; }
    .card-upsell h2 { font-size: 20px; font-weight: 900; color: #fff; margin-bottom: 4px; }
    .card-upsell .sub { font-size: 13px; color: #4ade80; font-weight: 600; margin-bottom: 14px; }
    .card-upsell p { color: #6b886b; font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
    .feature-list { list-style: none; margin-bottom: 20px; }
    .feature-list li { font-size: 14px; color: #a3c9a3; padding: 4px 0; }
    .feature-list li::before { content: "✓ "; color: #22c55e; font-weight: 900; }
    .btn-green { background: #16a34a; color: #fff; }
    .upsell-hint { font-size: 12px; color: #3a5a3a; text-align: center; margin-top: 8px; }

    .divider { text-align: center; color: #333; font-size: 12px; margin: 20px 0; }
  </style>
  <script>
    // Detecta plataforma para mostrar o link certo
    (function() {
      document.addEventListener('DOMContentLoaded', function() {
        var isAndroid = /android/i.test(navigator.userAgent);
        var iosBtn    = document.getElementById('btn-ios');
        var andBtn    = document.getElementById('btn-android');
        if (isAndroid) {
          andBtn.style.display = 'block';
          iosBtn.style.display = 'none';
        } else {
          iosBtn.style.display = 'block';
          andBtn.style.display = 'none';
        }
      });
    })();
  </script>
</head>
<body>
  <div class="wrap">

    <!-- ── SUCCESS ── -->
    <div class="card-success">
      <div class="icon-wrap">🎉</div>
      <h1>Pagamento confirmado!</h1>
      <p>Sua conta foi criada e seus créditos já estão disponíveis. Verifique seu email com o link de acesso.</p>
      <div class="email-badge">📧 Verifique seu email — incluindo a pasta <strong>Spam</strong>. O link de acesso expira em 1 hora.</div>

      <!-- iOS -->
      <a id="btn-ios" href="https://ivox-api.btechsouto.shop/app" class="btn btn-purple" style="display:none">
        📱 Acessar o iVox agora (iPhone)
      </a>
      <!-- Android -->
      <a id="btn-android" href="https://ivox-api.btechsouto.shop/download/ivox.apk" class="btn btn-purple" style="display:none">
        ⬇ Baixar app Android
      </a>
      <!-- Fallback: ambos visíveis se JS falhar (display inline no load) -->
      <noscript>
        <a href="https://ivox-api.btechsouto.shop/app" class="btn btn-purple" style="margin-bottom:10px">📱 iPhone — Acessar app</a>
        <a href="https://ivox-api.btechsouto.shop/download/ivox.apk" class="btn btn-dark btn-sm">⬇ Android — Baixar APK</a>
      </noscript>

      <p style="font-size:13px;color:#444466;margin-top:14px">Dúvidas? suporte@btechsouto.shop</p>
    </div>

    <!-- ── UPSELL LeadPilot ── -->
    <div class="divider">━━━ Oferta exclusiva para clientes iVox ━━━</div>

    <div class="card-upsell">
      <span class="upsell-badge">Oferta exclusiva</span>
      <div class="upsell-logo">🚀</div>
      <h2>LeadPilot</h2>
      <div class="sub">Você é contractor ou autônomo nos EUA?</div>
      <p>
        O LeadPilot captura leads do seu site e responde automaticamente por SMS em segundos — antes que o concorrente atenda.
        Você foca no trabalho, o sistema cuida dos novos clientes.
      </p>
      <ul class="feature-list">
        <li>Resposta automática para leads em menos de 60 segundos</li>
        <li>Qualificação inteligente por SMS com IA</li>
        <li>Dashboard Kanban para acompanhar cada lead</li>
        <li>Integrado com seu site (WordPress, Wix, etc.)</li>
      </ul>
      <a href="https://wa.me/5561939881470?text=Oi%2C+comprei+o+iVox+e+quero+saber+mais+sobre+o+LeadPilot" class="btn btn-green">
        💬 Quero saber mais sobre o LeadPilot
      </a>
      <p class="upsell-hint">Resposta em até 24h · Sem compromisso</p>
    </div>

  </div>
</body>
</html>`);
});

module.exports = router;
