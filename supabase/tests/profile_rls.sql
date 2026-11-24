-- Pruebas de guests.profile y promotions.audience. Base de PRUEBAS con las migraciones 0001-0018. Termina en ROLLBACK.
begin;
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin-a@test'),
  ('b0000000-0000-0000-0000-000000000001', 'admin-b@test');
insert into tenants (id, name, slug, type) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Cafe A', 'cafe-a', 'restaurant'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Bar B', 'bar-b', 'pub');
insert into profiles (id, tenant_id, full_name, requested_role, role, status) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Admin A', 'manager', 'superadmin', 'active'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Admin B', 'manager', 'superadmin', 'active');
insert into guests (id, tenant_id, email_hash, email_enc, profile) values
  ('a2222222-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'ha', 'ea', '{"residence":"resident"}'),
  ('a3333333-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'hb', 'eb', default),
  ('b2222222-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'hc', 'ec', '{"residence":"foreign"}');
insert into promotions (id, tenant_id, name, content, audience) values
  ('a1111111-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Para residentes', '{"title":"x"}', '{"q":"residence","in":["resident"]}'),
  ('a1111112-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Para todos', '{"title":"x"}', null);

-- 1. Por defecto no hay respuestas, y el admin ve solo las respuestas de sus visitantes
do $$ declare n int; p jsonb; begin
  select profile into p from guests where id = 'a3333333-0000-0000-0000-000000000000';
  assert p = '{}'::jsonb, 'el perfil por defecto debe ser un objeto vacío';
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into n from guests where profile ? 'residence';
  assert n = 1, format('admin A debe ver 1 respuesta suya y vio %s', n);
  select count(*) into n from guests; assert n = 2, 'admin A solo ve sus 2 visitantes';
  select count(*) into n from promotions where audience is not null; assert n = 1, 've el público de sus campañas';
  reset role;
end $$;

-- 2. Nadie con sesión escribe respuestas ni públicos
do $$ begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin update guests set profile = '{"residence":"foreign"}'; assert false, 'un admin no debía poder editar respuestas'; exception when insufficient_privilege then null; end;
  begin update promotions set audience = null; assert false, 'un admin no debía poder cambiar el público'; exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin perform 1 from guests; assert false, 'anon no debía leer'; exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- 3. Restricciones de forma
do $$ begin
  begin update guests set profile = '[]'::jsonb where id = 'a2222222-0000-0000-0000-000000000000';
    assert false, 'el perfil debe ser un objeto'; exception when check_violation then null; end;
  begin update guests set profile = '"resident"'::jsonb where id = 'a2222222-0000-0000-0000-000000000000';
    assert false, 'el perfil no puede ser un texto'; exception when check_violation then null; end;
  begin update promotions set audience = '{"q":"residence"}' where id = 'a1111111-0000-0000-0000-000000000000';
    assert false, 'el público necesita las respuestas'; exception when check_violation then null; end;
  begin update promotions set audience = '{"q":"residence","in":"resident"}' where id = 'a1111111-0000-0000-0000-000000000000';
    assert false, 'las respuestas del público deben ser una lista'; exception when check_violation then null; end;
  begin update promotions set audience = '[]' where id = 'a1111111-0000-0000-0000-000000000000';
    assert false, 'el público debe ser un objeto'; exception when check_violation then null; end;
end $$;

-- 4. Se borran con el visitante
do $$ declare n int; begin
  delete from guests where id = 'a2222222-0000-0000-0000-000000000000';
  select count(*) into n from guests where profile ? 'residence' and tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000';
  assert n = 0, 'las respuestas debían borrarse con el visitante';
end $$;
rollback;
select 'profile_rls OK' as resultado;
