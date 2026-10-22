-- Suspensión de establecimientos por el dueño de la plataforma (panel /platform).
-- Tabla aparte y sin políticas: ni los administradores del establecimiento pueden leerla ni cambiarla; solo el service role.
create table if not exists tenant_suspensions (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  suspended_at timestamptz not null default now(),
  reason text check (reason is null or char_length(reason) <= 200)
);

alter table tenant_suspensions enable row level security;
revoke all on tenant_suspensions from anon, authenticated;
