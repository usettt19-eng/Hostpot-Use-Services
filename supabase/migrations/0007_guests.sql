-- Se puede ejecutar más de una vez (si una ejecución anterior quedó a medias, no falla por "already exists").
-- Pégalo COMPLETO en el SQL Editor; no ejecutes solo una parte.
-- Invitados del portal cautivo: personas, consentimientos y sesiones de WiFi
-- Datos personales cifrados en la aplicación (AES-GCM); el hash permite buscar sin descifrar.

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email_hash text not null,
  email_enc text not null,
  full_name text,
  phone_enc text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visit_count integer not null default 1,
  unique (tenant_id, email_hash)
);
create index if not exists guests_tenant_last_seen on guests (tenant_id, last_seen_at desc);

-- Un registro por cada vez que se acepta o rechaza; el retiro posterior es una fila nueva con granted = false
create table if not exists guest_consents (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  kind text not null check (kind in ('terms', 'marketing')),
  granted boolean not null,
  text_version integer,
  text_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists guest_consents_guest on guest_consents (guest_id, created_at desc);

create table if not exists guest_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  hotspot_username text not null,
  mac_hmac text not null,          -- la MAC nunca se guarda en claro
  ip text,
  method text not null default 'email',
  status text not null default 'pending' check (status in ('pending', 'active', 'ended', 'failed')),
  terms_version integer,
  bytes_in bigint not null default 0,
  bytes_out bigint not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (tenant_id, hotspot_username)
);
create index if not exists guest_sessions_tenant_started on guest_sessions (tenant_id, started_at desc);
create index if not exists guest_sessions_open on guest_sessions (tenant_id, status) where status in ('pending', 'active');

alter table guests enable row level security;
alter table guest_consents enable row level security;
alter table guest_sessions enable row level security;

-- Escribe solo el servidor (service role); los administradores del establecimiento leen
revoke all on guests, guest_consents, guest_sessions from anon, authenticated;
revoke all on sequence guest_consents_id_seq from anon, authenticated;
grant select on guests, guest_consents, guest_sessions to authenticated;

drop policy if exists guests_admin_select on guests;
create policy guests_admin_select on guests for select
  using (tenant_id = current_tenant() and is_admin());
drop policy if exists guest_consents_admin_select on guest_consents;
create policy guest_consents_admin_select on guest_consents for select
  using (tenant_id = current_tenant() and is_admin());
drop policy if exists guest_sessions_admin_select on guest_sessions;
create policy guest_sessions_admin_select on guest_sessions for select
  using (tenant_id = current_tenant() and is_admin());
