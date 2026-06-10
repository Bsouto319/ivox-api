const { Resend } = require('resend');

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const APK_URL = 'https://ivox-api.btechsouto.shop/download/ivox.apk';

async function sendWelcomeEmail({ email, name, tempPassword, credits }) {
  const resend    = getResend();
  const firstName = name?.split(' ')[0] || 'there';

  const isAndroid = false; // email único para todos — instruções separadas por seção

  const { error } = await resend.emails.send({
    from:    'iVox <noreply@btechsouto.shop>',
    to:      email,
    subject: 'Seu acesso ao iVox esta pronto — veja como usar',
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0e1035;font-family:system-ui,sans-serif">
<div style="max-width:560px;margin:40px auto;padding:0 20px">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:28px">
    <h1 style="color:#fff;font-size:38px;font-weight:900;letter-spacing:-1px;margin:0">iVox</h1>
    <p style="color:#8888aa;font-size:14px;margin:6px 0 0">Fale em qualquer lingua. Ligacao em ingles.</p>
  </div>

  <!-- Boas-vindas -->
  <div style="background:#1a1a40;border-radius:20px;padding:28px 28px 20px;border:1px solid #333366;margin-bottom:16px">
    <h2 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 10px">Ola, ${firstName}!</h2>
    <p style="color:#8888aa;font-size:15px;margin:0;line-height:1.7">
      Seu acesso esta pronto. Voce tem
      <strong style="color:#c4b5fd">${credits} ligacoes</strong> disponiveis para usar agora.
    </p>
  </div>

  <!-- Credenciais -->
  <div style="background:#0e1035;border-radius:16px;padding:20px 24px;border:1px solid #222255;margin-bottom:16px">
    <p style="color:#555588;font-size:11px;font-weight:700;letter-spacing:1px;margin:0 0 12px">SEU LOGIN</p>
    <p style="color:#fff;font-size:15px;margin:0 0 8px">
      <span style="color:#555588">Email:</span> &nbsp;<strong>${email}</strong>
    </p>
    <p style="color:#fff;font-size:15px;margin:0">
      <span style="color:#555588">Senha:</span> &nbsp;
      <span style="background:#7c3aed;color:#fff;padding:3px 12px;border-radius:6px;font-family:monospace;font-size:16px;font-weight:700">${tempPassword}</span>
    </p>
    <p style="color:#555588;font-size:12px;margin:10px 0 0">Guarde bem. Voce pode trocar a senha dentro do app.</p>
  </div>

  <!-- iPhone -->
  <div style="background:#1a1a40;border-radius:16px;padding:20px 24px;border:1px solid #333366;margin-bottom:12px">
    <p style="color:#c4b5fd;font-size:12px;font-weight:700;letter-spacing:1px;margin:0 0 12px">VOCE TEM IPHONE?</p>
    <p style="color:#fff;font-size:15px;font-weight:700;margin:0 0 14px">Siga estes 3 passos simples:</p>

    <div style="display:flex;align-items:flex-start;margin-bottom:12px">
      <div style="background:#7c3aed;color:#fff;font-weight:900;font-size:14px;min-width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:12px;flex-shrink:0;text-align:center;line-height:28px">1</div>
      <div>
        <p style="color:#fff;font-size:14px;font-weight:700;margin:0 0 2px">Abra o link abaixo no Safari</p>
        <p style="color:#8888aa;font-size:13px;margin:0">(tem que ser o Safari, nao o Chrome)</p>
      </div>
    </div>

    <div style="display:flex;align-items:flex-start;margin-bottom:12px">
      <div style="background:#7c3aed;color:#fff;font-weight:900;font-size:14px;min-width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:12px;flex-shrink:0;text-align:center;line-height:28px">2</div>
      <div>
        <p style="color:#fff;font-size:14px;font-weight:700;margin:0 0 2px">Toque no icone de compartilhar</p>
        <p style="color:#8888aa;font-size:13px;margin:0">O quadradinho com a seta apontando para cima, la embaixo da tela</p>
      </div>
    </div>

    <div style="display:flex;align-items:flex-start;margin-bottom:20px">
      <div style="background:#7c3aed;color:#fff;font-weight:900;font-size:14px;min-width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:12px;flex-shrink:0;text-align:center;line-height:28px">3</div>
      <div>
        <p style="color:#fff;font-size:14px;font-weight:700;margin:0 0 2px">Toque em "Adicionar a Tela de Inicio"</p>
        <p style="color:#8888aa;font-size:13px;margin:0">O iVox vai aparecer como um app normal no seu iPhone</p>
      </div>
    </div>

    <a href="https://ivox-api.btechsouto.shop/app"
      style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:15px;border-radius:12px;font-weight:900;font-size:15px;text-decoration:none">
      Abrir iVox no iPhone
    </a>
  </div>

  <!-- Android -->
  <div style="background:#1a1a40;border-radius:16px;padding:20px 24px;border:1px solid #333366;margin-bottom:24px">
    <p style="color:#22c55e;font-size:12px;font-weight:700;letter-spacing:1px;margin:0 0 12px">VOCE TEM ANDROID?</p>
    <p style="color:#8888aa;font-size:14px;margin:0 0 16px;line-height:1.6">
      Baixe o app direto — sem precisar da Play Store.
    </p>
    <a href="${APK_URL}"
      style="display:block;background:#22c55e;color:#fff;text-align:center;padding:15px;border-radius:12px;font-weight:900;font-size:15px;text-decoration:none;margin-bottom:10px">
      Baixar app Android
    </a>
    <p style="color:#555588;font-size:12px;text-align:center;margin:0">
      Depois de baixar: abra o arquivo e toque em "Instalar"
    </p>
  </div>

  <!-- Duvidas -->
  <div style="background:#1a1a40;border-radius:16px;padding:18px 24px;border:1px solid #333366;text-align:center;margin-bottom:24px">
    <p style="color:#fff;font-size:15px;font-weight:700;margin:0 0 8px">Precisa de ajuda?</p>
    <p style="color:#8888aa;font-size:14px;margin:0 0 14px;line-height:1.6">
      Me manda mensagem no WhatsApp — respondo pessoalmente.
    </p>
    <a href="https://wa.me/556193988147"
      style="display:inline-block;background:#25d366;color:#fff;padding:12px 28px;border-radius:12px;font-weight:900;font-size:14px;text-decoration:none">
      Chamar no WhatsApp
    </a>
  </div>

  <p style="color:#333355;font-size:12px;text-align:center;line-height:1.6">
    iVox — sua voz em ingles, onde voce estiver.
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
