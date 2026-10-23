-- Historial de conexiones de los usuarios del portal (personal, alumnos…): una fila por dispositivo y sesión.
-- Lo escribe el servidor al revisar el router (cada minuto); los administradores del establecimiento lo leen.
-- La MAC solo se guarda como hash. El servidor borra lo que tenga más de 90 días.
create table if not exists staff_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  username text not null,
  mac_hash text not null,
  ip text,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  ended_at timestamptz,
  bytes bigint not null default 0
);
create unique index if not exists staff_sessions_open on staff_sessions (tenant_id, username, mac_hash) where ended_at is null;
create index if not exists staff_sessions_tenant_started on staff_sessions (tenant_id, started_at desc);

alter table staff_sessions enable row level security;
revoke all on staff_sessions from anon, authenticated;
grant select on staff_sessions to authenticated;

drop policy if exists staff_sessions_admin_select on staff_sessions;
create policy staff_sessions_admin_select on staff_sessions for select
  using (tenant_id = current_tenant() and is_admin());
