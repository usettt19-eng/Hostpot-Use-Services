-- Pruebas de aislamiento de invitados, consentimientos y sesiones. Base de PRUEBAS con las migraciones 0001-0007.
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

insert into guests (id, tenant_id, email_hash, email_enc) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'h1', 'enc1'),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'h2', 'enc2'),
  ('22222222-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'h1', 'enc3'); -- mismo hash en otro establecimiento: permitido
insert into guest_consents (tenant_id, guest_id, kind, granted, text_version) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000001', 'terms', true, 1),
  ('bbbbbbbb-0000-0000-0000-000000000000', '22222222-0000-0000-0000-000000000001', 'terms', true, 1);
insert into guest_sessions (tenant_id, guest_id, hotspot_username, mac_hmac, ip) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000001', 'g_aaaa', 'm1', '192.168.200.5'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '22222222-0000-0000-0000-000000000001', 'g_bbbb', 'm2', '192.168.200.6');

-- 1. Cada admin ve solo lo de su establecimiento
do $$ declare g int; c int; s int; begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into g from guests;
  select count(*) into c from guest_consents;
  select count(*) into s from guest_sessions;
  reset role;
  assert g = 2 and c = 1 and s = 1, format('admin A debe ver 2/1/1 y vio %s/%s/%s', g, c, s);
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into g from guests;
  select count(*) into c from guest_consents;
  select count(*) into s from guest_sessions;
  reset role;
  assert g = 1 and c = 1 and s = 1, format('admin B debe ver 1/1/1 y vio %s/%s/%s', g, c, s);
end $$;

-- 2. Quien no es administrador no ve nada
do $$ declare g int; s int; begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  select count(*) into g from guests;
  select count(*) into s from guest_sessions;
  reset role;
  assert g = 0 and s = 0, 'un empleado no debe ver invitados ni sesiones';
end $$;

-- 3. Nadie escribe desde el cliente (ni admin ni anon)
do $$ begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  for i in 1..3 loop
    set local role authenticated;
    begin
      if i = 1 then
        insert into guests (tenant_id, email_hash, email_enc) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x', 'x');
      elsif i = 2 then
        update guests set full_name = 'hack';
      else
        delete from guest_sessions;
      end if;
      reset role; raise exception 'FALLO: un admin pudo escribir (caso %)', i;
    exception when insufficient_privilege then reset role; end;
  end loop;
  set local role anon;
  begin
    perform count(*) from guests;
    reset role; raise exception 'FALLO: anon pudo leer invitados';
  exception when insufficient_privilege then reset role; end;
end $$;

-- 4. El servidor (service role) sí escribe, y las restricciones se cumplen
do $$ begin
  set local role service_role;
  insert into guests (tenant_id, email_hash, email_enc) values ('aaaaaaaa-0000-0000-0000-000000000000', 'nuevo', 'enc');
  -- el mismo correo (hash) en el mismo establecimiento no se duplica
  begin
    insert into guests (tenant_id, email_hash, email_enc) values ('aaaaaaaa-0000-0000-0000-000000000000', 'nuevo', 'enc');
    raise exception 'FALLO: correo duplicado en el mismo establecimiento';
  exception when unique_violation then null; end;
  -- el nombre de usuario temporal es único por establecimiento
  begin
    insert into guest_sessions (tenant_id, guest_id, hotspot_username, mac_hmac)
      values ('aaaaaaaa-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000001', 'g_aaaa', 'm');
    raise exception 'FALLO: usuario temporal duplicado';
  exception when unique_violation then null; end;
  -- estados y tipos inválidos
  begin
    insert into guest_sessions (tenant_id, guest_id, hotspot_username, mac_hmac, status)
      values ('aaaaaaaa-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000001', 'g_zzzz', 'm', 'raro');
    raise exception 'FALLO: estado inválido aceptado';
  exception when check_violation then null; end;
  begin
    insert into guest_consents (tenant_id, guest_id, kind, granted)
      values ('aaaaaaaa-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000001', 'otro', true);
    raise exception 'FALLO: tipo de consentimiento inválido aceptado';
  exception when check_violation then null; end;
  reset role;
end $$;

-- 5. Derecho de supresión: borrar al invitado borra sus consentimientos y sesiones, y nada más
do $$ declare c int; s int; other int; begin
  delete from guests where id = '11111111-0000-0000-0000-000000000001';
  select count(*) into c from guest_consents where guest_id = '11111111-0000-0000-0000-000000000001';
  select count(*) into s from guest_sessions where guest_id = '11111111-0000-0000-0000-000000000001';
  select count(*) into other from guest_sessions where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000000';
  assert c = 0 and s = 0, 'la supresión debe borrar consentimientos y sesiones del invitado';
  assert other = 1, 'la supresión no debe tocar a otro establecimiento';
end $$;

select 'TODAS LAS PRUEBAS DE INVITADOS PASARON' as resultado;
rollback;
