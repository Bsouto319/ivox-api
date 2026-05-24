const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function getUser(id) {
  const { data, error } = await supabase.from('ivox_users').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

async function deductCredit(userId) {
  const { error } = await supabase.rpc('ivox_deduct_credit', { p_user_id: userId });
  if (error) throw new Error(error.message);
}

async function getContacts(userId) {
  const { data, error } = await supabase
    .from('ivox_contacts')
    .select('*')
    .eq('user_id', userId)
    .order('name');
  if (error) throw new Error(error.message);
  return data;
}

async function upsertContact(userId, { name, phone }) {
  const { data, error } = await supabase
    .from('ivox_contacts')
    .upsert({ user_id: userId, name, phone }, { onConflict: 'user_id,phone' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function deleteContact(userId, contactId) {
  const { error } = await supabase
    .from('ivox_contacts')
    .delete()
    .eq('id', contactId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

async function logCall(userId, { phone, transcription, translation, callSid }) {
  const { error } = await supabase.from('ivox_call_logs').insert({
    user_id: userId, phone, transcription, translation, call_sid: callSid, credits_used: 1,
  });
  if (error) throw new Error(error.message);
}

async function addCredits(userId, amount) {
  const { error } = await supabase.rpc('ivox_add_credits', { p_user_id: userId, amount });
  if (error) throw new Error(error.message);
}

module.exports = { supabase, getUser, deductCredit, getContacts, upsertContact, deleteContact, logCall, addCredits };
