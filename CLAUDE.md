# Portal de Red Escolar (multitenant)

Contexto del proyecto para Claude Code. Léelo completo antes de tocar código.

## Resumen
Portal web multitenant para escuelas. Cada escuela es un **tenant** aislado con RLS en Postgres. Los usuarios se registran, un administrador (directivo) los aprueba, y al aprobarlos se crea su usuario en el **Hotspot de un MikroTik** con un límite de ancho de banda según su rol. Incluye un panel de consumo.

## Stack
- Next.js 15 (App Router) + TypeScript
- Supabase (Auth + Postgres + RLS)
- MikroTik RouterOS v7 vía **REST API** (`/rest/...`, HTTPS, basic auth)
- Sin router configurado, la app funciona en **modo simulado** (mantener este comportamiento)

## Roles y estados
- `user_role`: `superadmin`, `director`, `staff`, `teacher`, `student`
- `account_status`: `pending` → `active` | `suspended`
- Admin = `superadmin` o `director` con `status = 'active'` (función SQL `is_admin()`)
- El usuario pide un rol (`requested_role`); el rol efectivo (`role`) lo fija el admin al aprobar.

## Esquema (supabase/migrations/0001_init.sql)
| Tabla | Propósito |
|---|---|
| `tenants` | Escuela. Incluye `slug` único y credenciales del router (`router_url`, `router_user`, `router_password`) |
| `profiles` | 1:1 con `auth.users`. `tenant_id`, `full_name`, `requested_role`, `role`, `status` |
| `bandwidth_profiles` | Un perfil por (tenant, rol): `download_kbps`, `upload_kbps`. Se siembra con un trigger al crear el tenant |
| `hotspot_users` | Usuario Hotspot ligado a un `profile`. `unique(tenant_id, username)`, `disabled` |
| `usage_stats` | Historial de bytes in/out por usuario (`recorded_at`) |

Helpers RLS: `current_tenant()` y `is_admin()` (ambas `security definer`).

Valores por defecto sembrados (kbps down/up): director 20480/10240, staff 10240/5120, teacher 10240/5120, student 2048/1024, superadmin 20480/10240.

## Flujos
1. **/register-school**: crea tenant + admin (director activo). Muestra el código/slug de la escuela.
2. **/register**: el usuario ingresa el slug, se crea `profiles` con `status = 'pending'`.
3. **Aprobación (admin)**: pasa a `active`, asigna `role`, crea el usuario en el router y la fila en `hotspot_users`.
4. **Ancho de banda**: al guardar un `bandwidth_profile`, sincronizar al `/ip/hotspot/user/profile` del router con `rate-limit` = `"{upload}k/{download}k"` (en RouterOS el formato es **rx/tx desde la perspectiva del router**, es decir upload/download del cliente; verificar contra el router real).
5. **Deshabilitar/quitar**: refleja el cambio en `/ip/hotspot/user` y en `hotspot_users`.
6. **Panel de consumo**: lee `/ip/hotspot/user` (bytes-in / bytes-out) y agrega por usuario y por rol.

## MikroTik (setup en el router)
```
/ip service set www-ssl disabled=no
/user group add name=portal policy=read,write,api,rest-api,test
/user add name=portal group=portal password=CAMBIAR
```
El router debe ser alcanzable desde el servidor del portal (VPN o IP pública restringida).

## Reglas para el código
- Todo acceso a datos del tenant va con el cliente Supabase del usuario (RLS activo). El **service role** solo en server-side (route handlers / server actions) para: registro público, aprobación, escritura de `usage_stats`, lectura de credenciales del router. Nunca exponerlo al cliente.
- Las llamadas al MikroTik se hacen solo desde el servidor. Aislar en un módulo (`lib/mikrotik.ts`) con modo simulado.
- No loguear contraseñas ni credenciales del router.
- Textos de UI en español.

## Seguridad (corregido en `0002_security.sql`)
1. Credenciales del router en `tenant_router_credentials` (RLS sin políticas, solo service role); la contraseña se cifra con AES-256-GCM (`lib/crypto.ts`, env `ROUTER_CRED_KEY`). Contraseñas previas en claro se descartan: re-ingresar.
2. `current_tenant()` exige `status = 'active'`; `tenant_select` deja a pendientes ver solo su propia escuela (ya sin datos sensibles).
3. La contraseña del Hotspot se muestra una sola vez al aprobar (o la define el admin); no se almacena. El rol efectivo ya no se autoasigna al registrarse: nace `student` y el admin lo fija al aprobar.
4. Sin políticas de insert en `profiles`/`tenants`/`usage_stats`, y `revoke insert, delete` para `anon`/`authenticated`.

## Pendiente antes de producción
- [x] Cifrar credenciales del router
- [x] Mostrar la contraseña del Hotspot al aprobar
- [ ] Tarea programada (cron / Supabase scheduled function) que guarde `usage_stats` periódicamente
- [ ] Validar el formato de `rate-limit` contra un router real
- [ ] Manejo de errores y timeouts del router (el portal no debe caerse si el router no responde)
- [ ] Tests de RLS (aislamiento entre tenants y entre roles)

## Puesta en marcha
1. Crear proyecto en Supabase y ejecutar `supabase/migrations/0001_init.sql`.
1b. Ejecutar también `0002_security.sql`.
2. Copiar `.env.example` a `.env.local` y completar claves.
3. `npm install && npm run dev`
4. Abrir `/register-school` para crear la escuela y su administrador.
5. En **Ancho de banda → Conexión al MikroTik** ingresar URL, usuario y contraseña.
