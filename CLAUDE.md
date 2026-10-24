# Portal de Red WiFi multitenant (escuelas, restaurantes, pubs, hoteles)

Contexto del proyecto para Claude Code. Léelo completo antes de tocar código.

> **Regla de trabajo.** Al empezar cualquier sesión, lee también `docs/AVANCES.md`: es la bitácora con el estado real (qué está desplegado, qué migraciones están aplicadas, pendientes y decisiones). Al terminar **cada** cambio, actualízala (estado, pendientes y la tabla de registro) en el mismo commit. Si lo que ves en el repo contradice la bitácora, corrígela. Nunca escribas claves ni contraseñas en ella.

## Resumen
Portal web multitenant para establecimientos (escuelas, restaurantes, pubs, hoteles). Cada establecimiento es un **tenant** aislado con RLS en Postgres. Los usuarios se registran, un administrador (directivo) los aprueba, y al aprobarlos se crea su usuario en el **Hotspot de un MikroTik** con un límite de ancho de banda según su rol. Incluye un panel de consumo.

## Stack
- Next.js 15 (App Router) + TypeScript
- Supabase (Auth + Postgres + RLS)
- MikroTik RouterOS v7 vía **REST API** (`/rest/...`, HTTPS, basic auth)
- Sin router configurado, la app funciona en **modo simulado** (mantener este comportamiento)

## Tipos de establecimiento y roles
`tenants.type` (`establishment_type`): `school`, `restaurant`, `pub`, `hotel`. Se elige al crear el establecimiento en `/platform`. Los roles disponibles dependen del tipo (`lib/roles.ts`, `ROLES_BY_TYPE`; validado en server actions):
| Tipo | Roles (además de `superadmin` fundador) |
|---|---|
| school | director, staff, teacher, student |
| restaurant / pub | manager, employee, customer |
| hotel | manager, employee, guest |
Administradores: `superadmin`, `director`, `manager` (`ADMIN_ROLES` / `is_admin()`). El trigger siembra anchos de banda según el tipo. Migraciones `0003` (valores de enum) y `0004` (tipo + trigger) deben ir por separado y en orden.

## Roles y estados
- `user_role`: `superadmin`, `director`, `staff`, `teacher`, `student`, `manager`, `employee`, `customer`, `guest`
- `account_status`: `pending` → `active` | `suspended`
- Admin = `superadmin`, `director` o `manager` con `status = 'active'` (función SQL `is_admin()`)
- El usuario pide un rol (`requested_role`); el rol efectivo (`role`) lo fija el admin al aprobar.

## Esquema (supabase/migrations/0001_init.sql)
| Tabla | Propósito |
|---|---|
| `tenants` | Establecimiento: `name`, `slug` único, `type`. Las credenciales del router viven en `tenant_router_credentials` (solo service role) |
| `profiles` | 1:1 con `auth.users`. `tenant_id`, `full_name`, `requested_role`, `role`, `status` |
| `bandwidth_profiles` | Un perfil por (tenant, rol): `download_kbps`, `upload_kbps`, `max_devices` (dispositivos a la vez, `shared-users` en el Hotspot; personal y administradores 2, el resto 1). Se siembra con un trigger al crear el tenant |
| `hotspot_users` | Usuario Hotspot ligado a un `profile`. `unique(tenant_id, username)`, `disabled` |
| `usage_stats` | Historial de bytes in/out por usuario (`recorded_at`) |
| `guests`, `guest_consents`, `guest_sessions` | Invitados del portal cautivo: personas (correo y teléfono cifrados + hash de búsqueda), consentimientos (términos con versión, promociones) y sesiones de WiFi (MAC solo como hash). Solo escribe el servidor; los admins leen por RLS |
| `staff_sessions` | Historial de conexiones de los usuarios del portal (una fila por usuario y dispositivo; MAC solo como hash). Escribe el servidor (cron y al abrir `/admin/staff-history`); los admins leen por RLS; se borra a los 90 días |
| `portal_versions` | Personalización del portal del invitado por establecimiento: `settings` (jsonb validado con zod), `status` (draft/published/archived), `terms_version`. Solo escribe el servidor; los admins leen por RLS |

Helpers RLS: `current_tenant()` y `is_admin()` (ambas `security definer`).

Valores por defecto sembrados en escuelas (kbps down/up; otros tipos en `0004`): director 20480/10240, staff 10240/5120, teacher 10240/5120, student 2048/1024, superadmin 20480/10240.

## Flujos
1. **Alta de establecimiento**: la hace el dueño en `/platform` (`createTenant` → `lib/create-tenant.ts`, con deshacer probado): tenant (con su tipo) + admin (superadmin activo) con contraseña temporal mostrada una vez y el código/slug. `/register-school` y `registerSchool` están cerrados salvo `ALLOW_PUBLIC_SCHOOL_REGISTRATION=1`.
2. **/register**: el usuario ingresa el slug, se crea `profiles` con `status = 'pending'`.
3. **Aprobación (admin)**: pasa a `active`, asigna `role`, crea el usuario en el router y la fila en `hotspot_users`.
3b. **Crear usuario (admin)**: desde **Usuarios**, el admin crea la cuenta ya activa (`createUser` → `lib/create-user.ts`, con pasos y deshacer probados): cuenta de acceso con contraseña aleatoria que no se entrega, perfil activo, usuario del Hotspot y registro. Muestra el usuario y la contraseña del WiFi una sola vez. El nombre de usuario es único (`lib/usernames.ts`: `ana`, `ana2`…; no usa el prefijo `g_`, reservado para invitados) y se aplica también al aprobar.
4. **Ancho de banda**: al guardar un `bandwidth_profile`, sincronizar al `/ip/hotspot/user/profile` del router con `rate-limit` = `"{upload}k/{download}k"` (en RouterOS el formato es **rx/tx desde la perspectiva del router**, es decir upload/download del cliente; verificar contra el router real).
5. **Deshabilitar/quitar**: refleja el cambio en `/ip/hotspot/user` y en `hotspot_users`.
6. **Panel de consumo**: lee `/ip/hotspot/user` (bytes-in / bytes-out) y agrega por usuario y por rol.

## Portal del invitado y personalización
- **Aspecto del panel** (`app/(app)/layout.tsx`, `components/AppNav.tsx`, reglas `.app` de `app/globals.css`): menú lateral agrupado con sección activa y menú desplegable en móvil. Los estilos del panel van bajo `.app` para no tocar el portal del visitante (`/w`), la landing (`.lp`) ni el login. Los campos de una fila de tabla usan `form=` para pertenecer a su formulario.
- **Logo:** `assets/logo.png` (completo) y `assets/mark.png` (solo el escudo, para la barra de la landing); `app/icon.png` es el icono de la pestaña. El `matcher` de `middleware.ts` excluye los archivos de imagen para que se vean sin sesión. `assets/logo.png` (importado como imagen estática, sin pasar por el middleware) se muestra con `components/AuthLogo.tsx` en login y recuperar contraseña. Para cambiarlo, reemplazar el archivo.
- **Contraseña del panel:** `/account` (cambiar, pide la actual), `/forgot-password` → `/auth/callback` → `/reset-password` (recuperar por correo; destino fijo, respuesta genérica, límites, marca `pw_reset` de 15 min). Las cuentas con contraseña temporal (alta desde `/platform`) llevan `must_change_password` y el layout obliga a cambiarla. Reglas en `lib/password.ts`. La dirección pública de los enlaces sale de `SITE_URL` (`lib/site-url.ts`).
- `/admin/help` (Preguntas frecuentes): manual del administrador en preguntas por tema con buscador. Contenido en `lib/faq.ts`; al cambiar un nombre de pantalla o botón del panel, actualízalo (la prueba `tests/faq.test.ts` vigila los nombres del menú).
- `/` (página de inicio pública, `app/page.tsx`): landing del servicio, con capturas del panel en `assets/shots/` (datos de ejemplo; rehacerlas si cambia el diseño); `middleware.ts` la deja pasar sin sesión y ella redirige a `/dashboard` si hay sesión. Nombre y contacto en `lib/site.ts`. Solo debe afirmar lo que el servicio hace hoy.
- `/w/{slug}`: portal público del establecimiento (con o sin sesión). Sin datos del Hotspot en la URL es una vista previa; con `mac`, `ip`, `login` y `orig` (los manda `deploy/mikrotik/login.html`) conecta al invitado.
- `/admin/portal`: editor para admins (borrador, vista previa, publicación, historial, logo y fondo). `/preview/portal`: vista previa del borrador (solo admins, incrustable solo en el mismo sitio).
- Los ajustes se validan con `lib/portal-settings.ts` al escribir y otra vez al leer. **Nunca** HTML, CSS ni JS libres del cliente; URLs solo `https://`; imágenes PNG/JPG/WebP verificadas por contenido y servidas desde `/w/{slug}/assets/` (bucket privado `portal-assets`).
- Publicar usa `publish_portal_version()` (el botón «Guardar y publicar» del editor guarda el formulario y publica de una vez; «Publicar el borrador guardado» solo publica lo ya guardado) (solo service role): archiva la publicada y sube `terms_version` si cambiaron los términos.
- **Acceso del invitado (por correo, sin OTP todavía):** `guestConnect` (`app/guest-actions.ts`) → `connectGuest` (`lib/guest-flow.ts`, con dependencias inyectadas y probado). Orden: validar el formulario y los datos del Hotspot (`login` solo `http(s)://<IP privada>/login`) → límites de intentos antes de tocar el router (`lib/rate-limit.ts`, en memoria: 30 por minuto por IP pública y 120 por local; vale mientras haya un solo proceso) y de sesiones creadas (3 por minuto por IP del visitante, 60 por local) → comprobar en el router (`/ip/hotspot/host`) que la IP y la MAC existen y coinciden → guardar invitado, consentimientos y sesión → perfil de velocidad y usuario temporal `g_<hex>` con `limit-uptime` (`session_minutes` de los ajustes) → redirección GET al login del Hotspot con la credencial de un solo uso. El plan de red es el perfil del rol de menor privilegio del tipo de establecimiento.
- **El correo no está verificado:** cualquiera puede escribir un correo ajeno. No usar esos datos para nada sensible hasta añadir el OTP.
- `/admin/guests` (Visitantes): estadísticas, lista, borrado (derecho de supresión, en cascada) y CSV (`/admin/guests/export`, con protección contra fórmulas). Al abrirla se sincronizan las sesiones con el router (`lib/guest-sync.ts`) y se borran los usuarios temporales terminados; no hay proceso en segundo plano todavía.
- `/admin/stats` (Estadísticas): visitantes y conexiones por día, semana o mes (7, 30, 90 días y 12 meses), nuevos vs recurrentes, duración media y horas/días de más movimiento. Cálculo puro en `lib/stats.ts` (hora de Panamá), gráficos SVG en `components/stats/charts.tsx`. Una conexión cuenta si su sesión llegó a `active` o `ended`.
- **Panel de plataforma** (`/platform`, `app/(app)/platform`): solo para los correos de `PLATFORM_ADMIN_EMAILS` (`lib/platform.ts`, `lib/platform-auth.ts`; sin la variable nadie entra). Lista todos los establecimientos con el service role y permite suspender/reactivar (`setTenantSuspended`). El estado vive en `tenant_suspensions` (sin políticas: ni los admins del establecimiento lo leen ni lo cambian). Suspendido: `cutAllAccess` deshabilita usuarios y expulsa sesiones del router (mejor esfuerzo), el layout bloquea su panel, `requireAdminTenant`/`requireAdmin` redirigen y `guestConnect` rechaza. `supabase/tests/platform_rls.sql` lo prueba.
- **Configurar el router** (`/platform/router/{id}`, solo el dueño; `app/router-actions.ts`, `lib/router-script.ts`): genera los comandos de RouterOS para dejar un MikroTik como Hotspot del establecimiento (bloques copiables y archivo `.rsc`). Todo dato se valida con listas estrictas porque el texto se pega en el router; la contraseña del usuario `portal` no se guarda. El host del portal sale de la petición y la IP se resuelve por DNS. En la misma pantalla, «Guardar y probar» (`saveTenantRouter`, `lib/router-config.ts`) guarda las credenciales del router del establecimiento, prueba la conexión y sube sus perfiles de velocidad.
- `/admin/connected` (Conectados ahora): sesiones abiertas del Hotspot (`listActiveDetails`) cruzadas con `hotspot_users`/`profiles` (`lib/connected.ts`); los usuarios `g_…` son visitantes y los que el portal no conoce salen como «solo en el router». Se refresca con `components/AutoRefresh.tsx` (no usar `meta refresh`: sigue activo al cambiar de sección). No guarda historial; muestra bytes totales (sin separar subida/bajada, por la etiqueta pendiente de verificar).
- `/admin/staff-history` (Historial): conexiones de los usuarios del portal (`lib/staff-sync.ts` decide abrir/actualizar/cerrar; `lib/staff-history.ts` lo aplica). Resumen por persona y sesiones; 7/30/90 días. Si el router no responde no cierra sesiones. Es dato laboral: solo administradores, 90 días, avisar en los términos. `supabase/tests/staff_rls.sql` lo prueba.
- **Proceso periódico:** `GET /api/cron/guests-sync` (cron del servidor cada minuto, `Authorization: Bearer $CRON_SECRET`) llama a `syncAllGuestSessions` (cierra sesiones terminadas y borra usuarios temporales del router) y a `syncAllStaffSessions` (historial del personal; su resultado va en `staff`). Sin secreto (32+ caracteres) responde 401. La ruta queda fuera de la sesión en `middleware.ts`.
- Los datos personales se cifran con AES-GCM y se buscan con `blindIndex` (`lib/crypto.ts`), derivado de `ROUTER_CRED_KEY`: **esa clave ahora también protege los datos de invitados**.
- **Acceso del personal en el portal del invitado:** sección «Soy del personal» (`components/portal/StaffLogin.tsx`) con usuario y contraseña del Hotspot; el navegador va directo al login del router (`buildLoginRedirect`). Solo se ofrece si la URL de login del Hotspot es válida (`parseLoginUrl`), y trae un enlace a `/register?school={código}`; al entrar va a la URL «Después de conectar» del portal publicado, si la hay, y si no a la web original (el registro precarga el código). Sin esto, el personal no podría entrar desde que `login.html` redirige al portal.
- **Horarios (solo escuelas):** tabla `access_windows` (ventanas por día, hora de Panamá, `lib/schedule.ts`). Si una escuela tiene ventanas, el visitante solo se conecta dentro de una y su acceso dura hasta que cierre (`limit-uptime` = mínimo entre `session_minutes` y lo que queda de la ventana); fuera de horario `connectGuest` no crea nada y dice cuándo abre. Sin ventanas configuradas no hay restricción. Se edita en `/admin/portal`.
- **Reparto del ancho de banda:** con `total_down_kbps`/`total_up_kbps`/`hotspot_network` configurados en `tenant_router_credentials`, `applySharing` crea la cola padre `PORTAL-ROOT`, cuelga los perfiles del Hotspot de ella (`parent-queue`) con mínimo y ráfaga (`lib/queues.ts`) y para los equipos fijos con IP crea `FIXED-<MAC>` (si tienen tope propio) o el grupo `FIXED-POOL` con PCQ (`syncFixedQueues`); el modo `equal` usa PCQ en el padre y los perfiles no crean cola por usuario. Usa los tipos PCQ de fábrica de RouterOS (`pcq-upload-default`/`pcq-download-default`) y no toca colas ajenas (solo `PORTAL-ROOT` y `FIXED-*`). **Dato del router real:** las colas dinámicas del Hotspot nacen con `limit-at` = máximo; por eso el mínimo del perfil (`rate-min`) es lo que permite repartir de verdad bajo el padre. Se configura en `/platform/router/{id}` (`saveCapacity`). Sin esos datos, todo funciona como antes. Las lecturas de las columnas nuevas toleran que la migración 0014 no esté aplicada (`lib/plans.ts`, `getRouterConfig`).
- **Nueva clave WiFi** (`resetWifiPassword`, botón en Usuarios): cambia la contraseña del Hotspot en el router, cierra las sesiones del usuario y la muestra una sola vez; no se guarda (solo fecha y quién en `hotspot_users`). Es distinta de la contraseña del panel (`/account`).
- Suspender una cuenta (`setUserStatus`) deshabilita su usuario del Hotspot; reactivarla lo habilita.
- **Equipos fijos** (`/admin/fixed-devices`): impresoras, pantallas y equipos de control por cable. Cada uno se registra en `fixed_devices` y se aplica al Hotspot como excepción por MAC (`/ip/hotspot/ip-binding`, `type=bypassed`). Alta: primero el router, luego el registro (si falla el registro, se deshace la excepción). Baja: primero el router. La página muestra si cada excepción sigue en el router.
- `/w/*` lleva CSP estricta y `X-Frame-Options: DENY` (`next.config.mjs`).

## Pruebas
- `npm test` (140 pruebas): ajustes del portal, contraste, imágenes, idioma, utilidades y lógica del flujo de invitados (con datos falsos), cifrado y las llamadas nuevas a la API del router (contra un router falso con certificado autofirmado).
- `supabase/tests/base_rls.sql`: aislamiento de las tablas originales (establecimientos, perfiles, planes, usuarios del Hotspot, consumo y credenciales del router), con pendientes y suspendidos sin datos, y escrituras prohibidas al cliente.
- `supabase/tests/portal_rls.sql` y `supabase/tests/guests_rls.sql`: aislamiento entre establecimientos, permisos, publicación, restricciones y supresión. Se ejecuta con `psql` en una base **de pruebas** con las migraciones aplicadas; en un Postgres local primero se carga `supabase/tests/bootstrap_local.sql` (imita roles y `auth.uid()` de Supabase). Termina en `ROLLBACK`.

## MikroTik (setup en el router)
```
/ip service set www-ssl disabled=no
/user group add name=portal policy=read,write,api,rest-api,test
/user add name=portal group=portal password=CAMBIAR
```
El router debe ser alcanzable desde el servidor del portal (VPN o IP pública restringida). Si usa certificado autofirmado, se fija su huella SHA-256 (`router_cert_fingerprint`); sin huella se valida la cadena normal. Ver `docs/DESPLIEGUE.md`.

## Reglas para el código
- Todo acceso a datos del tenant va con el cliente Supabase del usuario (RLS activo). El **service role** solo en server-side (route handlers / server actions) para: registro público, aprobación, escritura de `usage_stats`, lectura de credenciales del router. Nunca exponerlo al cliente.
- Las llamadas al MikroTik se hacen solo desde el servidor. Aislar en un módulo (`lib/mikrotik.ts`) con modo simulado.
- No loguear contraseñas ni credenciales del router.
- Textos de UI en español.

## Seguridad (corregido en `0002_security.sql`)
1. Credenciales del router en `tenant_router_credentials` (RLS sin políticas, solo service role); la contraseña se cifra con AES-256-GCM (`lib/crypto.ts`, env `ROUTER_CRED_KEY`). Contraseñas previas en claro se descartan: re-ingresar.
2. `current_tenant()` exige `status = 'active'`; `tenant_select` deja a pendientes ver solo su propia escuela (ya sin datos sensibles).
3. La contraseña del Hotspot se muestra una sola vez al aprobar (o la define el admin); no se almacena. El rol efectivo ya no se autoasigna al registrarse: nace con el rol de menor privilegio del tipo (student/customer/guest) y el admin lo fija al aprobar.
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
1b. Ejecutar también `0002_security.sql`, `0003_roles_enum.sql`, `0004_establishment_types.sql`, `0005_router_cert_pin.sql`, `0006_portal_customization.sql`, `0007_guests.sql`, `0008_access_windows.sql`, `0009_fixed_devices.sql`, `0010_tenant_suspensions.sql`, `0011_max_devices.sql`, `0012_staff_sessions.sql`, `0013_wifi_password_reset.sql` y `0014_bandwidth_sharing.sql` (cada uno por separado, en orden).
2. Copiar `.env.example` a `.env.local` y completar claves.
3. `npm install && npm run dev`
4. Entrar a `/platform` (correo en `PLATFORM_ADMIN_EMAILS`) y crear el establecimiento y su administrador. (Para el primer arranque sin panel, `ALLOW_PUBLIC_SCHOOL_REGISTRATION=1` abre `/register-school`.)
5. En `/platform/router/{id}` → «Conexión del portal con el router» guardar URL, usuario, contraseña y huella (los administradores del establecimiento ya no pueden cambiarlas; **Ancho de banda** solo muestra el estado).
