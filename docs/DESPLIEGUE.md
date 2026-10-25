# Despliegue en el servidor (Docker + nginx + Supabase en la nube)

## 1. Supabase (nube)
1. Crea el proyecto y, en el SQL Editor, ejecuta **cada archivo por separado y en orden**: `0001_init.sql`, `0002_security.sql`, `0003_roles_enum.sql`, `0004_establishment_types.sql`, `0005_router_cert_pin.sql` y `0006_portal_customization.sql` (también crea el bucket privado `portal-assets`) y `0007_guests.sql` (invitados, consentimientos y sesiones).
2. En Project Settings → API copia: URL, `anon` key y `service_role` key.

## 2. Servidor
```bash
git clone <URL-DEL-REPO> /opt/hotspot-portal && cd /opt/hotspot-portal
git checkout claude/new-session-pz8j6q   # o la rama que uses

cat > .env <<ENV
NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ROUTER_CRED_KEY=$(openssl rand -base64 32)
ENV
chmod 600 .env        # guarda ROUTER_CRED_KEY en un lugar seguro: sin ella no se descifran las contraseñas del router

docker compose up -d --build
curl -I http://127.0.0.1:8120/login     # debe responder 200
```
El puerto queda solo en `127.0.0.1:8120`.

## 3. nginx + HTTPS
```bash
sudo cp deploy/nginx-hotspot-portal.conf /etc/nginx/sites-available/hotspot-portal
sudo ln -s /etc/nginx/sites-available/hotspot-portal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d connect.useservices.company    # instala certbot si falta: sudo apt install certbot python3-certbot-nginx
```
El registro DNS (A) del subdominio debe apuntar a la IP del servidor antes de correr certbot.

## 3b. Proceso periódico de invitados
Cierra las sesiones terminadas y borra los usuarios temporales en el router, sin que nadie tenga que abrir **Visitantes**.
1. Genera un secreto y añádelo al `.env` del servidor (no lo pegues en ningún chat):
   ```bash
   echo "CRON_SECRET=$(openssl rand -hex 32)" >> /opt/hotspot-portal/.env
   cd /opt/hotspot-portal && docker compose up -d --build
   ```
2. Programa la tarea cada minuto:
   ```bash
   (crontab -l 2>/dev/null; echo '* * * * * . /opt/hotspot-portal/.env && curl -fsS -m 50 -H "Authorization: Bearer $CRON_SECRET" https://connect.useservices.company/api/cron/guests-sync >/dev/null 2>&1') | crontab -
   ```
3. Comprueba: `curl -s -o /dev/null -w "%{http_code}\n" https://connect.useservices.company/api/cron/guests-sync` debe dar `401` (sin secreto). Tras un minuto, `grep guests-sync /var/log/syslog` no muestra nada: el proceso es silencioso si todo va bien.

Sin el secreto la ruta responde 401. El valor del `.env` no debe ir al repositorio ni al chat.

## 4. Actualizar
```bash
cd /opt/hotspot-portal && git pull && docker compose up -d --build
```

## 5. MikroTik (túnel WireGuard + REST)
Ejecuta también `supabase/migrations/0005_router_cert_pin.sql` (columna para la huella del certificado).

**Servidor** (`/etc/wireguard/wg-portal.conf`, interfaz `wg-portal`, IP `10.99.0.1/24`, UDP 51820) y **router** (interfaz `wg-portal`, IP `10.99.0.2/24`, el router inicia la conexión con `persistent-keepalive=25s`). Ver la guía de comandos en el historial del proyecto o repítelos con tus claves.

En el router: usuario `portal` (grupo `portal`: `read,write,api,rest-api,test`) restringido a `address=10.99.0.1/32`, `www-ssl` activo con certificado propio (`portal`, firmado por `portal-ca`, `subject-alt-name=IP:10.99.0.2`) y `address=10.99.0.1/32`.

Prueba desde el servidor:
```bash
curl -sSk -m 8 -u 'portal:CLAVE' https://10.99.0.2/rest/system/identity
```

**Huella del certificado** (se pega en el portal porque es autofirmado):
```bash
openssl s_client -connect 10.99.0.2:443 </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256
```

**En el portal** → `/platform` → Configurar router → Conexión del portal con el router: URL `https://10.99.0.2`, usuario `portal`, la huella SHA-256 y la contraseña.
Si cambias o renuevas el certificado del router, actualiza la huella.

## Correo de salida (códigos de verificación del WiFi)
El portal envía por SMTP el código de 6 dígitos. Sirve cualquier proveedor SMTP (el del dominio, Brevo, Resend, SES, Gmail con clave de aplicación).
1. Añade al `.env` del servidor (`nano /opt/hotspot-portal/.env`; no pegues estos valores en ningún chat):
   ```
   SMTP_URL=smtps://USUARIO:CLAVE@SERVIDOR:465
   MAIL_FROM="Connect Wifi <no-responder@tu-dominio.com>"
   ```
   Si el usuario o la clave tienen símbolos (`@`, `:`, `/`, `#`, `%`…), se codifican para URL (`@` = `%40`, `:` = `%3A`, `/` = `%2F`, `#` = `%23`, `%` = `%25`). Puerto 465 = `smtps://`; puerto 587 = `smtp://` (STARTTLS).
2. Recrea el contenedor para que lea el `.env`: `cd /opt/hotspot-portal && docker compose up -d --force-recreate`. `docker-compose.yml` ya pasa `SMTP_URL` y `MAIL_FROM` al contenedor.
3. `/platform` debe mostrar «Correo de envío: configurado».
4. Para que los correos no caigan en spam, el dominio del remitente debe tener SPF, DKIM y DMARC (el proveedor da los registros DNS que hay que crear).
