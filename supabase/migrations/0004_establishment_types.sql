-- Tipo de establecimiento (escuela, restaurante, pub, hotel) y roles según el tipo.
-- Ejecutar DESPUÉS de 0003.
create type establishment_type as enum ('school', 'restaurant', 'pub', 'hotel');

alter table tenants add column type establishment_type not null default 'school';

-- 'manager' (gerente) también es administrador
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'active' and role in ('superadmin','director','manager')
  )
$$;

-- Anchos de banda por defecto según el tipo de establecimiento (kbps bajada/subida)
create or replace function seed_default_bandwidth() returns trigger
language plpgsql as $$
begin
  insert into bandwidth_profiles (tenant_id, role, name, download_kbps, upload_kbps) values
    (new.id, 'superadmin', 'Admin', 20480, 10240);

  if new.type = 'school' then
    insert into bandwidth_profiles (tenant_id, role, name, download_kbps, upload_kbps) values
      (new.id, 'director', 'Directivos',  20480, 10240),
      (new.id, 'staff',    'Staff',       10240,  5120),
      (new.id, 'teacher',  'Docentes',    10240,  5120),
      (new.id, 'student',  'Estudiantes',  2048,  1024);
  elsif new.type in ('restaurant', 'pub') then
    insert into bandwidth_profiles (tenant_id, role, name, download_kbps, upload_kbps) values
      (new.id, 'manager',  'Gerencia',  20480, 10240),
      (new.id, 'employee', 'Empleados', 10240,  5120),
      (new.id, 'customer', 'Clientes',   5120,  2048);
  else -- hotel
    insert into bandwidth_profiles (tenant_id, role, name, download_kbps, upload_kbps) values
      (new.id, 'manager',  'Gerencia',  20480, 10240),
      (new.id, 'employee', 'Empleados', 10240,  5120),
      (new.id, 'guest',    'Huéspedes', 10240,  5120);
  end if;
  return new;
end $$;
