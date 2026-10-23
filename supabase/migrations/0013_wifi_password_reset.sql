-- Constancia de cuándo y quién restableció la contraseña del WiFi de un usuario (la contraseña no se guarda).
alter table hotspot_users add column if not exists password_reset_at timestamptz;
alter table hotspot_users add column if not exists password_reset_by uuid references auth.users(id) on delete set null;
