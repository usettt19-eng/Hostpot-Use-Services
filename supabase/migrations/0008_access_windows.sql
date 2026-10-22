-- Horarios de acceso para escuelas: ventanas por día (lunes = 1 … domingo = 7), en minutos desde medianoche.
-- Solo las escribe el servidor con el rol de administrador; los admins del establecimiento las leen.
create table access_windows (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_min smallint not null check (start_min between 0 and 1439),
  end_min smallint not null check (end_min between 1 and 1440),
  check (end_min > start_min),
  unique (tenant_id, weekday, start_min)
);
create index access_windows_tenant on access_windows (tenant_id);

alter table access_windows enable row level security;
revoke all on access_windows from anon, authenticated;
revoke all on sequence access_windows_id_seq from anon, authenticated;
grant select on access_windows to authenticated;

create policy access_windows_admin_select on access_windows for select
  using (tenant_id = current_tenant() and is_admin());
