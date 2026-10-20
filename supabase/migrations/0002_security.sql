-- Correcciones de seguridad (ver CLAUDE.md, "Problemas conocidos de seguridad")

-- 1) Credenciales del router en tabla aparte: RLS activo y sin políticas => solo service role.
create table tenant_router_credentials (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  router_url text,
  router_user text,
  -- Cifrada en la aplicación (AES-256-GCM, ver lib/crypto.ts); nunca en claro
  router_password_enc text,
  updated_at timestamptz not null default now()
);
alter table tenant_router_credentials enable row level security;
revoke all on tenant_router_credentials from anon, authenticated;

-- Las contraseñas existentes estaban en claro: se descartan y deben re-ingresarse (se cifrarán al guardar).
insert into tenant_router_credentials (tenant_id, router_url, router_user)
  select id, router_url, router_user from tenants where router_url is not null or router_user is not null;

alter table tenants drop column router_url, drop column router_user, drop column router_password;

-- 2) current_tenant() solo para cuentas activas
create or replace function current_tenant() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from profiles where id = auth.uid() and status = 'active'
$$;

-- Un usuario pendiente/suspendido aún puede ver el nombre de su propia escuela (columnas públicas)
drop policy tenant_select on tenants;
create policy tenant_select on tenants for select
  using (id = current_tenant() or id in (select tenant_id from profiles where id = auth.uid()));

-- 4) Defensa en profundidad: sin insert/delete para clientes en tablas que escribe solo el service role
revoke insert, delete on tenants, profiles, usage_stats from anon, authenticated;
