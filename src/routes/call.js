const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const OpenAI   = require('openai');
const twilio   = require('twilio');
const auth     = require('../middleware/auth');
const db       = require('../services/supabase');
const { validateContext } = require('../templates/callTemplates');

const router    = express.Router();
const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const AUDIO_DIR = path.join('/tmp', 'ivox-audio');

// POST /api/call/preview
// Body: raw audio blob | Query: ?lang=pt (idioma hint — ISO 639-1, opcional)
// Returns: { msgId, transcription, translation }
router.post('/preview', auth, async (req, res) => {
  const audioBuffer = req.body;
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    return res.status(400).json({ error: 'No audio received' });
  }

  const lang       = (req.query.lang       || '').toString().slice(0, 8).trim() || null;
  const targetLang = (req.query.targetLang || 'en').toString().slice(0, 8).trim();

  const LANG_NAMES = {
    en: 'American English', es: 'Spanish', pt: 'Brazilian Portuguese',
    fr: 'French', de: 'German', it: 'Italian', zh: 'Mandarin Chinese',
    ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi', ru: 'Russian',
  };
  const targetLangName = LANG_NAMES[targetLang] || 'American English';

  try {
    const mimetype = (req.get('content-type') || 'audio/webm').split(';')[0].trim();
    const ext      = mimetype.split('/')[1] || 'webm';
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    const tmpFile = path.join(AUDIO_DIR, `in-${Date.now()}.${ext}`);
    fs.writeFileSync(tmpFile, audioBuffer);

    let transcription;
    try {
      const transcribeOpts = {
        model: 'whisper-1',
        file:  fs.createReadStream(tmpFile),
      };
      if (lang) transcribeOpts.language = lang;

      const result  = await openai.audio.transcriptions.create(transcribeOpts);
      transcription = result.text;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }

    if (!transcription?.trim()) {
      return res.status(422).json({ error: 'Could not transcribe — was the recording too short?' });
    }

    const translated = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: `Translate the following to clear, natural ${targetLangName} suitable for a phone call. Under 300 characters. Output ONLY the translated text.`,
        },
        { role: 'user', content: transcription },
      ],
    });
    const translation = translated.choices[0].message.content.trim().slice(0, 300);

    // Gerar TTS com voz feminina (Lexy) como prévia padrão
    const msgId  = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const mp3Buf = await generateTTS(translation, 'female', targetLang);
    fs.writeFileSync(path.join(AUDIO_DIR, `${msgId}.mp3`), mp3Buf);

    // Salvar tradução e idioma para regenerar com outra voz no /send
    fs.writeFileSync(
      path.join(AUDIO_DIR, `${msgId}.json`),
      JSON.stringify({ translation, targetLang }),
    );

    res.json({ msgId, transcription, translation });
  } catch (err) {
    console.error('call.preview error:', err.message);
    res.status(500).json({ error: 'Audio processing failed. Please try again.' });
  }
});

// Valida e normaliza número de telefone
function parsePhone(raw) {
  const cleaned = (raw || '').replace(/[\s\-\(\)\.]/g, '');
  if (!/^\+?\d{10,15}$/.test(cleaned)) return null;
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

// POST /api/call/send
// Body: { msgId, phone, voice?, saveContact?, contactName? }
router.post('/send', auth, express.json(), async (req, res) => {
  const { msgId, phone, voice = 'female', saveContact, contactName } = req.body || {};
  if (!msgId || !phone) return res.status(400).json({ error: 'msgId and phone are required' });

  const toPhone = parsePhone(phone);
  if (!toPhone) return res.status(400).json({ error: 'Invalid phone number format' });

  const safe      = msgId.replace(/[^a-z0-9\-]/gi, '');
  const mp3Path   = path.join(AUDIO_DIR, `${safe}.mp3`);
  const sidecar   = path.join(AUDIO_DIR, `${safe}.json`);

  if (!fs.existsSync(mp3Path)) {
    return res.status(404).json({ error: 'Audio not found — generate a new preview.' });
  }

  try {
    // Se voz diferente de female (default do preview), regenerar TTS
    if (voice === 'male' && fs.existsSync(sidecar)) {
      const { translation, targetLang: savedLang = 'en' } = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
      if (translation) {
        const maleMp3 = await generateTTS(translation, 'male', savedLang);
        fs.writeFileSync(mp3Path, maleMp3);
      }
    }

    // Deduz crédito ANTES da chamada — se a chamada falhar, faz refund
    await db.deductCredit(req.userId);

    const BASE         = process.env.BASE_URL || 'https://api.ivox.app';
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    let translation = '';
    if (fs.existsSync(sidecar)) {
      try { translation = JSON.parse(fs.readFileSync(sidecar, 'utf8')).translation || ''; } catch {}
    }

    const statusCbUrl = `${BASE}/webhook/twilio/call-status` +
      `?userId=${encodeURIComponent(req.userId)}` +
      `&msgId=${encodeURIComponent(safe)}` +
      `&phone=${encodeURIComponent(toPhone)}` +
      `&retry=0`;

    let call;
    try {
      call = await twilioClient.calls.create({
        to:    toPhone,
        from:  process.env.TWILIO_FROM_NUMBER,
        twiml: `<Response><Play>${BASE}/audio/${safe}</Play><Pause length="1"/></Response>`,
        statusCallback:      statusCbUrl,
        statusCallbackMethod:'POST',
        statusCallbackEvent: ['completed', 'no-answer', 'busy', 'failed'],
      });
    } catch (twilioErr) {
      // Chamada Twilio falhou — devolve o crédito
      await db.addCredits(req.userId, 1).catch(() => {});
      console.error('twilio call.create failed:', twilioErr.message);
      return res.status(502).json({ error: 'Call failed. Your credit has been refunded.' });
    }

    await db.logCall(req.userId, {
      phone: toPhone, transcription: '', translation, callSid: call.sid, credits_used: 1,
    });

    if (saveContact && contactName) {
      await db.upsertContact(req.userId, { name: contactName, phone: toPhone }).catch(() => {});
    }

    res.json({ ok: true, callSid: call.sid });
  } catch (err) {
    console.error('call.send error:', err.message);
    res.status(500).json({ error: 'Call processing failed. Please try again.' });
  }
});

// ── POST /api/call/v2/start — Chamada bidirecional com DTMF + templates ───────
router.post('/v2/start', auth, express.json(), async (req, res) => {
  const { templateId, targetPhone, context } = req.body || {};
  if (!templateId || !targetPhone || !context) {
    return res.status(400).json({ error: 'templateId, targetPhone, and context are required' });
  }

  const toPhone = parsePhone(targetPhone);
  if (!toPhone) return res.status(400).json({ error: 'Invalid phone number format' });

  const missing = validateContext(templateId, context);
  if (missing.length) {
    return res.status(400).json({ error: `Missing context fields: ${missing.join(', ')}` });
  }

  try {
    await db.deductCredit(req.userId);
  } catch {
    return res.status(402).json({ error: 'Insufficient credits' });
  }

  // Persiste sessão antes de criar a chamada
  const { data: session, error: sessionErr } = await db.supabase
    .from('ivox_call_sessions')
    .insert({
      user_id:      req.userId,
      template_id:  templateId,
      context,
      target_phone: toPhone,
      history:      [],
      status:       'initiated',
    })
    .select()
    .single();

  if (sessionErr) {
    await db.addCredits(req.userId, 1).catch(() => {});
    console.error('v2/start session insert error:', sessionErr.message);
    return res.status(500).json({ error: 'Failed to start call session. Credit refunded.' });
  }

  const BASE   = process.env.BASE_URL;
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  let call;
  try {
    call = await client.calls.create({
      to:   session.target_phone,
      from: process.env.TWILIO_FROM_NUMBER,
      url:  `${BASE}/twiml/start/${session.id}`,
      statusCallback:         `${BASE}/webhook/twilio/call-status?sessionId=${session.id}`,
      statusCallbackMethod:   'POST',
      statusCallbackEvent:    ['initiated', 'ringing', 'answered', 'completed'],
      machineDetection:       'DetectMessageEnd',
      asyncAmdStatusCallback: `${BASE}/twiml/start/${session.id}`,
      timeout: 45,
    });
  } catch (twilioErr) {
    await db.addCredits(req.userId, 1).catch(() => {});
    await db.supabase.from('ivox_call_sessions').delete().eq('id', session.id).catch(() => {});
    console.error('v2/start twilio error:', twilioErr.message);
    return res.status(502).json({ error: 'Call failed. Your credit has been refunded.' });
  }

  await db.supabase
    .from('ivox_call_sessions')
    .update({ call_sid: call.sid, status: 'ringing' })
    .eq('id', session.id);

  await db.logCall(req.userId, {
    phone: session.target_phone, transcription: '', translation: '', callSid: call.sid, credits_used: 1,
  });

  res.json({ ok: true, callSid: call.sid, sessionId: session.id });
});

// ── TTS via ElevenLabs ────────────────────────────────────────────────────────
async function generateTTS(text, voice = 'female', language = 'en') {
  const voiceId = voice === 'male'
    ? (process.env.ELEVENLABS_VOICE_ID_MALE || 'pNInz6obpgDQGcFmaJgB')  // Adam
    : (process.env.ELEVENLABS_VOICE_ID      || 'LcfcDJNUP1GQjkzn1xUU'); // Lexy (Hope)

  // eleven_monolingual_v1 só suporta inglês — usar multilingual_v2 para outros idiomas
  const modelId = language === 'en' ? 'eleven_monolingual_v1' : 'eleven_multilingual_v2';

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!r.ok) throw new Error(`ElevenLabs error ${r.status}: ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = router;
