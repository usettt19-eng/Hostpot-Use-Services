# Despliegue en el servidor (Docker + nginx + Supabase en la nube)

## 1. Supabase (nube)
1. Crea el proyecto y, en el SQL Editor, ejecuta **cada archivo por separado y en orden**: `0001_init.sql`, `0002_security.sql`, `0003_roles_enum.sql`, `0004_establishment_types.sql`.
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

## 4. Actualizar
```bash
cd /opt/hotspot-portal && git pull && docker compose up -d --build
```

## 5. MikroTik
Pendiente de definir cómo llega el servidor al router (WireGuard, IP pública restringida o misma red). Prueba desde el servidor:
`curl -sSk -m 5 -o /dev/null -w "%{http_code}\n" https://IP-ROUTER/rest/system/identity` (un `401` es buena señal). Luego configura la conexión en **Ancho de banda → Conexión al MikroTik**.
