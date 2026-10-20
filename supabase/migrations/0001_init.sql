-- Hotspot Use Services: esquema multitenant (una escuela = un tenant)

create extension if not exists "pgcrypto";

create type user_role as enum ('superadmin', 'director', 'staff', 'teacher', 'student');
create type account_status as enum ('pending', 'active', 'suspended');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  -- Conexión al MikroTik (la contraseña debe guardarse cifrada / en Vault en producción)
  router_url text,
  router_user text,
  router_password text,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  full_name text not null,
  requested_role user_role not null default 'student',
  role user_role not null default 'student',
  status account_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index on profiles (tenant_id);

-- Perfil de ancho de banda por rol (se traduce a Simple Queue / profile Hotspot)
create table bandwidth_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  role user_role not null,
  name text not null,
  download_kbps integer not null check (download_kbps > 0),
  upload_kbps integer not null check (upload_kbps > 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, role)
);

create table hotspot_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  username text not null,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, username)
);

create table usage_stats (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotspot_user_id uuid not null references hotspot_users(id) on delete cascade,
  bytes_in bigint not null default 0,
  bytes_out bigint not null default 0,
  recorded_at timestamptz not null default now()
);
create index on usage_stats (tenant_id, recorded_at desc);

-- Helpers para RLS
create or replace function current_tenant() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from profiles where id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'active' and role in ('superadmin','director')
  )
$$;

alter table tenants enable row level security;
alter table profiles enable row level security;
alter table bandwidth_profiles enable row level security;
alter table hotspot_users enable row level security;
alter table usage_stats enable row level security;

-- tenants: cada usuario ve solo su escuela (el registro público lista por slug vía service role)
create policy tenant_select on tenants for select using (id = current_tenant());
create policy tenant_admin_update on tenants for update using (id = current_tenant() and is_admin());

-- profiles
create policy profiles_self_select on profiles for select using (id = auth.uid());
create policy profiles_admin_select on profiles for select using (tenant_id = current_tenant() and is_admin());
create policy profiles_admin_update on profiles for update using (tenant_id = current_tenant() and is_admin());

-- bandwidth_profiles: lectura para todo el tenant, escritura solo admin
create policy bw_select on bandwidth_profiles for select using (tenant_id = current_tenant());
create policy bw_admin_write on bandwidth_profiles for all
  using (tenant_id = current_tenant() and is_admin())
  with check (tenant_id = current_tenant() and is_admin());

-- hotspot_users: el usuario ve el suyo; admin ve y gestiona todos del tenant
create policy hu_self_select on hotspot_users for select using (profile_id = auth.uid());
create policy hu_admin_all on hotspot_users for all
  using (tenant_id = current_tenant() and is_admin())
  with check (tenant_id = current_tenant() and is_admin());

-- usage_stats: solo admin del tenant
create policy usage_admin_select on usage_stats for select using (tenant_id = current_tenant() and is_admin());

-- Anchos de banda por defecto al crear un tenant
create or replace function seed_default_bandwidth() returns trigger
language plpgsql as $$
begin
  insert into bandwidth_profiles (tenant_id, role, name, download_kbps, upload_kbps) values
    (new.id, 'director', 'Directivos', 20480, 10240),
    (new.id, 'staff',    'Staff',      10240,  5120),
    (new.id, 'teacher',  'Docentes',   10240,  5120),
    (new.id, 'student',  'Estudiantes', 2048,  1024),
    (new.id, 'superadmin','Admin',     20480, 10240);
  return new;
end $$;
create trigger tenants_seed after insert on tenants
  for each row execute function seed_default_bandwidth();
