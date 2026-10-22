-- Equipos fijos (impresoras, pantallas, equipos de control) que no pasan por el login del Hotspot.
-- Solo los escribe el servidor con el rol de administrador; los admins del establecimiento los leen.
create table fixed_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mac text not null check (mac ~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$'),
  name text not null check (char_length(name) between 1 and 80),
  ip text check (ip is null or char_length(ip) <= 15),
  location text check (location is null or char_length(location) <= 80),
  reason text check (reason is null or char_length(reason) <= 200),
  router_binding_id text,            -- id de la excepción en el Hotspot; null si el router no está configurado
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, mac)
);

alter table fixed_devices enable row level security;
revoke all on fixed_devices from anon, authenticated;
grant select on fixed_devices to authenticated;

create policy fixed_devices_admin_select on fixed_devices for select
  using (tenant_id = current_tenant() and is_admin());
