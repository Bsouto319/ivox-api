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

create table if not exists public.ivox_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.ivox_users(id) on delete cascade,
  name text not null,
  phone text not null,
  created_at timestamptz default now(),
  unique (user_id, phone)
);

create or replace function public.ivox_add_credits(p_user_id uuid, amount integer)
returns void language sql security definer as $$
  update public.ivox_users set credits = credits + amount where id = p_user_id;
$$;

create or replace function public.ivox_deduct_credit(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.ivox_users
  set credits = credits - 1
  where id = p_user_id and credits > 0;
  if not found then
    raise exception 'Insufficient credits or user not found';
  end if;
end;
$$;

create table if not exists public.ivox_call_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.ivox_users(id) on delete cascade,
  call_sid     text,
  template_id  text not null,
  context      jsonb not null default '{}',
  target_phone text not null,
  history      jsonb not null default '[]',
  status       text not null default 'initiated',
  answered_by  text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.ivox_users disable row level security;
alter table public.ivox_call_logs disable row level security;
alter table public.ivox_contacts disable row level security;
alter table public.ivox_call_sessions disable row level security;
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
