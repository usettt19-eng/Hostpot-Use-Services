# Bitácora y estado del proyecto

> **Fuente de contexto.** Claude lee este archivo al empezar cada sesión y lo **actualiza al terminar cada cambio** (estado, pendientes y registro). Si algo aquí contradice la realidad, se corrige aquí primero.
> **Nunca** se escriben aquí contraseñas, claves ni tokens. Solo dónde están guardados.

Última actualización: 2026-10-25

## 1. Qué es
Portal web multitenant de WiFi para establecimientos (escuelas, restaurantes, pubs, hoteles). Cada establecimiento es un tenant aislado con RLS. Un administrador aprueba usuarios y el portal crea su usuario en el Hotspot de un MikroTik con límites según su rol. Se está evolucionando hacia una plataforma de WiFi inteligente para invitados (portal cautivo con marca propia, analítica y marketing). Detalle técnico: `CLAUDE.md`. Diseño: `docs/DISENO-SMARTWIFI.md`.

## 2. Entornos
| Pieza | Estado |
|---|---|
| Repositorio | `usettt19-eng/Hostpot-Use-Services`, rama de trabajo `claude/new-session-pz8j6q` |
| Servidor | VPS `use-services2026` (Ubuntu 22.04, Docker, nginx). Portal en `/opt/hotspot-portal`, contenedor `hotspot-portal` en `127.0.0.1:8120`, Node 22 |
| Dominio | `https://connect.useservices.company` (nginx + Let's Encrypt con renovación automática) |
| Supabase | Proyecto en la nube. Claves y `ROUTER_CRED_KEY` en `/opt/hotspot-portal/.env` (permisos 600). **Respaldar `ROUTER_CRED_KEY` fuera del servidor** |
| Túnel | WireGuard `wg-portal`: servidor `10.99.0.1`, router `10.99.0.2`, UDP 51820; el router inicia la conexión |
| Router de pruebas | MikroTik hEX lite (RouterOS 7.12.1, 64 MB de RAM): solo para pruebas, no para producción. REST por `www-ssl` con certificado propio (CA `portal-ca`) y huella fijada en el portal. Usuario de API `portal` restringido a `10.99.0.1` |
| Establecimiento de prueba | `use-test` (restaurante) |

## 3. Migraciones (`supabase/migrations/`, cada una por separado y en orden)
Aplicadas en Supabase 0001-0016; la 0017 falta. Para repetirlas en una base nueva: ejecutar cada archivo COMPLETO, en orden.
| # | Contenido | Estado |
|---|---|---|
| 0001 | Esquema base multitenant | Aplicada |
| 0002 | Seguridad: credenciales del router aparte, `current_tenant()` solo activos | Aplicada |
| 0003 | Valores nuevos de `user_role` | Aplicada |
| 0004 | Tipo de establecimiento y semilla de anchos de banda por tipo | Aplicada |
| 0005 | Huella del certificado del router | Aplicada (comprobada) |
| 0006 | Personalización del portal: `portal_versions`, publicación atómica, bucket `portal-assets` | Aplicada (bucket comprobado, privado) |
| 0007 | Invitados del portal cautivo: `guests`, `guest_consents`, `guest_sessions` | Aplicada (comprobadas las tres tablas) |
| 0008 | Horarios de acceso (`access_windows`, solo escuelas) | Aplicada |
| 0009 | Equipos fijos (`fixed_devices`) | Aplicada |
| 0010 | Suspensión de establecimientos (`tenant_suspensions`) | Aplicada |
| 0011 | Dispositivos por usuario (`bandwidth_profiles.max_devices`) | Aplicada |
| 0012 | Historial de conexiones del personal (`staff_sessions`) | Aplicada |
| 0013 | Cambio de clave WiFi (`hotspot_users.password_reset_at/by`) | Aplicada |
| 0014 | Reparto del ancho de banda (totales y modo en `tenant_router_credentials`; mínimo y ráfaga en `bandwidth_profiles`; topes en `fixed_devices`) | Aplicada y verificada en el router de prueba |
| 0015 | Módulos habilitables (`tenant_modules`, solo service role) | Aplicada |
| 0016 | Módulo Promociones (`promotions`, `promotion_events`) | Aplicada |
| 0017 | Verificación del correo con código (`guest_otps`, `guests.email_verified_at`) | **Sin aplicar** (probada en Postgres local; se puede repetir) |

## 4. Funcionalidad hecha
| Área | Qué hay | Verificado |
|---|---|---|
| Registro | `/register-school` (tipo de establecimiento) y `/register` (roles según tipo) | En producción de pruebas |
| Aprobación | Admin aprueba, fija rol, crea usuario en el Hotspot y muestra la contraseña una sola vez | Probado con un usuario real: aparece en `/ip hotspot user` con su perfil |
| Perfiles de velocidad | Se crean y sincronizan en el router al aprobar o al pulsar Aplicar. Formato `rate-limit=subida/bajada` (p. ej. `2048k/5120k`) | Creado y visible en el router; un usuario ya inició sesión en el Hotspot de prueba y el router creó su cola dinámica con `max-limit=2048k/5120k` (subida/bajada del cliente, como se esperaba); **falta medir la velocidad real con un test de velocidad** |
| Conexión al router | URL, usuario, contraseña cifrada (AES-256-GCM) y huella SHA-256 fijada | Funciona por el túnel |
| Consumo | Lee `/ip/hotspot/user`. Sin historial guardado todavía | Carga sin error |
| Portal personalizable | Editor `/admin/portal`, vista previa, publicación, historial, logo y fondo; portal público `/w/{código}` (simulado) | Pruebas unitarias, RLS en Postgres local y portal público contra un Supabase simulado. **El editor y la subida de imágenes no se han probado con sesión real** |
| Acceso de invitados por correo | Redirección del Hotspot al portal, formulario con consentimientos, comprobación del dispositivo en el router, usuario temporal y redirección al login; página **Visitantes** (estadísticas, borrado, CSV) | 40 pruebas, RLS de las tablas nuevas en Postgres local y flujo completo con navegador contra un Supabase y un router **simulados**. **Probado con un dispositivo real en el router de prueba (2026-10-22): `neverssl.com` → portal → formulario → login del Hotspot → web original. Falta confirmar en iOS/Android, la página Visitantes y el consumo de las sesiones de invitados**; el correo no se verifica (sin OTP) |
| Estadísticas de visitantes | `/admin/stats`: visitantes hoy/7/30 días con cambio vs el periodo anterior, gráfico por día (7 y 30 días), semana (90 días) o mes (12 meses), nuevos vs recurrentes, duración media, conexiones por hora y por día de la semana, tabla. Lee con RLS; sin migración nueva | Probado con datos de prueba y capturas claro/oscuro; sin probar con datos reales |
| Configurar el router | `/platform/router/{id}` (solo el dueño, botón «Configurar router» en cada establecimiento; abajo, «Guardar y probar» guarda la URL, usuario, contraseña cifrada y huella del router, prueba `/system/resource` y sube los perfiles de velocidad; validación en `lib/router-config.ts`): genera por establecimiento los comandos (túnel WireGuard opcional, usuario y API REST del portal, red y DHCP del Hotspot, Hotspot, walled garden, `login.html`, verificar y deshacer), por bloques con botón Copiar y como archivo `.rsc` descargable. Valida cada dato (se pega en el router) en `lib/router-script.ts`; la contraseña del usuario `portal` se genera y se muestra una vez, no se guarda | Pruebas con datos falsos; **el `.rsc` no se ha importado en un router real** (certificado, `place-before`, orden) |
| Reparto del ancho de banda | El dueño indica en `/platform/router/{id}` el internet contratado (bajada/subida), la red del WiFi y el modo; «Guardar y aplicar» crea en el router la cola padre `PORTAL-ROOT` (`ensureParentQueue`) y deja los perfiles del Hotspot colgados de ella (`parent-queue`) con mínimo garantizado y ráfaga por rol (`buildRateLimit`, `lib/queues.ts`), que cada administrador ajusta en **Ancho de banda**. **Equipos fijos** con IP: cola propia si se les pone tope, o el grupo `FIXED-POOL` con PCQ que se reparte por igual (`syncFixedQueues`, `lib/sharing.ts`); las colas `FIXED-*` que sobran se borran y no se toca ningún `ROOT` del cliente. Modo «equitativo»: el perfil no crea cola por usuario y el padre usa los tipos PCQ que RouterOS trae de fábrica (`pcq-upload-default/pcq-download-default`; no se crea ningún tipo). Migración 0014 (**sin aplicar**); sin internet contratado nada cambia y todo tolera que la 0014 falte | Pruebas contra router falso; **nada probado en un router real** ⚠️: `parent-queue` del perfil, formato de `rate-limit` con mínimo y las colas PCQ (los tipos de fábrica)
| Nueva contraseña del WiFi | En **Usuarios**, botón **Nueva clave WiFi** por persona (`resetWifiPassword` en `app/actions.ts`, `app/(app)/admin/users/reset-wifi.tsx`): el administrador escribe una contraseña (6–64 caracteres) o se genera una; se cambia en el router (`setHotspotUserPassword`), se cierran sus sesiones abiertas (`kickUserSessions`) y se muestra una sola vez. Queda la fecha y quién (migración 0013, sin guardar la clave). Si el router falla, no dice que funcionó. Límite: 20 cambios por 10 min | Pruebas contra router falso y migración en Postgres local; sin probar con el router real |
| Contraseña del panel | **Mi cuenta** (`/account`): cambiar la contraseña pidiendo la actual (mín. 10 caracteres, letras y números; 5 intentos por 15 min; cierra las demás sesiones). Las cuentas creadas con contraseña temporal desde `/platform` llevan `must_change_password` y el panel obliga a cambiarla antes de seguir. **¿Olvidaste tu contraseña?** (`/forgot-password` → correo de Supabase → `/auth/callback` → `/reset-password`): respuesta genérica, límites por IP y por correo, destino fijo, marca de 15 min (`pw_reset`). Lógica en `app/account-actions.ts`, `lib/password.ts`, `lib/site-url.ts` | Pruebas de reglas y de las rutas públicas; **sin probar con correos reales de Supabase** (ver pendientes) |
| Preguntas frecuentes | `/admin/help` (menú **Ayuda → Preguntas frecuentes**, solo administradores): el manual del administrador en formato de preguntas, por temas, con buscador y enlaces por tema. El contenido está en `lib/faq.ts` (hay que actualizarlo cuando cambien pantallas o botones; una prueba comprueba que use los nombres actuales del menú) y se muestra con `components/Faq.tsx` | Revisado con capturas y buscador; el manual en página aparte (artefacto) queda como copia |
| Aspecto del panel | Menú lateral agrupado (Gestión, Portal, Seguimiento, Plataforma) con la sección activa marcada y menú desplegable en teléfono (`components/AppNav.tsx`, estilos `.app` en `app/globals.css`); Inicio con contadores (pendientes, usuarios activos, visitantes de hoy y conectados) y accesos rápidos; Ancho de banda con cada campo alineado y su equivalente en Mbps; Usuarios con los pendientes arriba y «Crear usuario» plegable | Revisado con capturas de escritorio, móvil y modo oscuro sobre datos de ejemplo; sin ver con datos reales |
| Página de inicio pública | `/` (`app/page.tsx`, estilos en `app/landing.css`, nombre y contacto en `lib/site.ts`): presenta el servicio por tipo de local, funciones agrupadas, pasos, estadísticas de ejemplo, seguridad y lo que viene. Quien ya inició sesión va a `/dashboard`. Solo cuenta lo que existe hoy; lo pendiente va en «En camino». El botón de contacto aparece solo si se rellena `contactEmail` o `whatsapp` en `lib/site.ts` | Revisada en escritorio, móvil, claro y oscuro con capturas; sin contenido de contacto real todavía |
| Historial de conexiones | `/admin/staff-history`: cuándo se conectó cada usuario del portal (personal, docentes, alumnos con cuenta), con dispositivos, duración y datos. Tabla `staff_sessions` (migración 0012; MAC solo como hash, 90 días de retención, solo lectura para administradores). La llena el cron cada minuto (`syncAllStaffSessions`, mismo `/api/cron/guests-sync`) y al abrir la página; si el router no responde no cierra nada. Lógica en `lib/staff-sync.ts` | Pruebas con datos falsos y prueba SQL con mutación; sin probar con el router real |
| Conectados ahora | `/admin/connected`: sesiones abiertas del Hotspot (`/ip/hotspot/active`) cruzadas con los usuarios del portal: quién, rol, usuario, IP, MAC, tiempo y datos totales; filtros Todos/Usuarios/Visitantes; se refresca cada 30 s. Una fila por dispositivo (el personal con 2 dispositivos sale dos veces). El historial está en `/admin/staff-history` | Pruebas con datos falsos; sin probar contra el router real |
| Dispositivos por usuario | Columna `bandwidth_profiles.max_devices` (migración 0011): personal y administradores 2, estudiantes/clientes/invitados 1; editable en **Ancho de banda**. Se sube al perfil del Hotspot como `shared-users` junto con `rate-limit` (`syncBandwidthProfile`). Cada dispositivo recibe la velocidad completa | Probado contra router falso y la migración en Postgres local; sin probar con dos dispositivos reales |
| Alta de establecimientos | Solo el dueño, desde `/platform` (formulario: tipo, nombre, administrador; contraseña temporal visible una sola vez). `/register-school` redirige a `/login` y la acción `registerSchool` rechaza, salvo `ALLOW_PUBLIC_SCHOOL_REGISTRATION=1`. Si falla un paso se deshace todo (`lib/create-tenant.ts`) | Pruebas con datos falsos; sin probar contra Supabase real |
| Panel de plataforma | `/platform` (solo correos en `PLATFORM_ADMIN_EMAILS`): lista de establecimientos con usuarios, visitantes, conexiones de 30 días y estado del router; botón Suspender/Reactivar. Suspender guarda el estado en `tenant_suspensions` (migración 0010, sin acceso para clientes), deshabilita todos los usuarios del Hotspot, expulsa las sesiones, bloquea el panel del establecimiento y rechaza nuevas conexiones de visitantes. Reactivar vuelve a habilitar solo a las cuentas activas | Pruebas y prueba SQL con mutación; sin probar contra Supabase ni router reales |
| Equipos fijos: editar e IP por MAC | `/admin/fixed-devices`: botón **Editar** (nombre, IP, ubicación, motivo y velocidad; la MAC no cambia). Un equipo sin IP escrita se busca en el router por su MAC (`lookupIpsByMac`: hosts del Hotspot, DHCP y ARP) y el cron la revisa cada minuto | Verificado en el router de prueba: las 11 IP detectadas |
| Reparto del ancho de banda (verificado) | `PORTAL-ROOT` va antes que la cola `hs-<servidor>` (`ensureParentFirst`, al aplicar y en el cron); perfiles con `parent-queue`, mínimo y ráfaga; `FIXED-<MAC>` y `FIXED-POOL` (PCQ) | Probado en el router real: todas las colas cuentan tráfico y descartan al pasar su tope. **Falta medir el mínimo por dispositivo con la línea saturada** |
| Aislamiento de visitantes | Perfil de visitantes con `address-list=visitantes`; lista `equipos-fijos` mantenida por el portal; reglas del firewall en el bloque «Aislar a los visitantes» del script (`lib/isolation.ts`, `lib/router-script.ts`) | Probado en el router real: las tres reglas descartan paquetes (equipos fijos, redes privadas y administración del router) |
| Módulos habilitables | `tenant_modules`: el dueño activa o desactiva módulos por establecimiento en `/platform` (`lib/modules.ts`, `lib/tenant-modules.ts`); menú, pantallas, rutas públicas y flujos lo comprueban | RLS en SQL local y pruebas unitarias; activado en el establecimiento de prueba |
| Promociones (módulo) | `/admin/promotions`: campañas (imagen, mensaje, botón https, fechas, segmentos todos/nuevos/recurrentes/ausentes) que el visitante ve **antes** de recibir internet; la conexión ocurre al pulsar un botón (`/w/{slug}/promo/{id}`, pedido cifrado `lib/promo-token.ts`); impresiones y clics agregados, sin datos personales | **Probado en un teléfono real: el anuncio se ve.** Segmentos distintos de «Todos» e iOS, sin probar. El botón de la campaña ahora abre el enlace antes de conectar (lista blanca del router); falta probarlo en el teléfono |
| Verificación del correo (OTP) | Ajuste «Verificar el correo con un código de 6 dígitos» en `/admin/portal`: el visitante recibe un código por correo (SMTP, `lib/mail.ts`) y no se crea nada hasta escribirlo; formulario de dos pasos, reenviar, cambiar correo; `guest_otps` (migración 0017, solo el HMAC del código), límites por correo/IP/local, `Visitantes` muestra «Verificado» | Pruebas unitarias y del flujo y RLS en SQL local. **Sin desplegar ni probar con un correo real**: falta aplicar la 0017 y poner `SMTP_URL` y `MAIL_FROM` en el `.env` |
| Seguridad | Credenciales del router cifradas, RLS, escritura solo por service role en tablas sensibles, CSP en `/w/*` | Ver `CLAUDE.md` |
| Despliegue | Docker, nginx y HTTPS | En producción de pruebas |
| Pruebas | `npm test` (175) y `supabase/tests/*_rls.sql` (base, portal, invitados, plataforma, personal, promociones) | Pasan |

## 5. Pendientes (por prioridad)
1. **Seguridad del router** (referencia: `docs/CONFIG-ROUTER.md`): cerrar `www` y `bandwidth-server`, reglas de firewall de entrada básicas (establecidas, inválidas, túnel UDP 13231, ICMP, descartar el resto de la WAN), cerrar MAC-server y descubrimiento de vecinos hacia el puente del Hotspot, actualizar RouterOS (7.12.1; copia de seguridad antes), cambiar la contraseña del usuario `portal` y la de la malla Linksys/Velop (se escribieron en un chat). Después, meter lo seguro en el script del router.
2. **Seguridad del servidor:** los puertos de Postgres/pooler (5432, 5433, 6543, 6544) están abiertos a internet y `ufw` está inactivo (es de otras apps, pero es el mayor riesgo; Docker salta `ufw`: publicarlos en `127.0.0.1`). `apt upgrade`.
3. **Reparto:** medir el mínimo garantizado por dispositivo con la línea saturada (bajar el internet contratado a 6 Mbps, usuario + visitante + equipo fijo descargando, ver `rate` de cada cola; devolver a 30 Mbps); alinear los nombres de los planes en **Ancho de banda** con los perfiles del router (`Gerencia`, `Empleados`, `Admin` se ajustaron a mano) y revisar la bajada de `Admin` (`10480k`, parece un error); decidir si se mantiene PCQ para equipos fijos.
4. **Aislamiento entre equipos WiFi del mismo punto de acceso:** el router no lo ve; activar el aislamiento de clientes o una red de invitados en el Velop.
5. **Promociones:** probar los segmentos (nuevo, recurrente, ausente) con correos distintos, el botón de la campaña en iOS y Android y que los contadores suban. Siguiente: **desplegar y probar el OTP** (aplicar la 0017, poner `SMTP_URL` y `MAIL_FROM` en el `.env`, activar «Verificar el correo» y conectarse con un correo propio) y, solo después, envío de promociones por correo a quienes lo aceptaron y verificaron (enlace de baja, límites de envío, revisar la ley de datos de Panamá).
6. **Recuperar contraseña del panel:** en Supabase → Authentication → URL Configuration, *Site URL* `https://connect.useservices.company` y `https://connect.useservices.company/auth/callback` en *Redirect URLs*; SMTP; `SITE_URL` en el `.env`; probar los flujos.
7. **«Nueva clave WiFi»:** probarla con un usuario real (la clave nueva debe funcionar y la antigua fallar).
8. **Landing:** rellenar `contactEmail` o `whatsapp` en `lib/site.ts` y revisar el texto antes de publicarla.
9. **Cron y avisos:** comprobar que la respuesta de `/api/cron/guests-sync` incluya `"staff"` y `"queues"`; avisar al personal del registro de conexiones en los términos de uso.
10. **Consumo:** verificar qué son `bytes-in` y `bytes-out` en RouterOS (por la documentación, `bytes-in` es lo que el router recibe del cliente, su subida; el portal los etiqueta al revés) y guardar `usage_stats` con una tarea programada (hoy no hay historial).
11. **Pruebas pendientes con dispositivos:** acceso de visitantes en iOS y Android, horarios de una escuela con un alumno, personal con 2 dispositivos, «Después de conectar» para quien no pasa por una campaña (el teléfono cierra solo la ventana del portal).
12. **Ideas aprobadas o por decidir:** reconocer al visitante por dispositivo (MAC, 30 días; falta confirmar), sedes y varios routers, filtros de contenido, WhatsApp, Fase 0 de SmartWiFi (`docs/DISENO-SMARTWIFI.md`).

- **Capturas de la landing** (`assets/shots/`): se tomaron con Playwright sobre una página temporal con datos de ejemplo (no se dejó en el repositorio porque sería pública). Si cambia el diseño del panel, hay que volver a tomarlas.

## 6. Decisiones
**Tomadas**
- Supabase en la nube (no el self-hosted del servidor). Subdominio `connect`.
- Túnel WireGuard en lugar de exponer `www-ssl`; el router inicia la conexión.
- Certificado propio del router con huella fijada en el portal (no se desactiva la validación).
- Los datos de los invitados son de un solo establecimiento; sin cuentas de Supabase para invitados.
- El personal sigue con aprobación manual; los invitados serán de autoservicio.
- Nada de HTML, CSS ni JavaScript libres de los clientes en el portal.
- Las funciones opcionales son **módulos** que el dueño de la plataforma activa por establecimiento (no se venden ni se activan desde el panel del cliente).
- La verificación del correo es opcional por establecimiento, falla cerrada si el correo no está configurado y nunca guarda el código (solo su HMAC).
- Promociones: se muestran **antes** de dar internet (el teléfono cierra la ventana del portal al detectar internet); solo contadores, sin guardar quién las vio; correo a visitantes únicamente después de verificar el correo.
- El aislamiento de visitantes se hace con listas de direcciones (`visitantes`, `equipos-fijos`) que mantiene el portal y reglas de firewall que trae el script del router.
- El reparto de velocidad cuelga todo de `PORTAL-ROOT`, que debe ir antes que la cola general del Hotspot.

**Abiertas** (con la recomendación en `docs/DISENO-SMARTWIFI.md`, secciones G.2 y "Preguntas abiertas")
- Primer canal de OTP (propuesta: correo y luego WhatsApp), retención de datos (propuesta: 24 meses, a confirmar con un abogado), pagos, login social, sectores adicionales, proveedor de IA, hardware de producción.

## 7. Problemas conocidos y lecciones
- **«Después de conectar, ir a» no se aplicaba al personal (2026-10-22):** solo lo usaba el flujo de visitantes; «Soy del personal» iba a la web original. Corregido. Además, el ajuste solo rige cuando está **publicado**, no como borrador, y los móviles pueden cerrar solos el navegador del portal al detectar internet, sin llegar a mostrar la dirección.
- **Personal sin recuperación de contraseña del WiFi:** no hay botón para generar otra; hoy se cambia a mano en el router. La cuenta del portal que crea el administrador lleva una contraseña aleatoria que no se entrega (esas personas usan solo el WiFi).
- **`useSearchParams` en `/register` (2026-10-22):** envolver la página en `Suspense` hacía que el formulario no viniera en el HTML del servidor (solo tras ejecutar JavaScript), lo que arriesga los mini-navegadores de portal cautivo. Se corrigió leyendo `searchParams` en el servidor (`app/register/page.tsx`) y pasando el código a `register-form.tsx`. Una comprobación con `curl` y `grep` lo detectó.
- **Contraseña expuesta en el chat (2026-10-22):** la contraseña de administración de la malla Linksys quedó escrita en este chat. Cambiarla es pendiente.
- Un `401` del router con la contraseña correcta en `curl`: la contraseña guardada en el portal era otra (autocompletado del navegador). Se desactivó el autocompletado en esos campos.
- Un campo de huella guardado como `109902` (la IP sin puntos): ahora el portal exige 64 caracteres hexadecimales.
- En RouterOS, `/certificate sign` falla con "CA not found" si no hay una CA: se creó `portal-ca` y se firmó con ella.
- Las peticiones `Server Reference ID ... "x"` en los logs son sondas de escáneres de internet; Next.js las rechaza. Versiones: Next 15.5.28, React 19.3.1.
- Los mensajes `_sender is not defined` en la consola del navegador vienen de una extensión, no del portal.
- Desde el entorno de Claude no se llega al servidor ni al router: los comandos los ejecuta el usuario y pega la salida.

- **Colas del router (2026-10-24):** la cola dinámica `hs-<servidor>` (toda la interfaz) iba antes que `PORTAL-ROOT` y se quedaba con todo el tráfico: ninguna cola hija contaba bytes y nadie quedaba limitado. Se detectó porque una cola de prueba puesta primero sí frenó. Moverla basta; el orden entre las colas hijas no importa.
- **Teléfonos y portal cautivo (2026-10-25):** al detectar internet, el teléfono cierra solo la ventana del portal; nada mostrado después de iniciar sesión en el Hotspot se ve. Por eso la campaña se muestra antes y la conexión ocurre al pulsar un botón.
- **Formato de `rate-limit` con mínimo (7.12):** el tiempo de ráfaga va en segundos sin la letra `s`; con `s` el router responde `invalid rate-limit`. Un `limit-at` mayor que `max-limit` se rechaza y `max-limit=0` cuenta como menor.
- **Al pegar comandos:** el chat no ejecuta comandos del router ni del servidor; hay que pegarlos en el terminal, línea por línea, sin las palabras de la frase (se pegó «y» y comas en vez de comandos).
- **No usar `<meta http-equiv="refresh">` en pantallas del panel:** con la navegación del cliente la etiqueta queda en la página y recarga cualquier sección. Para refrescar datos, `components/AutoRefresh.tsx`.

## 8. Cómo desplegar y probar
```bash
# Servidor
cd /opt/hotspot-portal && git pull && docker compose up -d --build
curl -sI https://connect.useservices.company/login | head -1      # 200
docker compose logs --tail=20 | grep -v "Server Reference\|failed-to-find"

# Pruebas en el repo
npm test && npx tsc --noEmit
```
Prueba funcional: crear establecimiento en `/register-school`, conectar el router en **Ancho de banda**, registrar un usuario en `/register`, aprobarlo en **Usuarios**, comprobar `/ip hotspot user print` en el router.

## 9. Registro de cambios (lo más reciente primero)
| Fecha | Cambio | Commit |
|---|---|---|
| 2026-10-25 | **El botón de la campaña no abría el enlace en el teléfono** (se conectaba y el teléfono cerraba la ventana antes de cargarlo). Ahora el botón cuenta el clic y abre el enlace **antes** de conectar; el portal mantiene en la lista blanca del router el dominio y subdominios de las campañas activas (`syncCampaignWalledGarden`); «Continuar a internet» sigue siendo la conexión. Limitación: páginas que cargan recursos de otros dominios (redes sociales) se ven incompletas. **Falta probarlo en el teléfono** | `bc14dd5` |
| 2026-10-25 | **Verificación del correo con código (OTP)**: ajuste `verify_email` del portal, código de 6 dígitos por SMTP (`lib/otp.ts`, `lib/mail.ts`, `nodemailer`), formulario de dos pasos, `guest_otps` y `guests.email_verified_at` (migración 0017), límites de envío, columna «Verificado» en Visitantes, limpieza en el cron, manual. **Falta aplicar la 0017, configurar `SMTP_URL`/`MAIL_FROM` y probar con un correo real** | `3fa0b26` |
| 2026-10-25 | Bitácora puesta al día: migraciones 0001-0016 aplicadas, funcionalidad nueva (equipos fijos con IP por MAC, reparto, aislamiento, módulos, Promociones), pendientes reordenados por prioridad, decisiones, lecciones del router y de los teléfonos, y registro ordenado por fecha. El anuncio de Promociones se ve en el teléfono | `3fa0b26` |
| 2026-10-25 | Promociones se muestra **antes** de dar internet: en el teléfono la ventana del portal se cerraba al detectar internet y la campaña no se veía. `connectGuest` manda a la página de la campaña con un pedido cifrado (`lib/promo-token.ts`, 10 min) y la conexión real ocurre al pulsar «Continuar a internet» o el botón de la campaña (`/go`). Probado con pruebas unitarias; **probado en un teléfono real: el anuncio se ve** | `c24f5d0` |
| 2026-10-24 | **Módulos habilitables por establecimiento** (`tenant_modules`, migración 0015, `lib/modules.ts`; el dueño los activa en `/platform`) y primer módulo, **Promociones** (migración 0016, `lib/promotions.ts`, `/admin/promotions`, `/w/{slug}/promo/{id}`): campañas con imagen, mensaje y enlace https que el visitante ve justo después de conectarse, segmentadas (todos, nuevos, recurrentes, vuelven tras una ausencia), con vigencia e impresiones/clics agregados. Probado con pruebas unitarias, del flujo y de RLS en SQL local; Migraciones 0015 y 0016 aplicadas; **probado en el flujo real**: la campaña activa («Todos») se ve al conectar como visitante | `d5e659b` |
| 2026-10-24 | Prueba de reparto con varios equipos a la vez en el router de prueba: todas las colas (usuarios, visitantes, `FIXED-…` y `FIXED-POOL`) cuentan tráfico y descartan paquetes al pasar su tope (p. ej. Xbox con tope propio, visitantes y personal), y `FIXED-POOL` reparte con PCQ (`pcq-queues=4/2`). **No quedó medido** el mínimo garantizado por dispositivo con la línea saturada (solo contadores acumulados) | `ee7777b` |
| 2026-10-24 | Aislamiento verificado en el router de prueba (las dos reglas de `forward` descartan paquetes; `visitantes` y `equipos-fijos` se llenan solas; `Clientes` con `address-list=visitantes`). Referencia de la configuración del router en `docs/CONFIG-ROUTER.md`. La regla de `input` también descarta (12 paquetes) | `995ab84`, `ccf95a4` |
| 2026-10-24 | Aislamiento de los visitantes: el perfil de menor privilegio lleva `address-list=visitantes`; el portal mantiene `equipos-fijos` con la IP de cada equipo fijo (`syncFixedAddressList`, solo toca entradas «Portal: …»); el script del router agrega las reglas (visitantes no ven equipos fijos, ni redes privadas, ni administran el router: `lib/isolation.ts`). Límite: el tráfico entre equipos del mismo punto de acceso no pasa por el router. **Sin probar en el router real**; hay que aplicar las reglas a mano en el de prueba | `6a8db81` |
| 2026-10-24 | Reparto verificado en el router real (PORTAL-ROOT 23 Mbps, personal 16 Mbps, Xbox y grupo `FIXED-POOL` con tráfico). `ensureParentFirst` solo compara con la cola general `hs-…`: RouterOS pone las colas de usuario nuevas en el puesto 0 y eso no afecta (cuelgan de `PORTAL-ROOT`) | `826da1e` |
| 2026-10-24 | Equipos fijos sin IP escrita: el portal busca su IP por MAC en el router (`lookupIpsByMac`: hosts del Hotspot, DHCP y ARP) al aplicar el reparto y, cada minuto en el cron, rehace sus colas solo si alguna IP cambió (`keepParentFirstAll`); ya se puede poner velocidad sin escribir IP. Probado contra router falso; **sin probar en el router real** | `7bd8e82` |
| 2026-10-24 | **Reparto probado en el router real:** las colas del portal no recibían tráfico porque la cola general del Hotspot (`hs-<servidor>`, dinámica) iba antes que `PORTAL-ROOT`; una cola de prueba arriba sí limitó (0.76/0.92 Mbps con tope 1) y, con `PORTAL-ROOT` de primera, pasó tráfico por el reparto (PORTAL-ROOT 7.4 Mbps, Xbox topado). El portal ahora la deja de primera (`ensureParentFirst`) al aplicar el reparto y el cron cada minuto (`keepParentFirstAll`). Pendiente: probar visitante ≈5/2 Mbps, varios equipos a la vez, `Gerencia`/`Empleados` sin mínimo y `FIXED-POOL` | `59b4f87` |
| 2026-10-24 | Corrige el grupo `FIXED-POOL`: el router rechazaba `limit-at` con `max-limit=0/0` («download-max-limit less than download-limit», visto al editar un equipo fijo en el router real 7.12); ahora su máximo es el internet contratado | `7cf9168` |
| 2026-10-24 | Equipos fijos editables: botón «Editar» en `/admin/fixed-devices` (`updateFixedDevice`): nombre, IP, ubicación, motivo y velocidad (la MAC no cambia); al guardar se reajustan las colas del router. Sin probar en el router real | `5ad6c46` |
| 2026-10-24 | Sección «El panel» en la landing con capturas del panel (Inicio, Usuarios, Estadísticas, Conectados) en `assets/shots/*.webp`, con datos de ejemplo | `342ae37` |
| 2026-10-24 | Formato de `rate-limit` con mínimo corregido con pruebas en el router real (7.12): el tiempo de ráfaga va en segundos **sin la letra «s»**; «0/0» = sin ráfaga; `parent-queue` ya lo aceptaba | `cbffb53` |
| 2026-10-24 | Al aplicar el reparto, los errores del router se muestran al dueño (antes se tragaban); si el router rechaza el reparto en un perfil, este queda con el límite simple y aprobar/crear/conectar no se bloquean (`syncBandwidthProfileSafe`). Caso real: la cola `PORTAL-ROOT` se creó pero los perfiles no recibieron `parent-queue` ni mínimo | `e478085` |
| 2026-10-24 | Los grupos PCQ usan los tipos de fábrica de RouterOS (no se crea ningún tipo de cola). Verificado con la salida del router de prueba: las colas dinámicas del Hotspot nacen con `limit-at` = máximo, por lo que el mínimo del perfil es necesario para repartir bajo el padre; el reparto aún no estaba aplicado en ese router | `d045820` |
| 2026-10-24 | Reparto del ancho de banda completo: internet contratado por establecimiento, mínimo y ráfaga por rol, grupo PCQ de equipos fijos, modo equitativo y las pantallas (migración 0014 sin aplicar) | `b5581be` |
| 2026-10-24 | Logo en la página de inicio pública (icono en la barra superior y logo completo al pie) e icono de la pestaña del navegador (`app/icon.png`); el middleware deja pasar los archivos de imagen sin sesión | `c72c761` |
| 2026-10-24 | Botón «Nueva clave WiFi» para restablecer la contraseña del WiFi de un usuario (migración 0013) | `3713171` |
| 2026-10-24 | Logo de Connect Wifi en el inicio de sesión y en las pantallas de recuperar contraseña (`assets/logo.png`, `components/AuthLogo.tsx`; fondo ajustado a blanco, sobre caja blanca en modo oscuro) | `34150a4` |
| 2026-10-24 | El inicio de sesión y el título de la pestaña usan el nombre del servicio (`lib/site.ts`) en vez de «Portal de Red Escolar» | `95fe6f5` |
| 2026-10-24 | Cambiar y recuperar la contraseña del panel; obligar a cambiar la contraseña temporal | `170f233` |
| 2026-10-23 | Arreglo: **Conectados** recargaba la página entera cada 30 s con una etiqueta `meta refresh` que seguía activa al cambiar de sección (borraba formularios y devolvía a Conectados). Ahora usa `components/AutoRefresh.tsx` (`router.refresh()` solo mientras la pantalla está abierta y visible) | `94f7b91` |
| 2026-10-23 | Sección «Preguntas frecuentes» dentro del panel (`/admin/help`) con el manual del administrador y buscador | `43df9f5` |
| 2026-10-23 | Rediseño del panel: menú lateral, Inicio con contadores, tablas de Ancho de banda y Usuarios más claras | `41c95d9` |
| 2026-10-23 | Página de inicio pública (landing) en `/` y manual del administrador (página aparte, no está en el repositorio) | `cff003b` |
| 2026-10-23 | Confirmado: migración 0012 aplicada en Supabase | `34d6da6` |
| 2026-10-23 | Historial de conexiones de los usuarios del portal (`/admin/staff-history`, migración 0012, registro desde el cron) | `48d3e29` |
| 2026-10-23 | Pantalla «Conectados ahora» (`/admin/connected`) con sesiones activas del Hotspot | `b034dbc` |
| 2026-10-23 | Confirmado: migración 0011 aplicada en Supabase | `18b4a3b` |
| 2026-10-23 | Personal con 2 dispositivos: `max_devices` por rol (migración 0011) y `shared-users` en el perfil del Hotspot | `f2fd718` |
| 2026-10-22 | Panel `/admin/stats` de estadísticas de visitantes (resumen diario, semanal, mensual) y enlace «Estadísticas» | `c48ce47` |
| 2026-10-22 | Botón «Guardar y publicar» en el editor del portal: el usuario escribió los términos pero publicaba el borrador guardado (sin términos) y no podía publicar | `437ce8e` |
| 2026-10-22 | «Después de conectar, ir a» también se aplica al personal que entra por «Soy del personal» | `eefaf21` |
| 2026-10-22 | Crear usuario desde **Usuarios** (`createUser`, `lib/create-user.ts`) con nombres de usuario únicos (`lib/usernames.ts`, también al aprobar). 74 pruebas, con los caminos de fallo y su deshacer. **Pendiente** de probar con Supabase Auth y el router reales | `b503357` |
| 2026-10-22 | Migración 0009 (`fixed_devices`) aplicada en Supabase según el usuario; falta comprobar la tabla y probar un equipo fijo en el router | `d51dd04` |
| 2026-10-22 | `/register` vuelve a renderizar el formulario en el servidor con el código precargado desde `?school=` (la versión con `Suspense` solo lo mostraba tras JavaScript). Comprobado con `curl` en local | `a0188ba` |
| 2026-10-22 | Portal del invitado: sección «Soy del personal» (usuario y contraseña del Hotspot, directo al login del router) y enlace al registro con el código precargado. Probado con navegador contra simuladores; pendiente en el router real | `792b34b` |
| 2026-10-22 | Se quita a los administradores el formulario de conexión al router (cierra el riesgo de SSRF); `saveRouter` eliminado y la pantalla Ancho de banda solo muestra el estado | `13b4c74` |
| 2026-10-22 | El dueño guarda y prueba la conexión del router de cada establecimiento desde `/platform/router/{id}` | `f905f12` |
| 2026-10-22 | El generador del router pasa al panel `/platform` (por establecimiento, solo el dueño); sale del menú de los administradores | `72888d6` |
| 2026-10-22 | Generador de configuración del router (bloques y archivo `.rsc`) | `fca96a5` |
| 2026-10-22 | El alta de establecimientos pasa al panel `/platform`; el registro público queda cerrado (también en la acción del servidor) | `3db59e0` |
| 2026-10-22 | Panel `/platform` para el dueño de la plataforma (lista y suspender/reactivar establecimientos), migración 0010 | `662ca30` |
| 2026-10-22 | Confirmado: la migración 0008 ya estaba aplicada (error `42P07` al repetirla); bitácora corregida | `0fc37fd` |
| 2026-10-22 | Desplegado en el servidor el código de horarios, suspensiones y equipos fijos (build correcto). Faltan las migraciones 0008 y 0009 en Supabase y las pruebas con router/alumno reales | `8ea0c0f` |
| 2026-10-22 | Equipos fijos: migración 0009, página `/admin/fixed-devices`, excepciones por MAC en el Hotspot (`ip-binding bypassed`) y comprobación de estado contra el router. Probado con pruebas unitarias y un router falso; **pendiente** de probar en el router real (`/ip hotspot ip-binding print`) | `da89c46` |
| 2026-10-22 | Horarios de acceso para escuelas: migración 0008 (`access_windows`), `lib/schedule.ts` (hora de Panamá), límite de sesión hasta el cierre de la ventana, pantalla en `/admin/portal` solo para escuelas. Corrección: al suspender una cuenta se deshabilita su usuario del Hotspot. Pendiente: aplicar 0008 en Supabase, probar con un alumno real y limitar dispositivos por perfil | `53d5189` |
| 2026-10-22 | Pruebas de aislamiento de las tablas originales (`supabase/tests/base_rls.sql`): pasan en Postgres local con las migraciones 0001-0007 y fallan si se relaja una política. Pendientes y suspendidos no ven planes ni usuarios | `b997f1c` |
| 2026-10-22 | Proceso periódico de invitados: `/api/cron/guests-sync` autorizado con `CRON_SECRET` (401 sin secreto, probado) y cron del servidor cada minuto (ver `docs/DESPLIEGUE.md` 3b). Pendiente de desplegar y activar en el servidor | `2cea055` |
| 2026-10-22 | Velop en AP con IP fija en la red de pruebas (`velop-1` 192.168.200.2, `velop-2` 192.168.200.3). Investigación de la API local JNAP: `GET_DEVICES` y `connections[].parentDeviceID` confirmados en el código de `pyvelop`; el nodo responde en `/JNAP/`, pero rechaza la autorización por contraseña (`_ErrorUnauthorized`). **Pendiente**: la API no es accesible con la contraseña de la app; el dato por nodo requiere cable directo a cada puerto o un método de autorización distinto | `4177a4a` |
| 2026-10-22 | Sincronización de invitados: los contadores de una sesión en curso se leen de `/ip/hotspot/active` (los del usuario solo se actualizan al terminar la sesión, `UPTIME 0s` en `/ip hotspot user`). Con dos invitados activos se comprobó: cada uno con su comentario `guest:<id>`, `session-time-left` ≈ 2 h y una cola dinámica de `2048k/5120k` | `054b660` |
| 2026-10-22 | `login.html` descargado en `flash/hotspot` (674 bytes) y flujo de invitados probado con un dispositivo real: el router redirige al portal, el invitado entra y llega a la web original (neverssl envía a un subdominio aleatorio, es normal) | `3d97747` |
| 2026-10-22 | Walled garden creado y verificado en el router de prueba (`connect.useservices.company` y `187.33.153.78:443`) | `c1cf74d` |
| 2026-10-22 | El portal sirve el `login.html` del Hotspot por establecimiento (`/w/{código}/mikrotik-login.html`) para descargarlo desde el router con `/tool fetch`: el renombrado por comandos falló (`expected end of command`) y los archivos están en `flash/hotspot/`. Pendiente de desplegar y probar | `aeba69c` |
| 2026-10-22 | Acceso de invitados desplegado en el servidor (comprobado con el campo `hs_ip` del formulario en `/w/use-test`; contenedor arriba). El walled garden y el `login.html` ya están en el router de prueba | `a7925f6` |
| 2026-10-22 | Migración 0007 aplicada en Supabase (tablas `guests`, `guest_consents` y `guest_sessions` comprobadas) | `a8a2d99` |
| 2026-10-22 | La migración 0007 se hizo repetible (`if not exists`, `drop policy if exists`) tras el error `relation "guest_consents" does not exist` al ejecutarla en Supabase: se reproduce ejecutando solo desde la línea del índice, es decir, pegando una parte del archivo. Probada desde cero y dos veces seguidas. También se corrigió `bootstrap_local.sql` para poder repetirse | `8aba073` |
| 2026-10-22 | Acceso de invitados por correo: migración 0007, flujo `guestConnect`, página Visitantes, `login.html` del Hotspot, `session_minutes`, límite de intentos antes de consultar el router; guía del router (sección 8) | `39bc1a5` |
| 2026-10-22 | Cola dinámica de `srubend` comprobada: `max-limit=2048k/5120k` sobre `192.168.200.198`; el orden del límite coincide con lo esperado (falta la medición real) | `90d9707` |
| 2026-10-22 | El usuario pidió varias sesiones en paralelo: `shared-users=5` en el perfil `Clientes` o usuarios de prueba (documentado) | — |
| 2026-10-22 | Hotspot de prueba configurado y probado: redirección al login y sesión de `srubend` activa (192.168.200.198). Se ve el login estándar de MikroTik: el portal personalizado aún no está conectado al Hotspot | `81976c3` |
| 2026-10-21 | Guía de configuración del Hotspot de prueba (`docs/ROUTER-PRUEBA.md`), no ejecutada todavía | `9d5280d` |
| 2026-10-21 | Portal con personalización desplegado; `/w/use-test` responde 200 en producción (encuentra el establecimiento; muestra valores por defecto porque aún no se publica); sin errores en los logs; se ve bien en el navegador del usuario (valores por defecto, términos "pendientes de configurar"). Falta probar el editor | `b268739` |
| 2026-10-21 | Migración 0006 aplicada en Supabase (bucket privado `portal-assets` comprobado) | `b268739` |
| 2026-10-21 | Esta bitácora y su regla de uso en `CLAUDE.md` | `5747c95` |
| 2026-10-21 | Personalización del portal por establecimiento: editor, portal público, versiones, migración 0006, pruebas | `f9eb619` |
| 2026-10-21 | Requisito de personalización en el diseño | `6069719` |
| 2026-10-21 | Comparativa con Datawifi: SmartWiFi, FlowMetrics, SmartFilter, DSM | `343a8e4`, `a230681`, `b2f454b` |
| 2026-10-21 | Diseño de SmartWiFi y prompt para la plataforma de WiFi inteligente | `37b3e19`, `ca67f31` |
| 2026-10-20 | Sincroniza el perfil de velocidad al aprobar un usuario | `2e4ff52` |
| 2026-10-20 | Corrige el estado "modo simulado" y valida la huella; avisa si falla el guardado del router | `a99662f`, `0434ada`, `9e4f3ce` |
| 2026-10-20 | Node 22 en la imagen Docker | `11f942e` |
| 2026-10-20 | Huella del certificado del router fijada en las llamadas REST | `829b30e` |
| 2026-10-20 | Despliegue con Docker, nginx y dominio `connect.useservices.company` | `d7eb719`, `7ac3d26`, `4b11f77`, `9ddded7` |
| 2026-10-20 | Tipos de establecimiento y roles por tipo; CLAUDE.md actualizado | `4ea0366`, `eca6c41` |
| 2026-10-20 | Importación del proyecto y correcciones de seguridad conocidas | `6b640c1` |
