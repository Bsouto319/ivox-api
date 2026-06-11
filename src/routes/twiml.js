const express  = require('express');
const twilio   = require('twilio');
const OpenAI   = require('openai');
const fs       = require('fs');
const path     = require('path');
const db       = require('../services/supabase');
const { buildSystemPrompt } = require('../templates/callTemplates');

const router   = express.Router();
const openai   = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BASE_URL = process.env.BASE_URL;
const AUDIO_DIR = path.join('/tmp', 'ivox-audio');

// ── TTS (turbo para menor latência) ──────────────────────────────────────────
async function tts(text, callSid) {
  const voiceId  = process.env.ELEVENLABS_VOICE_ID || 'LcfcDJNUP1GQjkzn1xUU';
  const filename = `call-${callSid}-${Date.now()}.mp3`;
  const filepath = path.join(AUDIO_DIR, filename);
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.4, similarity_boost: 0.8 },
    }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
  fs.writeFileSync(filepath, Buffer.from(await r.arrayBuffer()));
  return `${BASE_URL}/audio/call/${filename}`;
}

// ── GPT decision ──────────────────────────────────────────────────────────────
async function decide(systemPrompt, history, heard) {
  const completion = await openai.chat.completions.create({
    model:       'gpt-4o',
    max_tokens:  120,
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      {
        role: 'user',
        content: `[ON CALL, YOU HEARD]: "${heard}"

Respond with ONE of:
1. JSON {"action":"dtmf","digits":"X"} — if IVR menu, press the right digit
2. JSON {"action":"hangup"} — if done or voicemail ended
3. Plain spoken English text — if a human is on the line

Output only. No explanation.`
      }
    ]
  });
  return completion.choices[0].message.content.trim();
}

// ── Session helpers ───────────────────────────────────────────────────────────
async function getSession(callSid) {
  const { data } = await db.supabase
    .from('ivox_call_sessions')
    .select('*')
    .eq('call_sid', callSid)
    .single();
  return data;
}

async function pushHistory(callSid, role, content) {
  const session = await getSession(callSid);
  const history = Array.isArray(session?.history) ? session.history : [];
  history.push({ role, content });
  await db.supabase
    .from('ivox_call_sessions')
    .update({ history, updated_at: new Date().toISOString() })
    .eq('call_sid', callSid);
  return history;
}

// ── TwiML builders ────────────────────────────────────────────────────────────
function buildGather(audioUrl, action) {
  const r = new twilio.twiml.VoiceResponse();
  const g = r.gather({
    input:         'speech dtmf',
    timeout:        10,
    speechTimeout: 'auto',
    action,
    method:        'POST',
    language:      'en-US',
  });
  if (audioUrl) g.play(audioUrl);
  r.redirect({ method: 'POST' }, action); // fallback: nenhuma entrada
  return r.toString();
}

function buildDtmf(digits, action) {
  const r = new twilio.twiml.VoiceResponse();
  r.play({ digits });
  r.pause({ length: 1 });
  const g = r.gather({
    input:         'speech dtmf',
    timeout:        10,
    speechTimeout: 'auto',
    action,
    method:        'POST',
    language:      'en-US',
  });
  g.pause({ length: 2 });
  r.redirect({ method: 'POST' }, action);
  return r.toString();
}

function buildHangup(audioUrl) {
  const r = new twilio.twiml.VoiceResponse();
  if (audioUrl) r.play(audioUrl);
  else r.say('Thank you. Goodbye.');
  r.hangup();
  return r.toString();
}

// ── /twiml/start/:callSid ─────────────────────────────────────────────────────
// Twilio chama isso quando a chamada conecta (via machineDetection)
router.post('/start/:callSid', async (req, res) => {
  const { callSid } = req.params;
  const answeredBy  = req.body.AnsweredBy || 'unknown'; // human | machine_end_beep | etc.
  res.type('text/xml');

  try {
    const session = await getSession(callSid);
    if (!session) {
      const r = new twilio.twiml.VoiceResponse();
      r.say('Session not found. Goodbye.');
      r.hangup();
      return res.send(r.toString());
    }

    await db.supabase
      .from('ivox_call_sessions')
      .update({ status: 'connected', answered_by: answeredBy })
      .eq('call_sid', callSid);

    const systemPrompt = buildSystemPrompt(session.template_id, session.context);
    const gatherAction = `${BASE_URL}/twiml/gather/${callSid}`;

    // Voicemail detectado → deixa recado curto e desliga
    if (answeredBy && answeredBy.startsWith('machine')) {
      const vmText = `Hi, this is an AI calling on behalf of ${session.context.clientName || 'a client'}. ` +
        `Please call back at your earliest convenience. Thank you.`;
      const vmUrl = await tts(vmText, callSid);
      await db.supabase
        .from('ivox_call_sessions')
        .update({ status: 'voicemail' })
        .eq('call_sid', callSid);
      return res.send(buildHangup(vmUrl));
    }

    // Humano detectado → abertura com disclosure
    const opening = await decide(
      systemPrompt, [],
      'A human just answered the phone. Say your opening disclosure and begin the conversation.'
    );

    // Se GPT retornar JSON em vez de speech (improvável aqui mas seguro)
    let parsed = null;
    try { parsed = JSON.parse(opening); } catch (_) {}
    if (parsed?.action === 'hangup') return res.send(buildHangup(null));
    if (parsed?.action === 'dtmf')   return res.send(buildDtmf(parsed.digits, gatherAction));

    await pushHistory(callSid, 'assistant', opening);
    const audioUrl = await tts(opening, callSid);
    return res.send(buildGather(audioUrl, gatherAction));

  } catch (err) {
    console.error('[twiml/start]', err.message);
    const r = new twilio.twiml.VoiceResponse();
    r.say('Technical error. Goodbye.');
    r.hangup();
    res.send(r.toString());
  }
});

// ── /twiml/gather/:callSid ────────────────────────────────────────────────────
// Twilio chama isso após cada <Gather> — com SpeechResult ou Digits
router.post('/gather/:callSid', async (req, res) => {
  const { callSid }  = req.params;
  const speechResult = req.body.SpeechResult || '';
  const digits       = req.body.Digits || '';
  const heard = speechResult || (digits ? `[Digits: ${digits}]` : '[silence / timeout]');

  res.type('text/xml');

  try {
    const session = await getSession(callSid);
    if (!session) {
      return res.send(buildHangup(null));
    }

    const systemPrompt = buildSystemPrompt(session.template_id, session.context);
    const history      = Array.isArray(session.history) ? session.history : [];
    const gatherAction = `${BASE_URL}/twiml/gather/${callSid}`;

    await pushHistory(callSid, 'user', heard);

    const decision = await decide(systemPrompt, history, heard);

    let parsed = null;
    try { parsed = JSON.parse(decision); } catch (_) {}

    if (parsed?.action === 'hangup') {
      await db.supabase
        .from('ivox_call_sessions')
        .update({ status: 'completed' })
        .eq('call_sid', callSid);
      return res.send(buildHangup(null));
    }

    if (parsed?.action === 'dtmf') {
      await pushHistory(callSid, 'assistant', `[pressed ${parsed.digits}]`);
      return res.send(buildDtmf(parsed.digits, gatherAction));
    }

    // Resposta falada
    await pushHistory(callSid, 'assistant', decision);
    const audioUrl = await tts(decision, callSid);
    return res.send(buildGather(audioUrl, gatherAction));

  } catch (err) {
    console.error('[twiml/gather]', err.message);
    const r = new twilio.twiml.VoiceResponse();
    r.say('One moment please.');
    r.redirect({ method: 'POST' }, `${BASE_URL}/twiml/gather/${callSid}`);
    res.send(r.toString());
  }
});

module.exports = router;
