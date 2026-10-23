-- Pruebas de staff_sessions. Base de PRUEBAS con las migraciones 0001-0012. Termina en ROLLBACK.
begin;
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin-a@test'),
  ('a0000000-0000-0000-0000-000000000002', 'staff-a@test'),
  ('b0000000-0000-0000-0000-000000000001', 'admin-b@test');
insert into tenants (id, name, slug, type) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Cafe A', 'cafe-a', 'restaurant'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Colegio B', 'colegio-b', 'school');
insert into profiles (id, tenant_id, full_name, requested_role, role, status) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Admin A', 'manager', 'superadmin', 'active'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'Staff A', 'employee', 'employee', 'active'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Admin B', 'director', 'superadmin', 'active');
insert into staff_sessions (tenant_id, profile_id, username, mac_hash, started_at, last_seen_at) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'staffa', 'm1', now(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'adminb', 'm2', now(), now());

-- 1. El admin ve solo su establecimiento; el personal no ve nada; nadie escribe
do $$ declare n int; begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into n from staff_sessions;
  assert n = 1, format('admin A debe ver 1 y vio %s', n);
  begin insert into staff_sessions (tenant_id, profile_id, username, mac_hash, started_at, last_seen_at)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'x', 'm', now(), now());
    assert false, 'no debía poder insertar'; exception when insufficient_privilege then null; end;
  begin delete from staff_sessions; assert false, 'no debía poder borrar'; exception when insufficient_privilege then null; end;
  begin update staff_sessions set bytes = 1; assert false, 'no debía poder actualizar'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  select count(*) into n from staff_sessions;
  reset role;
  assert n = 0, format('el personal no debe ver el historial y vio %s', n);
end $$;

-- 2. No puede haber dos sesiones abiertas del mismo usuario y dispositivo
do $$ begin
  begin insert into staff_sessions (tenant_id, profile_id, username, mac_hash, started_at, last_seen_at)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'staffa', 'm1', now(), now());
    assert false, 'duplicado abierto'; exception when unique_violation then null; end;
end $$;

-- 3. Borrar a la persona borra su historial
delete from profiles where id = 'a0000000-0000-0000-0000-000000000002';
do $$ begin assert (select count(*) from staff_sessions where username = 'staffa') = 0, 'cascada por perfil'; end $$;
rollback;
select 'staff_rls OK' as resultado;
