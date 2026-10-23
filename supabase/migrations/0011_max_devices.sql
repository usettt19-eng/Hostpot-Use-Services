-- Dispositivos simultáneos por usuario según su rol (shared-users del perfil del Hotspot).
-- Personal y administradores: 2; estudiantes, clientes e invitados: 1. El administrador puede cambiarlo en Ancho de banda.
alter table bandwidth_profiles add column if not exists max_devices smallint not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bandwidth_profiles_max_devices_check') then
    alter table bandwidth_profiles add constraint bandwidth_profiles_max_devices_check check (max_devices between 1 and 10);
  end if;
end $$;

update bandwidth_profiles set max_devices = 2
  where role in ('superadmin', 'director', 'manager', 'staff', 'teacher', 'employee') and max_devices = 1;

-- Los perfiles que siembra el trigger al crear un establecimiento nacen con el valor según su rol
create or replace function set_default_max_devices() returns trigger language plpgsql as $$
begin
  new.max_devices := case when new.role in ('superadmin', 'director', 'manager', 'staff', 'teacher', 'employee') then 2 else 1 end;
  return new;
end $$;
drop trigger if exists bandwidth_default_devices on bandwidth_profiles;
create trigger bandwidth_default_devices before insert on bandwidth_profiles
  for each row execute function set_default_max_devices();
