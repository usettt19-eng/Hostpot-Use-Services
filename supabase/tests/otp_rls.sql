-- Pruebas de guest_otps y guests.email_verified_at. Base de PRUEBAS con las migraciones 0001-0017. Termina en ROLLBACK.
begin;
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin-a@test'),
  ('b0000000-0000-0000-0000-000000000001', 'admin-b@test');
insert into tenants (id, name, slug, type) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Cafe A', 'cafe-a', 'restaurant'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Colegio B', 'colegio-b', 'school');
insert into profiles (id, tenant_id, full_name, requested_role, role, status) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Admin A', 'manager', 'superadmin', 'active'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Admin B', 'director', 'superadmin', 'active');
insert into guests (id, tenant_id, email_hash, email_enc, email_verified_at) values
  ('a2222222-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'ha', 'ea', now()),
  ('a3333333-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'hb', 'eb', null),
  ('b2222222-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'hc', 'ec', now());
insert into guest_otps (tenant_id, email_hash, code_hash, expires_at) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'ha', 'x', now() + interval '10 minutes');

-- 1. Los códigos no los lee ni escribe nadie con sesión: ni el administrador del propio establecimiento
do $$ begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin perform 1 from guest_otps; assert false, 'el admin no debía leer los códigos'; exception when insufficient_privilege then null; end;
  begin insert into guest_otps (tenant_id, email_hash, code_hash, expires_at) values ('aaaaaaaa-0000-0000-0000-000000000000', 'z', 'z', now());
    assert false, 'no debía poder insertar códigos'; exception when insufficient_privilege then null; end;
  begin update guest_otps set attempts = 0; assert false, 'no debía poder reiniciar intentos'; exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin perform 1 from guest_otps; assert false, 'anon no debía leer'; exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- 2. El admin ve la marca de verificación solo de sus visitantes
do $$ declare n int; v int; begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*), count(email_verified_at) into n, v from guests;
  assert n = 2 and v = 1, format('admin A debe ver 2 visitantes (1 verificado) y vio %s (%s)', n, v);
  begin update guests set email_verified_at = null; assert false, 'el admin no debía poder cambiar la verificación'; exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- 3. Restricciones y limpieza
do $$ declare n int; begin
  begin insert into guest_otps (tenant_id, email_hash, code_hash) values ('aaaaaaaa-0000-0000-0000-000000000000', 'z', 'z');
    assert false, 'falta la fecha de vencimiento'; exception when not_null_violation then null; end;
  delete from guest_otps where created_at < now() - interval '1 day';
  select count(*) into n from guest_otps; assert n = 1, 'la limpieza no debía borrar el código reciente';
  delete from tenants where id = 'aaaaaaaa-0000-0000-0000-000000000000';
  select count(*) into n from guest_otps; assert n = 0, 'los códigos debían borrarse en cascada con el establecimiento';
end $$;
rollback;
select 'otp_rls OK' as resultado;
