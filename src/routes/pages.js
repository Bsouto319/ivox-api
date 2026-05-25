const express = require('express');
const path    = require('path');
const router  = express.Router();

// Landing page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/landing.html'));
});

// Web app (iOS + Android browser)
router.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/app.html'));
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
  <ul>
    <li><strong>OpenAI Whisper</strong> — transcrição do áudio gravado.</li>
    <li><strong>OpenAI GPT-4o</strong> — tradução do texto transcrito.</li>
    <li><strong>ElevenLabs</strong> — geração de voz em inglês.</li>
    <li><strong>Twilio</strong> — realização da ligação telefônica.</li>
    <li><strong>Supabase</strong> — banco de dados e autenticação.</li>
    <li><strong>Stripe</strong> — processamento de pagamentos. O iVox não armazena dados de cartão.</li>
  </ul>

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
    body { background:#0e1035; font-family:system-ui,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:20px; box-sizing:border-box; }
    .card { background:#1a1a40; border-radius:24px; padding:40px 32px; max-width:440px; width:100%; text-align:center; border:1px solid #333366; }
    h1 { color:#fff; font-size:28px; font-weight:900; margin:16px 0 8px; }
    p { color:#8888aa; font-size:15px; line-height:1.6; margin:0 0 24px; }
    .icon { font-size:56px; }
    a { display:block; background:#7c3aed; color:#fff; padding:16px; border-radius:14px; font-weight:900; font-size:16px; text-decoration:none; }
    .hint { font-size:13px; color:#555577; margin-top:16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Pagamento confirmado!</h1>
    <p>Sua conta foi criada. Verifique seu email com as credenciais de acesso (cheque o spam também).</p>
    <a href="https://ivox-api.btechsouto.shop/app" style="margin-bottom:12px">📱 Acessar o iVox (iPhone &amp; Android)</a>
    <a href="https://ivox-api.btechsouto.shop/download/ivox.apk" style="background:#334155">⬇ Baixar APK Android nativo</a>
    <p class="hint">Dúvidas? suporte@btechsouto.shop</p>
  </div>
</body>
</html>`);
});

module.exports = router;
