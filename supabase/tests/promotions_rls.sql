-- Pruebas de tenant_modules, promotions y promotion_events. Base de PRUEBAS con las migraciones 0001-0016. Termina en ROLLBACK.
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
insert into tenant_modules (tenant_id, module) values ('aaaaaaaa-0000-0000-0000-000000000000', 'promotions');
insert into promotions (id, tenant_id, name, status, content) values
  ('a1111111-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Promo A', 'active', '{"title":"A"}'),
  ('b1111111-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'Promo B', 'active', '{"title":"B"}');
insert into promotion_events (tenant_id, promotion_id, kind) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a1111111-0000-0000-0000-000000000000', 'impression'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a1111111-0000-0000-0000-000000000000', 'click'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b1111111-0000-0000-0000-000000000000', 'impression');

-- 1. El admin ve solo las campañas y eventos de su establecimiento; no escribe nada
do $$ declare n int; begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into n from promotions;
  assert n = 1, format('admin A debe ver 1 campaña y vio %s', n);
  select count(*) into n from promotion_events;
  assert n = 2, format('admin A debe ver 2 eventos y vio %s', n);
  begin insert into promotions (tenant_id, name, content) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x', '{}');
    assert false, 'no debía poder insertar campañas'; exception when insufficient_privilege then null; end;
  begin update promotions set status = 'paused'; assert false, 'no debía poder actualizar'; exception when insufficient_privilege then null; end;
  begin delete from promotions; assert false, 'no debía poder borrar'; exception when insufficient_privilege then null; end;
  begin insert into promotion_events (tenant_id, promotion_id, kind) values ('aaaaaaaa-0000-0000-0000-000000000000', 'a1111111-0000-0000-0000-000000000000', 'click');
    assert false, 'no debía poder inflar los contadores'; exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- 2. El personal sin rol de administrador no ve nada
do $$ declare n int; begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  select count(*) into n from promotions; assert n = 0, 'el personal no debe ver campañas';
  select count(*) into n from promotion_events; assert n = 0, 'el personal no debe ver eventos';
  reset role;
end $$;

-- 3. El otro establecimiento solo ve lo suyo
do $$ declare n int; begin
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into n from promotions; assert n = 1, 'admin B debe ver solo su campaña';
  select count(*) into n from promotions where name = 'Promo A'; assert n = 0, 'admin B no debe ver la de A';
  reset role;
end $$;

-- 4. Los módulos no los lee ni los cambia nadie con sesión: solo el servidor
do $$ begin
  set local role authenticated;
  begin perform 1 from tenant_modules; assert false, 'no debía poder leer tenant_modules'; exception when insufficient_privilege then null; end;
  begin insert into tenant_modules (tenant_id, module) values ('bbbbbbbb-0000-0000-0000-000000000000', 'promotions');
    assert false, 'un admin no debe activarse módulos'; exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin perform 1 from promotions; assert false, 'anon no debía leer'; exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- 5. Restricciones
do $$ begin
  begin insert into promotions (tenant_id, name, segment, content) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x', 'todos', '{}');
    assert false, 'segmento inválido'; exception when check_violation then null; end;
  begin insert into promotions (tenant_id, name, status, content) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x', 'borrada', '{}');
    assert false, 'estado inválido'; exception when check_violation then null; end;
  begin insert into promotions (tenant_id, name, inactive_days, content) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x', 3, '{}');
    assert false, 'ausencia menor de 7 días'; exception when check_violation then null; end;
  begin insert into promotions (tenant_id, name, content, starts_at, ends_at) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x', '{}', now(), now() - interval '1 day');
    assert false, 'fin antes que inicio'; exception when check_violation then null; end;
  begin insert into promotions (tenant_id, name, content) values ('aaaaaaaa-0000-0000-0000-000000000000', repeat('x', 81), '{}');
    assert false, 'nombre largo'; exception when check_violation then null; end;
  begin insert into promotion_events (tenant_id, promotion_id, kind) values ('aaaaaaaa-0000-0000-0000-000000000000', 'a1111111-0000-0000-0000-000000000000', 'view');
    assert false, 'tipo de evento inválido'; exception when check_violation then null; end;
  begin insert into tenant_modules (tenant_id, module) values ('bbbbbbbb-0000-0000-0000-000000000000', 'Promo; drop');
    assert false, 'nombre de módulo inválido'; exception when check_violation then null; end;
  begin insert into tenant_modules (tenant_id, module) values ('aaaaaaaa-0000-0000-0000-000000000000', 'promotions');
    assert false, 'módulo repetido'; exception when unique_violation then null; end;
end $$;

-- 6. Borrar una campaña borra sus contadores; borrar el establecimiento borra campañas y módulos
do $$ declare n int; begin
  delete from promotions where id = 'a1111111-0000-0000-0000-000000000000';
  select count(*) into n from promotion_events where promotion_id = 'a1111111-0000-0000-0000-000000000000';
  assert n = 0, 'los eventos debían borrarse en cascada';
  delete from tenants where id = 'aaaaaaaa-0000-0000-0000-000000000000';
  select count(*) into n from tenant_modules where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000';
  assert n = 0, 'los módulos debían borrarse en cascada';
end $$;
rollback;
select 'promotions_rls OK' as resultado;
