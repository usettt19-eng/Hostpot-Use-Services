# Revisión del servidor (`use-services2026`)

Basada en la salida de los comandos de diagnóstico. No se tiene acceso directo al servidor.

## Resumen
El servidor sirve para alojar el portal, con Docker y nginx ya instalados. Los puntos a resolver son el alcance al MikroTik, un puerto y un subdominio libres, y la exposición de varios puertos a internet.

## Recursos
| Elemento | Valor | Comentario |
|---|---|---|
| SO | Ubuntu 22.04.5 LTS (kernel 5.15) | OK |
| CPU | 4 núcleos | Suficiente |
| RAM | 15 GiB, ~8.7 GiB disponibles | OK. Hoy hay ~30 contenedores; el portal es liviano (~200-300 MB) |
| Disco | 120 GB, 39 GB libres (67 % usado) | OK, pero conviene vigilarlo (hay 2 stacks de Supabase y Nextcloud) |

## Software instalado
Docker 29.5.2, Docker Compose v5.1.4, Node 20.20.2, npm 10.8.2, nginx 1.18.0 y git 2.34.1. No tiene Caddy y no hace falta: se usa el nginx existente.

## Puertos ocupados
80 y 443 (nginx), 22 (ssh), 3000, 3001, 3002, 3003, 3004, 3010, 5432, 5433, 6543, 6544, 8000, 8010, 8081, 8090, 8095, 8096, 8097, 8098, 8110, 8443.

**Puerto propuesto para el portal: `127.0.0.1:8120`** (libre, solo local, detrás de nginx).

## Hallazgos de seguridad (ya existentes, ajenos al portal)
1. **`ufw` está inactivo.**
2. **Varios contenedores publican en `0.0.0.0` (todo internet):**
   - `5432` y `6543` (Supavisor / Postgres de `supabase-*`) y `5433` / `6544` (`sfsmpickup-*`): son bases de datos expuestas.
   - `8000` / `8443` (Kong) y `8010` (Envoy): son las APIs de Supabase, normal si van detrás de nginx, pero se pueden alcanzar directo.
   - `3000`, `3001`, `3002`, `3010` y `8096`: apps que ya tienen nginx por delante.
3. Docker salta las reglas de `ufw`, así que activar `ufw` no basta. Hay que cerrar los puertos con `127.0.0.1:PUERTO:PUERTO` en cada compose, o con reglas en la cadena `DOCKER-USER`.
4. Prioridad: lo que no necesite acceso externo directo (sobre todo 5432, 5433, 6543, 6544) debería quedar en `127.0.0.1`. Esto afecta a otras apps: revisar con cuidado antes de cambiarlo.

## Pendientes de verificar (el comando usó marcadores)
La prueba de red falló solo porque se dejaron `TU-PROYECTO` e `IP-DEL-ROUTER` sin reemplazar. Hay que repetirla con los valores reales:

```bash
curl -sS -o /dev/null -w "supabase: %{http_code}\n" https://<URL-DE-SUPABASE>/rest/v1/
curl -sSk -m 5 -o /dev/null -w "router: %{http_code}\n" https://<IP-DEL-ROUTER>/rest/system/identity
```
Un `401` de Supabase y un `401` del router son respuestas buenas: significan que se llega al servicio.

## Decisiones necesarias
1. **¿Qué Supabase usar?** Hay dos opciones:
   - Un **proyecto en la nube** (aislado de las otras apps; es lo que recomiendo).
   - Uno de los **Supabase self-hosted** del servidor (`supabase-*` o `sfsmpickup-*`). Compartiría base de datos con otras apps, y habría que correr ahí las migraciones `0001` a `0004`.
2. **Dominio o subdominio** para el portal (ej. `wifi.tudominio.com`), apuntando a la IP del servidor.
3. **Acceso al MikroTik:** IP del router y cómo llega el servidor a él (VPN WireGuard, IP pública restringida o misma red).
   - `www-ssl` con certificado autofirmado hará fallar `fetch`. Hay que usar un certificado válido o ajustar `lib/mikrotik.ts`.

## Plan de despliegue
1. Agregar al repo: `Dockerfile` (Next.js `output: "standalone"`), `docker-compose.yml` con `127.0.0.1:8120:3000` y `.env.production` de ejemplo. Las `NEXT_PUBLIC_*` se incrustan al compilar, por lo que van como `build args`.
2. Crear un server block de nginx para el subdominio con proxy a `127.0.0.1:8120`, y certificado con `certbot`.
3. Variables de entorno en el servidor: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `ROUTER_CRED_KEY` (`openssl rand -base64 32`). No van al repositorio.
4. Configurar el acceso al MikroTik y probar en **Ancho de banda → Conexión al MikroTik**.
5. Opcional: monitor en Uptime Kuma (ya está instalado en el puerto 3010).
