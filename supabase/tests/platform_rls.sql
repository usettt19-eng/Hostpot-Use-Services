-- Pruebas de tenant_suspensions. Base de PRUEBAS con las migraciones 0001-0010. Termina en ROLLBACK.
begin;
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin-a@test');
insert into tenants (id, name, slug, type) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Cafe A', 'cafe-a', 'restaurant');
insert into profiles (id, tenant_id, full_name, requested_role, role, status) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Admin A', 'manager', 'superadmin', 'active');
insert into tenant_suspensions (tenant_id, reason) values ('aaaaaaaa-0000-0000-0000-000000000000', 'prueba');

-- 1. Ni el admin del establecimiento suspendido puede leer ni escribir la tabla
do $$ declare n int; begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin select count(*) into n from tenant_suspensions; assert false, 'no debía poder leer';
  exception when insufficient_privilege then null; end;
  begin delete from tenant_suspensions; assert false, 'no debía poder borrar';
  exception when insufficient_privilege then null; end;
  begin insert into tenant_suspensions (tenant_id) values ('aaaaaaaa-0000-0000-0000-000000000000'); assert false, 'no debía poder insertar';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- 2. anon tampoco
do $$ begin
  set local role anon;
  begin perform 1 from tenant_suspensions; assert false, 'anon no debía leer';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- 3. Borrar el establecimiento borra su suspensión
delete from tenants where id = 'aaaaaaaa-0000-0000-0000-000000000000';
do $$ begin assert (select count(*) from tenant_suspensions) = 0, 'la suspensión debe borrarse en cascada'; end $$;
rollback;
select 'platform_rls OK' as resultado;
