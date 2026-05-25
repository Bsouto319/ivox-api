const { Client } = require('pg');

const SQL = `
create table if not exists public.ivox_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text default '',
  credits integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.ivox_call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.ivox_users(id) on delete cascade,
  phone text,
  transcription text,
  translation text,
  call_sid text,
  credits_used integer default 1,
  created_at timestamptz default now()
);

create or replace function public.ivox_add_credits(p_user_id uuid, amount integer)
returns void language sql security definer as $$
  update public.ivox_users set credits = credits + amount where id = p_user_id;
$$;

alter table public.ivox_users disable row level security;
alter table public.ivox_call_logs disable row level security;
`;

async function runMigration() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.log('migrate: DATABASE_URL not set, skipping'); return; }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query(SQL);
    console.log('migrate: tables created/verified ✓');
  } catch (err) {
    console.error('migrate error:', err.message);
  } finally {
    await client.end();
  }
}

module.exports = runMigration;
