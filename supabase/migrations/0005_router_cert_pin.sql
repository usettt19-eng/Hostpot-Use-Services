-- Huella SHA-256 del certificado del router (para certificados autofirmados)
alter table tenant_router_credentials add column router_cert_fingerprint text;
