# Bitácora y estado del proyecto

> **Fuente de contexto.** Claude lee este archivo al empezar cada sesión y lo **actualiza al terminar cada cambio** (estado, pendientes y registro). Si algo aquí contradice la realidad, se corrige aquí primero.
> **Nunca** se escriben aquí contraseñas, claves ni tokens. Solo dónde están guardados.

Última actualización: 2026-10-22

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
| # | Contenido | Estado |
|---|---|---|
| 0001 | Esquema base multitenant | Aplicada |
| 0002 | Seguridad: credenciales del router aparte, `current_tenant()` solo activos | Aplicada |
| 0003 | Valores nuevos de `user_role` | Aplicada |
| 0004 | Tipo de establecimiento y semilla de anchos de banda por tipo | Aplicada |
| 0005 | Huella del certificado del router | Aplicada (comprobada) |
| 0007 | Invitados del portal cautivo: `guests`, `guest_consents`, `guest_sessions` | Aplicada (comprobadas las tres tablas). El primer intento falló por pegar solo una parte del archivo |
| 0006 | Personalización del portal: `portal_versions`, publicación atómica, bucket `portal-assets` | Aplicada. Bucket comprobado (`portal-assets`, privado). La tabla `portal_versions` se da por creada porque el bucket es lo último que hace el script; no se ha mostrado su conteo |

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
| Preguntas frecuentes | `/admin/help` (menú **Ayuda → Preguntas frecuentes**, solo administradores): el manual del administrador en formato de preguntas, por temas, con buscador y enlaces por tema. El contenido está en `lib/faq.ts` (hay que actualizarlo cuando cambien pantallas o botones; una prueba comprueba que use los nombres actuales del menú) y se muestra con `components/Faq.tsx` | Revisado con capturas y buscador; el manual en página aparte (artefacto) queda como copia |
| Aspecto del panel | Menú lateral agrupado (Gestión, Portal, Seguimiento, Plataforma) con la sección activa marcada y menú desplegable en teléfono (`components/AppNav.tsx`, estilos `.app` en `app/globals.css`); Inicio con contadores (pendientes, usuarios activos, visitantes de hoy y conectados) y accesos rápidos; Ancho de banda con cada campo alineado y su equivalente en Mbps; Usuarios con los pendientes arriba y «Crear usuario» plegable | Revisado con capturas de escritorio, móvil y modo oscuro sobre datos de ejemplo; sin ver con datos reales |
| Página de inicio pública | `/` (`app/page.tsx`, estilos en `app/landing.css`, nombre y contacto en `lib/site.ts`): presenta el servicio por tipo de local, funciones agrupadas, pasos, estadísticas de ejemplo, seguridad y lo que viene. Quien ya inició sesión va a `/dashboard`. Solo cuenta lo que existe hoy; lo pendiente va en «En camino». El botón de contacto aparece solo si se rellena `contactEmail` o `whatsapp` en `lib/site.ts` | Revisada en escritorio, móvil, claro y oscuro con capturas; sin contenido de contacto real todavía |
| Historial de conexiones | `/admin/staff-history`: cuándo se conectó cada usuario del portal (personal, docentes, alumnos con cuenta), con dispositivos, duración y datos. Tabla `staff_sessions` (migración 0012; MAC solo como hash, 90 días de retención, solo lectura para administradores). La llena el cron cada minuto (`syncAllStaffSessions`, mismo `/api/cron/guests-sync`) y al abrir la página; si el router no responde no cierra nada. Lógica en `lib/staff-sync.ts` | Pruebas con datos falsos y prueba SQL con mutación; sin probar con el router real |
| Conectados ahora | `/admin/connected`: sesiones abiertas del Hotspot (`/ip/hotspot/active`) cruzadas con los usuarios del portal: quién, rol, usuario, IP, MAC, tiempo y datos totales; filtros Todos/Usuarios/Visitantes; se refresca cada 30 s. Una fila por dispositivo (el personal con 2 dispositivos sale dos veces). El historial está en `/admin/staff-history` | Pruebas con datos falsos; sin probar contra el router real |
| Dispositivos por usuario | Columna `bandwidth_profiles.max_devices` (migración 0011): personal y administradores 2, estudiantes/clientes/invitados 1; editable en **Ancho de banda**. Se sube al perfil del Hotspot como `shared-users` junto con `rate-limit` (`syncBandwidthProfile`). Cada dispositivo recibe la velocidad completa | Probado contra router falso y la migración en Postgres local; sin probar con dos dispositivos reales |
| Alta de establecimientos | Solo el dueño, desde `/platform` (formulario: tipo, nombre, administrador; contraseña temporal visible una sola vez). `/register-school` redirige a `/login` y la acción `registerSchool` rechaza, salvo `ALLOW_PUBLIC_SCHOOL_REGISTRATION=1`. Si falla un paso se deshace todo (`lib/create-tenant.ts`) | Pruebas con datos falsos; sin probar contra Supabase real |
| Panel de plataforma | `/platform` (solo correos en `PLATFORM_ADMIN_EMAILS`): lista de establecimientos con usuarios, visitantes, conexiones de 30 días y estado del router; botón Suspender/Reactivar. Suspender guarda el estado en `tenant_suspensions` (migración 0010, sin acceso para clientes), deshabilita todos los usuarios del Hotspot, expulsa las sesiones, bloquea el panel del establecimiento y rechaza nuevas conexiones de visitantes. Reactivar vuelve a habilitar solo a las cuentas activas | Pruebas y prueba SQL con mutación; sin probar contra Supabase ni router reales |
| Seguridad | Credenciales del router cifradas, RLS, escritura solo por service role en tablas sensibles, CSP en `/w/*` | Ver `CLAUDE.md` |
| Despliegue | Docker, nginx y HTTPS | En producción de pruebas |
| Pruebas | `npm test` (115), `supabase/tests/portal_rls.sql` | Pasan |

## 5. Pendientes (por prioridad)
000000. **Landing:** rellenar `contactEmail` o `whatsapp` en `lib/site.ts` para mostrar el botón de contacto; revisar el texto antes de publicarla. **Router (seguridad):** cerrar `www`, desactivar `bandwidth-server`, aplicar el firewall de entrada y actualizar RouterOS (la 7.12.1 está por debajo de las versiones corregidas en septiembre de 2026). **Pantalla para que cada administrador cambie su propia contraseña** (hoy no existe).
00000. La migración 0012 (`staff_sessions`) está aplicada: falta comprobar que la respuesta del cron incluya `"staff"`; avisar al personal del registro de conexiones en los términos de uso.
000. **Teléfonos:** tras entrar como visitante, el móvil no llega a la página «Después de conectar»: el asistente de portal cautivo del teléfono se cierra solo al detectar internet. Pendiente: probar en iOS/Android y decidir (página de éxito propia o aceptar el comportamiento).
00. **Aplicar la 0010 (`tenant_suspensions`) y poner `PLATFORM_ADMIN_EMAILS` en el `.env` del servidor** antes de usar `/platform`. Las migraciones 0008 y 0009 están aplicadas (la tabla `access_windows` ya existía al repetir la 0008). Probar equipos fijos en el router real. Probar horarios con un alumno y probar horarios con un alumno en la red de pruebas. La migración 0011 (`max_devices`) está aplicada: falta pulsar **Aplicar** en Ancho de banda (o «Guardar y probar» en `/platform`) para subir `shared-users` al router, y probar con dos dispositivos del personal. Separar equipos fijos (impresoras, pantallas) con excepción por MAC o red propia.
0. El acceso de invitados funciona en el router de prueba. Falta: comprobar **Visitantes** y las sesiones `g_…`, probar iOS y Android, y validar los puntos ⚠️ restantes de `docs/ROUTER-PRUEBA.md` sección 8 (walled garden y `login.html`). Validar los puntos ⚠️: variables `$(…-esc)` del `login.html`, walled garden por HTTPS, redirección por GET en iOS/Android.
1. Probar el editor en el portal desplegado: escribir términos, guardar, publicar y subir un logo (el servidor ya tiene el código de `f9eb619`).
2. **Router de prueba:** red aparte en `ether3` (bridge `bridge-hotspot`, `192.168.200.0/24`) y Hotspot. **Ejecutado**: Hotspot `hotspot-test` en `bridge-hotspot` (`ether3`, `192.168.200.0/24`), con DHCP propio; la redirección al login funciona y `srubend` inició sesión (visible en `/ip hotspot active`). Falta medir velocidad y ver el consumo en el portal. Comandos, verificación y reversión en `docs/ROUTER-PRUEBA.md`. Nunca activar el Hotspot sobre `bridge1`, `bridge2` ni las VLAN: es una red en uso.
3. Medir velocidad con un dispositivo real (esperado: 5 Mbps bajada, 2 de subida con el perfil Clientes). Si salen invertidas, cambiar el orden en `lib/mikrotik.ts`.
4. **Seguridad del router:** cambiar la contraseña del usuario `portal` (la de prueba se escribió en un chat) y deshabilitar `telnet`, `ftp`, `www`, `api`.
5. **Seguridad del servidor:** los puertos de Postgres/pooler (5432, 5433, 6543, 6544) están abiertos a internet y `ufw` está inactivo. Es de otras apps, pero es el riesgo mayor. Docker salta `ufw`: hay que publicarlos en `127.0.0.1`.
5a. **Verificar qué es `bytes-in` y `bytes-out` en RouterOS.** Por la documentación de MikroTik, `bytes-in` son los bytes que el router **recibe del cliente** (su subida) y `bytes-out` los que **le envía** (su descarga). El portal los etiqueta al revés (`bytesIn` como «Descarga») en **Consumo** y **Visitantes**, convención heredada del código original. Comprobar con una descarga grande en un dispositivo (`/ip hotspot active print stats`: si `bytes-out` crece mucho más que `bytes-in`, las etiquetas están invertidas) y corregir.
5a2. Falta guardar historial de consumo (hoy solo el total de cada sesión). Comprobar que las sesiones que venzan pasen a «Terminada» en **Visitantes**.
5b. **OTP por correo** (proveedor de correo), proceso en segundo plano para las sesiones, sedes y varios routers, panel con gráficas.
6. Guardar `usage_stats` con una tarea programada (hoy el consumo no tiene historial).
8. Fase 0 de SmartWiFi: prototipo de login externo del Hotspot (ver diseño, sección C) y validar lo marcado ⚠️.

## 6. Decisiones
**Tomadas**
- Supabase en la nube (no el self-hosted del servidor). Subdominio `connect`.
- Túnel WireGuard en lugar de exponer `www-ssl`; el router inicia la conexión.
- Certificado propio del router con huella fijada en el portal (no se desactiva la validación).
- Los datos de los invitados son de un solo establecimiento; sin cuentas de Supabase para invitados.
- El personal sigue con aprobación manual; los invitados serán de autoservicio.
- Nada de HTML, CSS ni JavaScript libres de los clientes en el portal.

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
| 2026-10-22 | Panel `/admin/stats` de estadísticas de visitantes (resumen diario, semanal, mensual) y enlace «Estadísticas» | `c48ce47` |
| 2026-10-22 | Botón «Guardar y publicar» en el editor del portal: el usuario escribió los términos pero publicaba el borrador guardado (sin términos) y no podía publicar | `437ce8e` |
| 2026-10-22 | «Después de conectar, ir a» también se aplica al personal que entra por «Soy del personal» | `eefaf21` |
| 2026-10-22 | Crear usuario desde **Usuarios** (`createUser`, `lib/create-user.ts`) con nombres de usuario únicos (`lib/usernames.ts`, también al aprobar). 74 pruebas, con los caminos de fallo y su deshacer. **Pendiente** de probar con Supabase Auth y el router reales | `b503357` |
| 2026-10-22 | Migración 0009 (`fixed_devices`) aplicada en Supabase según el usuario; falta comprobar la tabla y probar un equipo fijo en el router | `d51dd04` |
| 2026-10-22 | `/register` vuelve a renderizar el formulario en el servidor con el código precargado desde `?school=` (la versión con `Suspense` solo lo mostraba tras JavaScript). Comprobado con `curl` en local | `a0188ba` |
| 2026-10-22 | Portal del invitado: sección «Soy del personal» (usuario y contraseña del Hotspot, directo al login del router) y enlace al registro con el código precargado. Probado con navegador contra simuladores; pendiente en el router real | `792b34b` |
| 2026-10-23 | Sección «Preguntas frecuentes» dentro del panel (`/admin/help`) con el manual del administrador y buscador | `43df9f5` |
| 2026-10-23 | Rediseño del panel: menú lateral, Inicio con contadores, tablas de Ancho de banda y Usuarios más claras | `41c95d9` |
| 2026-10-23 | Página de inicio pública (landing) en `/` y manual del administrador (página aparte, no está en el repositorio) | `cff003b` |
| 2026-10-23 | Confirmado: migración 0012 aplicada en Supabase | `34d6da6` |
| 2026-10-23 | Historial de conexiones de los usuarios del portal (`/admin/staff-history`, migración 0012, registro desde el cron) | `48d3e29` |
| 2026-10-23 | Pantalla «Conectados ahora» (`/admin/connected`) con sesiones activas del Hotspot | `b034dbc` |
| 2026-10-23 | Confirmado: migración 0011 aplicada en Supabase | `18b4a3b` |
| 2026-10-23 | Personal con 2 dispositivos: `max_devices` por rol (migración 0011) y `shared-users` en el perfil del Hotspot | `f2fd718` |
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
