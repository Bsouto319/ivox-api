const { Resend } = require('resend');

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const APK_URL = 'https://ivox-api.btechsouto.shop/download/ivox.apk';

async function sendWelcomeEmail({ email, name, tempPassword, credits }) {
  const resend    = getResend();
  const firstName = name?.split(' ')[0] || 'there';

  const { error } = await resend.emails.send({
    from:    'iVox <noreply@btechsouto.shop>',
    to:      email,
    subject: '🎉 Seu acesso ao iVox está pronto!',
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0e1035;font-family:system-ui,sans-serif">
  <div style="max-width:560px;margin:40px auto;padding:0 20px">

    <div style="text-align:center;margin-bottom:32px">
      <h1 style="color:#fff;font-size:36px;font-weight:900;letter-spacing:-1px;margin:0">iVox</h1>
      <p style="color:#8888aa;font-size:14px;margin:6px 0 0">Fale em qualquer língua. Ligação em inglês.</p>
    </div>

    <div style="background:#1a1a40;border-radius:20px;padding:32px;border:1px solid #333366">
      <h2 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 8px">
        Bem-vindo, ${firstName}! 🎉
      </h2>
      <p style="color:#8888aa;font-size:15px;margin:0 0 24px;line-height:1.6">
        Sua conta foi criada. Você tem <strong style="color:#c4b5fd">${credits} ligações</strong> disponíveis.
      </p>

      <div style="background:#0e1035;border-radius:14px;padding:20px;margin-bottom:24px;border:1px solid #222255">
        <p style="color:#555588;font-size:11px;font-weight:700;letter-spacing:1px;margin:0 0 8px">SEU ACESSO</p>
        <p style="color:#fff;font-size:14px;margin:0 0 6px"><strong>Email:</strong> ${email}</p>
        <p style="color:#fff;font-size:14px;margin:0"><strong>Senha temporária:</strong>
          <span style="background:#7c3aed;color:#fff;padding:2px 10px;border-radius:6px;font-family:monospace;font-size:15px;font-weight:700">${tempPassword}</span>
        </p>
        <p style="color:#555588;font-size:12px;margin:10px 0 0">Troque a senha depois de entrar no app.</p>
      </div>

      <a href="https://ivox-api.btechsouto.shop/app"
        style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:16px;border-radius:14px;font-weight:900;font-size:16px;text-decoration:none;margin-bottom:10px">
        📱 Acessar o iVox (iPhone &amp; Android)
      </a>
      <a href="${APK_URL}"
        style="display:block;background:#1a1a40;color:#8888aa;text-align:center;padding:12px;border-radius:14px;font-weight:600;font-size:13px;text-decoration:none;margin-bottom:16px;border:1px solid #333366">
        ⬇ Baixar APK Android nativo
      </a>

      <div style="background:#0a0a25;border-radius:12px;padding:16px;margin-top:8px">
        <p style="color:#555588;font-size:12px;font-weight:700;letter-spacing:1px;margin:0 0 10px">COMO USAR</p>
        <p style="color:#8888aa;font-size:13px;margin:0 0 6px;line-height:1.5">1️⃣ Clique no link acima (iPhone abre no navegador, Android instala o app)</p>
        <p style="color:#8888aa;font-size:13px;margin:0 0 6px;line-height:1.5">2️⃣ Entre com o email e senha acima</p>
        <p style="color:#8888aa;font-size:13px;margin:0;line-height:1.5">3️⃣ Grave sua mensagem → o iVox traduz e liga em inglês!</p>
      </div>
    </div>

    <p style="color:#333355;font-size:12px;text-align:center;margin-top:24px;line-height:1.6">
      Precisa de ajuda? Responda este email ou acesse nossa
      <a href="${process.env.BASE_URL}/privacy" style="color:#555588">Política de Privacidade</a>.
    </p>
  </div>
</body>
</html>`,
  });

  if (error) console.error('sendWelcomeEmail error:', error);
}

async function sendLowCreditsAlert({ email, name, credits }) {
  const resend    = getResend();
  const firstName = name?.split(' ')[0] || 'there';

  await resend.emails.send({
    from:    'iVox <noreply@btechsouto.shop>',
    to:      email,
    subject: `⚠️ Você tem apenas ${credits} ligação${credits !== 1 ? 'ões' : ''} restante${credits !== 1 ? 's' : ''}`,
    html: `
<body style="font-family:system-ui,sans-serif;background:#0e1035;margin:0;padding:40px 20px">
  <div style="max-width:480px;margin:0 auto;background:#1a1a40;border-radius:20px;padding:32px;border:1px solid #333366">
    <h2 style="color:#fff;margin:0 0 12px">Oi ${firstName}, seus créditos estão acabando</h2>
    <p style="color:#8888aa;margin:0 0 24px;line-height:1.6">
      Você tem <strong style="color:#f59e0b">${credits} ligação${credits !== 1 ? 'ões' : ''}</strong> restante${credits !== 1 ? 's' : ''}.
      Recarregue agora para não ficar sem acesso.
    </p>
    <a href="${process.env.LP_URL || process.env.BASE_URL}#pricing"
      style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:14px;border-radius:12px;font-weight:900;text-decoration:none">
      Recarregar créditos →
    </a>
  </div>
</body>`,
  });
}

async function sendMissedCallEmail({ email, name, phone, translation, attempts }) {
  const resend    = getResend();
  const firstName = name?.split(' ')[0] || 'there';

  await resend.emails.send({
    from:    'iVox <noreply@btechsouto.shop>',
    to:      email,
    subject: `📞 Não atendeu — ${attempts} tentativas para ${phone}`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0e1035;font-family:system-ui,sans-serif">
  <div style="max-width:480px;margin:40px auto;padding:0 20px">

    <div style="text-align:center;margin-bottom:24px">
      <h1 style="color:#fff;font-size:30px;font-weight:900;margin:0">iVox</h1>
    </div>

    <div style="background:#1a1a40;border-radius:20px;padding:28px;border:1px solid #333366">
      <h2 style="color:#f59e0b;font-size:20px;font-weight:900;margin:0 0 8px">📞 Chamada não atendida</h2>
      <p style="color:#8888aa;font-size:15px;margin:0 0 20px;line-height:1.6">
        Olá <strong style="color:#fff">${firstName}</strong>, tentamos ligar para
        <strong style="color:#fff">${phone}</strong> <strong style="color:#f59e0b">${attempts}x</strong>
        mas não houve resposta.
      </p>

      ${translation ? `
      <div style="background:#0e1035;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid #222255">
        <p style="color:#555588;font-size:11px;font-weight:700;letter-spacing:1px;margin:0 0 8px">MENSAGEM QUE TENTAMOS ENTREGAR</p>
        <p style="color:#c4b5fd;font-size:14px;margin:0;font-style:italic;line-height:1.6">"${translation}"</p>
      </div>` : ''}

      <p style="color:#8888aa;font-size:14px;margin:0 0 20px;line-height:1.6">
        Você pode tentar novamente pelo app iVox a qualquer momento. Seu crédito <strong style="color:#fff">não foi reembolsado</strong> pois a ligação foi completada pelo sistema.
      </p>

      <a href="https://ivox-api.btechsouto.shop/app"
        style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:14px;border-radius:12px;font-weight:900;font-size:15px;text-decoration:none">
        Tentar novamente →
      </a>
    </div>

    <p style="color:#333355;font-size:12px;text-align:center;margin-top:20px">
      iVox — sua voz em inglês
    </p>
  </div>
</body>
</html>`,
  });
}

module.exports = { sendWelcomeEmail, sendLowCreditsAlert, sendMissedCallEmail };
