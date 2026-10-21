-- Pruebas de aislamiento y de publicación del portal. Ejecutar en una base de PRUEBAS con las migraciones 0001-0006.
-- Todo ocurre dentro de una transacción que termina en ROLLBACK.
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
insert into portal_versions (tenant_id, version, status, settings, terms_version) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 1, 'published', '{"terms":{"es":"t1"}}', 1),
  ('aaaaaaaa-0000-0000-0000-000000000000', 2, 'draft',     '{"terms":{"es":"t1"}}', 1),
  ('bbbbbbbb-0000-0000-0000-000000000000', 1, 'published', '{"terms":{"es":"b"}}', 1);

-- 1. Un admin solo ve las versiones de su establecimiento
do $$ declare n int; m int; begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into n from portal_versions;
  select count(*) into m from portal_versions where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000000';
  reset role;
  assert n = 2, 'admin A debe ver 2 versiones, vio ' || n;
  assert m = 0, 'admin A no debe ver las de B';
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into n from portal_versions;
  reset role;
  assert n = 1, 'admin B debe ver 1 versión, vio ' || n;
end $$;

-- 2. Un usuario que no es admin no ve nada
do $$ declare n int; begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  select count(*) into n from portal_versions;
  reset role;
  assert n = 0, 'un empleado no debe ver versiones del portal, vio ' || n;
end $$;

-- 3. Un admin NO puede escribir directamente (solo el servidor con service role)
do $$ begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin
    insert into portal_versions (tenant_id, version, status, settings)
      values ('aaaaaaaa-0000-0000-0000-000000000000', 9, 'draft', '{}');
    reset role; raise exception 'FALLO: un admin pudo insertar';
  exception when insufficient_privilege then reset role; end;
  set local role authenticated;
  begin
    update portal_versions set settings = '{}';
    reset role; raise exception 'FALLO: un admin pudo actualizar';
  exception when insufficient_privilege then reset role; end;
  set local role authenticated;
  begin
    delete from portal_versions;
    reset role; raise exception 'FALLO: un admin pudo borrar';
  exception when insufficient_privilege then reset role; end;
end $$;

-- 4. anon no puede leer ni ejecutar la publicación
do $$ begin
  set local role anon;
  begin
    perform count(*) from portal_versions;
    reset role; raise exception 'FALLO: anon pudo leer';
  exception when insufficient_privilege then reset role; end;
  set local role anon;
  begin
    perform publish_portal_version('aaaaaaaa-0000-0000-0000-000000000000', 2);
    reset role; raise exception 'FALLO: anon pudo publicar';
  exception when insufficient_privilege then reset role; end;
end $$;

-- 5. Un admin tampoco puede llamar a publish_portal_version
do $$ begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin
    perform publish_portal_version('aaaaaaaa-0000-0000-0000-000000000000', 2);
    reset role; raise exception 'FALLO: un admin pudo publicar por RPC';
  exception when insufficient_privilege then reset role; end;
end $$;

-- 6. Publicación (service role): archiva, publica y calcula la versión de términos
do $$ declare r record; begin
  set local role service_role;
  -- mismos términos: la versión de términos no sube
  perform publish_portal_version('aaaaaaaa-0000-0000-0000-000000000000', 2);
  select status, terms_version into r from portal_versions where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and version = 2;
  assert r.status = 'published' and r.terms_version = 1, 'v2 debe quedar publicada con términos v1';
  select status into r from portal_versions where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and version = 1;
  assert r.status = 'archived', 'v1 debe quedar archivada';

  -- términos distintos: la versión de términos sube
  insert into portal_versions (tenant_id, version, status, settings)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 3, 'draft', '{"terms":{"es":"t2 nuevo"}}');
  perform publish_portal_version('aaaaaaaa-0000-0000-0000-000000000000', 3);
  select terms_version into r from portal_versions where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and version = 3;
  assert r.terms_version = 2, 'los términos cambiaron: debe ser v2, es ' || r.terms_version;

  -- primer portal publicado de otro establecimiento mantiene términos v1 y no toca al otro tenant
  select count(*) filter (where status = 'published') into r from portal_versions where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000';
  assert r.count = 1, 'solo una versión publicada por establecimiento';
  select status into r from portal_versions where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000000' and version = 1;
  assert r.status = 'published', 'publicar en A no debe tocar a B';

  -- no se publica una versión inexistente ni una ya publicada
  begin
    perform publish_portal_version('aaaaaaaa-0000-0000-0000-000000000000', 99);
    raise exception 'FALLO: publicó una versión inexistente';
  exception when raise_exception then
    assert sqlerrm like '%no es un borrador%', 'mensaje inesperado: ' || sqlerrm;
  end;
  reset role;
end $$;

-- 7. Solo un borrador por establecimiento
do $$ begin
  insert into portal_versions (tenant_id, version, status, settings)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 4, 'draft', '{}');
  begin
    insert into portal_versions (tenant_id, version, status, settings)
      values ('aaaaaaaa-0000-0000-0000-000000000000', 5, 'draft', '{}');
    raise exception 'FALLO: dos borradores en el mismo establecimiento';
  exception when unique_violation then null; end;
end $$;

-- 8. El bucket privado existe
do $$ begin
  assert exists (select 1 from storage.buckets where id = 'portal-assets' and public = false), 'falta el bucket privado portal-assets';
end $$;

select 'TODAS LAS PRUEBAS DE PORTAL PASARON' as resultado;
rollback;
