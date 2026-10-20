-- Nuevos roles para establecimientos comerciales.
-- Va en un archivo aparte: Postgres no permite usar un valor de enum en la misma transacción que lo agrega.
alter type user_role add value if not exists 'manager';
alter type user_role add value if not exists 'employee';
alter type user_role add value if not exists 'customer';
alter type user_role add value if not exists 'guest';
