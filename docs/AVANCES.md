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
| 0006 | Personalización del portal: `portal_versions`, publicación atómica, bucket `portal-assets` | Aplicada. Bucket comprobado (`portal-assets`, privado). La tabla `portal_versions` se da por creada porque el bucket es lo último que hace el script; no se ha mostrado su conteo |

## 4. Funcionalidad hecha
| Área | Qué hay | Verificado |
|---|---|---|
| Registro | `/register-school` (tipo de establecimiento) y `/register` (roles según tipo) | En producción de pruebas |
| Aprobación | Admin aprueba, fija rol, crea usuario en el Hotspot y muestra la contraseña una sola vez | Probado con un usuario real: aparece en `/ip hotspot user` con su perfil |
| Perfiles de velocidad | Se crean y sincronizan en el router al aprobar o al pulsar Aplicar. Formato `rate-limit=subida/bajada` (p. ej. `2048k/5120k`) | Creado y visible en el router; un usuario ya inició sesión en el Hotspot de prueba; **falta medir velocidad con un dispositivo real** |
| Conexión al router | URL, usuario, contraseña cifrada (AES-256-GCM) y huella SHA-256 fijada | Funciona por el túnel |
| Consumo | Lee `/ip/hotspot/user`. Sin historial guardado todavía | Carga sin error |
| Portal personalizable | Editor `/admin/portal`, vista previa, publicación, historial, logo y fondo; portal público `/w/{código}` (simulado) | Pruebas unitarias, RLS en Postgres local y portal público contra un Supabase simulado. **El editor y la subida de imágenes no se han probado con sesión real** |
| Seguridad | Credenciales del router cifradas, RLS, escritura solo por service role en tablas sensibles, CSP en `/w/*` | Ver `CLAUDE.md` |
| Despliegue | Docker, nginx y HTTPS | En producción de pruebas |
| Pruebas | `npm test` (8), `supabase/tests/portal_rls.sql` | Pasan |

## 5. Pendientes (por prioridad)
1. Probar el editor en el portal desplegado: escribir términos, guardar, publicar y subir un logo (el servidor ya tiene el código de `f9eb619`).
2. **Router de prueba:** red aparte en `ether3` (bridge `bridge-hotspot`, `192.168.200.0/24`) y Hotspot. **Ejecutado**: Hotspot `hotspot-test` en `bridge-hotspot` (`ether3`, `192.168.200.0/24`), con DHCP propio; la redirección al login funciona y `srubend` inició sesión (visible en `/ip hotspot active`). Falta medir velocidad y ver el consumo en el portal. Comandos, verificación y reversión en `docs/ROUTER-PRUEBA.md`. Nunca activar el Hotspot sobre `bridge1`, `bridge2` ni las VLAN: es una red en uso.
3. Medir velocidad con un dispositivo real (esperado: 5 Mbps bajada, 2 de subida con el perfil Clientes). Si salen invertidas, cambiar el orden en `lib/mikrotik.ts`.
4. **Seguridad del router:** cambiar la contraseña del usuario `portal` (la de prueba se escribió en un chat) y deshabilitar `telnet`, `ftp`, `www`, `api`.
5. **Seguridad del servidor:** los puertos de Postgres/pooler (5432, 5433, 6543, 6544) están abiertos a internet y `ufw` está inactivo. Es de otras apps, pero es el riesgo mayor. Docker salta `ufw`: hay que publicarlos en `127.0.0.1`.
6. Guardar `usage_stats` con una tarea programada (hoy el consumo no tiene historial).
7. Tests de RLS del resto de tablas (hoy solo están las del portal).
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
| 2026-10-22 | Hotspot de prueba configurado y probado: redirección al login y sesión de `srubend` activa (192.168.200.198). Se ve el login estándar de MikroTik: el portal personalizado aún no está conectado al Hotspot | (este) |
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
