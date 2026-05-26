const express = require('express');
const twilio  = require('twilio');
const path    = require('path');
const fs      = require('fs');
const db      = require('../services/supabase');
const { sendMissedCallEmail } = require('../services/email');

const router    = express.Router();
const AUDIO_DIR = path.join('/tmp', 'ivox-audio');
const MAX_RETRIES = 2; // 3 tentativas no total (0, 1, 2)
const RETRY_DELAY_MS = 30_000; // 30 segundos entre tentativas

// POST /webhook/twilio/call-status
// Twilio chama esse endpoint após cada tentativa de ligação.
// Parâmetros de estado viajam na query string para manter o handler stateless.
router.post('/call-status', express.urlencoded({ extended: false }), async (req, res) => {
  // Twilio exige resposta rápida (< 15s), responde imediatamente
  res.sendStatus(200);

  const { CallStatus } = req.body;
  const { userId, msgId, phone, retry } = req.query;
  const retryCount = parseInt(retry || '0', 10);

  // Só age em chamadas não atendidas
  if (!['no-answer', 'busy', 'failed'].includes(CallStatus)) return;
  if (!userId || !msgId || !phone) return;

  console.log(`callStatus: status=${CallStatus} phone=${phone} retry=${retryCount}/${MAX_RETRIES}`);

  if (retryCount < MAX_RETRIES) {
    // Aguarda e tenta novamente
    setTimeout(async () => {
      try {
        const BASE = process.env.BASE_URL || 'https://ivox-api.btechsouto.shop';
        const twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN,
        );
        await twilioClient.calls.create({
          to:   phone,
          from: process.env.TWILIO_FROM_NUMBER,
          twiml: `<Response><Play>${BASE}/audio/${msgId}</Play><Pause length="1"/></Response>`,
          statusCallback: `${BASE}/webhook/twilio/call-status?userId=${encodeURIComponent(userId)}&msgId=${encodeURIComponent(msgId)}&phone=${encodeURIComponent(phone)}&retry=${retryCount + 1}`,
          statusCallbackMethod: 'POST',
          statusCallbackEvent:  ['completed', 'no-answer', 'busy', 'failed'],
        });
        console.log(`callStatus: retry ${retryCount + 1} disparado → ${phone}`);
      } catch (e) {
        console.error('callStatus retry error:', e.message);
      }
    }, RETRY_DELAY_MS);

  } else {
    // Esgotou as tentativas — envia email para o usuário
    try {
      const user = await db.getUser(userId).catch(() => null);
      if (!user?.email) return;

      // Tenta recuperar a tradução do sidecar em disco
      let translation = '';
      const sidecar = path.join(AUDIO_DIR, `${msgId}.json`);
      if (fs.existsSync(sidecar)) {
        try { translation = JSON.parse(fs.readFileSync(sidecar, 'utf8')).translation || ''; } catch {}
      }

      await sendMissedCallEmail({
        email:       user.email,
        name:        user.name,
        phone,
        translation,
        attempts:    MAX_RETRIES + 1,
      });

      console.log(`callStatus: email de chamada não atendida enviado → ${user.email}`);
    } catch (e) {
      console.error('callStatus email error:', e.message);
    }
  }
});

module.exports = router;
