-- Reparto del ancho de banda: internet contratado por establecimiento (cola padre), mínimo garantizado y ráfaga por rol,
-- y límites propios de los equipos fijos. Sin capacidad configurada, el comportamiento anterior no cambia.

-- Capacidad de internet y red del Hotspot de cada establecimiento (solo service role: la tabla no tiene políticas)
alter table tenant_router_credentials add column if not exists total_down_kbps integer;
alter table tenant_router_credentials add column if not exists total_up_kbps integer;
alter table tenant_router_credentials add column if not exists hotspot_network text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'trc_total_down_check') then
    alter table tenant_router_credentials add constraint trc_total_down_check check (total_down_kbps is null or total_down_kbps between 1000 and 100000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trc_total_up_check') then
    alter table tenant_router_credentials add constraint trc_total_up_check check (total_up_kbps is null or total_up_kbps between 1000 and 100000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trc_network_check') then
    alter table tenant_router_credentials add constraint trc_network_check check (hotspot_network is null or hotspot_network ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$');
  end if;
end $$;

-- Mínimo garantizado y ráfaga por rol (kbps; 0 = sin ráfaga)
alter table bandwidth_profiles add column if not exists min_kbps integer not null default 0;
alter table bandwidth_profiles add column if not exists burst_kbps integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bp_min_check') then
    alter table bandwidth_profiles add constraint bp_min_check check (min_kbps >= 0 and burst_kbps >= 0);
  end if;
end $$;
update bandwidth_profiles set min_kbps = case when role in ('superadmin', 'director', 'manager', 'staff', 'teacher', 'employee') then 1536 else 750 end where min_kbps = 0;

-- Los perfiles que siembra el trigger al crear un establecimiento nacen con dispositivos y mínimo según su rol
create or replace function set_default_max_devices() returns trigger language plpgsql as $$
begin
  new.max_devices := case when new.role in ('superadmin', 'director', 'manager', 'staff', 'teacher', 'employee') then 2 else 1 end;
  if new.min_kbps = 0 then
    new.min_kbps := case when new.role in ('superadmin', 'director', 'manager', 'staff', 'teacher', 'employee') then 1536 else 750 end;
  end if;
  return new;
end $$;

-- Límites propios de cada equipo fijo (kbps; null = sin cola propia). Requieren IP fija
alter table fixed_devices add column if not exists max_down_kbps integer;
alter table fixed_devices add column if not exists max_up_kbps integer;
alter table fixed_devices add column if not exists min_kbps integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fd_speed_check') then
    alter table fixed_devices add constraint fd_speed_check check (
      (max_down_kbps is null or max_down_kbps >= 64) and (max_up_kbps is null or max_up_kbps >= 64) and (min_kbps is null or min_kbps >= 0));
  end if;
end $$;
