-- Aislamiento de las tablas originales: tenants, profiles, bandwidth_profiles, hotspot_users, usage_stats,
-- tenant_router_credentials. Base de PRUEBAS con las migraciones 0001-0007 y bootstrap_local.sql.
-- Todo ocurre en una transacción que termina en ROLLBACK.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin-a@test'),   -- admin activo del establecimiento A
  ('a0000000-0000-0000-0000-000000000002', 'staff-a@test'),   -- empleado activo de A
  ('a0000000-0000-0000-0000-000000000003', 'pending-a@test'), -- pendiente de A
  ('a0000000-0000-0000-0000-000000000004', 'susp-a@test'),    -- suspendido de A
  ('b0000000-0000-0000-0000-000000000001', 'admin-b@test');   -- admin activo del establecimiento B
insert into tenants (id, name, slug, type) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Cafe A', 'cafe-a', 'restaurant'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Colegio B', 'colegio-b', 'school');
insert into profiles (id, tenant_id, full_name, requested_role, role, status) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Admin A', 'manager', 'superadmin', 'active'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'Staff A', 'employee', 'employee', 'active'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000000', 'Pend A', 'customer', 'customer', 'pending'),
  ('a0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000000', 'Susp A', 'customer', 'customer', 'suspended'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Admin B', 'director', 'superadmin', 'active');
insert into hotspot_users (tenant_id, profile_id, username) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'staffa'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'adminb');
insert into usage_stats (tenant_id, hotspot_user_id, bytes_in, bytes_out)
  select tenant_id, id, 1, 1 from hotspot_users;
insert into tenant_router_credentials (tenant_id, router_url, router_user, router_password_enc) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'https://10.99.0.2', 'portal', 'secreto-cifrado-a');

-- Helper: ejecuta un SELECT como un usuario y devuelve el conteo
create or replace function pg_temp.count_as(uid uuid, tbl text, cond text default 'true') returns int
language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from %I where %s', tbl, cond) into n;
  execute 'reset role';
  return n;
end $$;

-- 1. Tenants: cada usuario activo solo ve su establecimiento
do $$ begin
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000001', 'tenants') = 1, 'admin A debe ver solo A';
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000001', 'tenants', 'id = ''bbbbbbbb-0000-0000-0000-000000000000''') = 0, 'admin A no ve B';
  assert pg_temp.count_as('b0000000-0000-0000-0000-000000000001', 'tenants') = 1, 'admin B debe ver solo B';
end $$;

-- 2. Pendiente: ve su propio establecimiento (nombre) pero ningún dato sensible de él
do $$ begin
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000003', 'tenants') = 1, 'pendiente ve su establecimiento';
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000003', 'tenants', 'id = ''bbbbbbbb-0000-0000-0000-000000000000''') = 0, 'pendiente no ve B';
end $$;

-- 3. Perfiles: el empleado ve solo el suyo; el admin ve los de su establecimiento
do $$ begin
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000002', 'profiles') = 1, 'empleado solo ve su perfil';
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000001', 'profiles') = 4, 'admin A ve los 4 de A';
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000001', 'profiles', 'tenant_id = ''bbbbbbbb-0000-0000-0000-000000000000''') = 0, 'admin A no ve perfiles de B';
end $$;

-- 4. Planes de red: todos los de su establecimiento; los pendientes no ven ninguno (security item 2)
do $$ begin
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000002', 'bandwidth_profiles') = 4, 'empleado activo ve los 4 planes de A (restaurante)';
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000003', 'bandwidth_profiles') = 0, 'pendiente no ve planes';
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000004', 'bandwidth_profiles') = 0, 'suspendido no ve planes';
end $$;

-- 5. Usuarios del Hotspot: cada uno ve el suyo; el admin ve los de su establecimiento
do $$ begin
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000002', 'hotspot_users') = 1, 'empleado ve su usuario de Hotspot';
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000003', 'hotspot_users') = 0, 'pendiente no ve usuarios';
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000001', 'hotspot_users') = 1, 'admin A ve los de A';
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000001', 'hotspot_users', 'tenant_id = ''bbbbbbbb-0000-0000-0000-000000000000''') = 0, 'admin A no ve los de B';
end $$;

-- 6. Consumo: solo el admin de su establecimiento
do $$ begin
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000001', 'usage_stats') = 1, 'admin A ve su consumo';
  assert pg_temp.count_as('a0000000-0000-0000-0000-000000000002', 'usage_stats') = 0, 'empleado no ve consumo';
  assert pg_temp.count_as('b0000000-0000-0000-0000-000000000001', 'usage_stats', 'tenant_id = ''aaaaaaaa-0000-0000-0000-000000000000''') = 0, 'admin B no ve consumo de A';
end $$;

-- 7. Credenciales del router: nadie del cliente las lee, ni siquiera el admin
do $$ begin
  -- ni el admin puede leer la tabla: no tiene permisos para el rol authenticated
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin
    perform count(*) from tenant_router_credentials;
    reset role; raise exception 'FALLO: un admin leyó credenciales';
  exception when insufficient_privilege then reset role; end;
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform count(*) from tenant_router_credentials;
    reset role; raise exception 'FALLO: anon leyó credenciales';
  exception when insufficient_privilege then reset role; end;
end $$;

-- 8. Escrituras directas desde el cliente: prohibidas en perfiles, consumo, establecimientos y credenciales
do $$ begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin insert into profiles (id, tenant_id, full_name) values ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'x');
    reset role; raise exception 'FALLO: insert en profiles'; exception when insufficient_privilege then reset role; end;
  set local role authenticated;
  begin insert into usage_stats (tenant_id, hotspot_user_id, bytes_in, bytes_out) select tenant_id, id, 1, 1 from hotspot_users;
    reset role; raise exception 'FALLO: insert en usage_stats'; exception when insufficient_privilege then reset role; end;
  set local role authenticated;
  begin insert into tenants (name, slug, type) values ('x', 'x-nuevo', 'hotel');
    reset role; raise exception 'FALLO: insert en tenants'; exception when insufficient_privilege then reset role; end;
  set local role authenticated;
  begin update tenant_router_credentials set router_url = 'https://evil';
    reset role; raise exception 'FALLO: update en credenciales'; exception when insufficient_privilege then reset role; end;
end $$;

-- 9. Un admin solo modifica planes y perfiles de su establecimiento
do $$ declare n int; begin
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  update bandwidth_profiles set download_kbps = 1 where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000';
  get diagnostics n = row_count;
  reset role;
  assert n = 0, 'admin B no debe poder cambiar planes de A (cambiaron ' || n || ')';
end $$;

-- 10. Un empleado no puede cambiar planes
do $$ declare n int; begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  update bandwidth_profiles set download_kbps = 1 where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000';
  get diagnostics n = row_count;
  reset role;
  assert n = 0, 'empleado no debe cambiar planes';
end $$;

select 'TODAS LAS PRUEBAS DE TABLAS BASE PASARON' as resultado;
rollback;
