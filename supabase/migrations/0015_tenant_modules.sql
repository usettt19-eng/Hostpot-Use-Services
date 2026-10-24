-- Módulos habilitables por establecimiento (el dueño de la plataforma los activa desde /platform).
-- Sin políticas: solo el servidor (service role) lee y escribe; ni los administradores del establecimiento ni los usuarios la ven.
-- La lista de módulos válidos vive en la aplicación (lib/modules.ts), así que un módulo nuevo no necesita migración.
create table if not exists tenant_modules (
  tenant_id uuid not null references tenants(id) on delete cascade,
  module text not null check (module ~ '^[a-z][a-z_]{1,39}$'),
  enabled_at timestamptz not null default now(),
  primary key (tenant_id, module)
);

alter table tenant_modules enable row level security;
revoke all on tenant_modules from anon, authenticated;
