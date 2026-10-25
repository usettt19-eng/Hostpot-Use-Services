-- Verificación del correo del visitante con un código de 6 dígitos (OTP) enviado por correo.
-- Se puede ejecutar más de una vez. Pégalo COMPLETO en el SQL Editor.
alter table guests add column if not exists email_verified_at timestamptz;

-- Códigos pendientes. Nunca se guarda el código: solo su HMAC. Sin políticas: solo el servidor (service role) lee y escribe.
create table if not exists guest_otps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email_hash text not null,
  code_hash text not null,
  attempts smallint not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists guest_otps_lookup on guest_otps (tenant_id, email_hash, created_at desc);
create index if not exists guest_otps_created on guest_otps (created_at);

alter table guest_otps enable row level security;
revoke all on guest_otps from anon, authenticated;
