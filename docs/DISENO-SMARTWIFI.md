# Diseño: SmartWiFi Analytics sobre el portal actual

Entregables A, B, C, D, E y F del prompt (`docs/PROMPT-SMARTWIFI.md`). Es una **propuesta para aprobar**, no código. Lo marcado con ⚠️ no está verificado y se valida en el laboratorio de la Fase 0.

## 0. Decisiones de diseño (resumen)
| Tema | Decisión recomendada | Por qué |
|---|---|---|
| Base | Se mantiene Next.js + Supabase + Docker + WireGuard | Ya funciona y está desplegado |
| Login del invitado | Hotspot de MikroTik con **login externo** al portal; el portal crea un usuario temporal en el router por REST | No añade servicios nuevos en la Fase 1 |
| Medición de sesiones | Worker en el VPS que consulta `/ip/hotspot/active` por túnel | Supabase en la nube no alcanza los routers (solo el VPS tiene el túnel) |
| RADIUS | Fase 3, no antes | Da contabilidad exacta y soporta UniFi/Omada, pero es otro servicio que operar |
| Datos personales | Cifrados en la aplicación (AES-GCM, como las credenciales del router) + hash para búsquedas | Reutiliza `lib/crypto.ts` |
| Invitados | Sin cuenta de Supabase Auth; todo por server actions con service role | Un invitado no es un usuario del panel |
| Alcance de datos | Los invitados pertenecen a **un** establecimiento; no se comparten entre clientes | Privacidad y simplicidad legal |

## A. Arquitectura

```
 Invitado (móvil)                      Internet                      VPS use-services2026
 ┌───────────┐   1. HTTP cualquiera  ┌──────────┐                ┌────────────────────────────┐
 │  SSID     │ ───────────────────▶  │ MikroTik │ 2. login.html  │ nginx (443)                │
 │  Hotspot  │ ◀──── redirige ─────  │ Hotspot  │ ── redirige ─▶ │  └─ portal Next.js :8120   │
 └───────────┘                       └────┬─────┘  al portal     │       ├─ /w/{local}  invitado
       ▲  6. login con usuario temporal   │                      │       └─ /admin/...  panel
       │  (redirección GET a /login)      │  WireGuard 10.99.x.x │ worker (nuevo contenedor)  │
       └──────────────────────────────────┤◀────────────────────▶│  ├─ sondea /ip/hotspot/... │
                                          │  REST (www-ssl)      │  ├─ cierra sesiones y limpia│
                                          └──────────────────────┤  └─ calcula agregados      │
                                                                 └───────────┬────────────────┘
                                                                             │ service role
                                                                  Supabase (nube): Postgres + RLS + Auth
                                                                             │
                                                           Proveedores externos: correo / SMS / WhatsApp
```

**Qué se queda:** portal, Supabase, nginx, túnel, `lib/mikrotik.ts`, `lib/crypto.ts`, roles por tipo de establecimiento, aprobación manual para el personal.

**Qué se añade:**
1. Ruta pública `/w/{local}` (portal del invitado) y su configuración por local.
2. Un contenedor **`worker`** en el mismo `docker-compose.yml` (misma imagen, otro comando). Tareas: sondear sesiones activas por router, cerrar sesiones vencidas, borrar usuarios temporales, calcular agregados diarios. Primero con un planificador simple dentro del proceso; Redis/BullMQ solo si la carga lo exige.
3. Interfaz `OtpSender` con implementaciones: simulada (guarda el código en la base, solo desarrollo), correo, SMS, WhatsApp.
4. Script de aprovisionamiento por router: genera claves WireGuard, asigna IP de túnel y emite el bloque de comandos RouterOS.
5. Modelo de datos nuevo (sección B) y migraciones del estilo actual.

**Reutilización en `lib/mikrotik.ts`:** añadir `createGuestUser`, `getActiveSessions`, `findHost` y `removeUser`. Siguen el mismo patrón: `rest()`, huella fijada, modo simulado y tiempos de espera.

## B. Modelo de datos (migraciones desde `0006`)

Convención: toda tabla lleva `tenant_id`, RLS activo, sin políticas de escritura para clientes (escriben el servidor y el worker con service role).

| Tabla | Campos clave | Notas |
|---|---|---|
| `venues` | `tenant_id`, `name`, `slug` único, `timezone` | Una sede/local. Se crea una por cada tenant existente |
| `venue_routers` | `venue_id`, URL, usuario, contraseña cifrada, huella, `tunnel_ip` | Sustituye a `tenant_router_credentials` (se migran los datos). Un local puede tener varios routers |
| `venue_portal_settings` | `venue_id`, logo, colores, idiomas, métodos activos, URL de destino, versión de términos | Personalización del portal |
| `venue_guest_plans` | `venue_id`, `method`, bajada/subida kbps, minutos de sesión, minutos diarios | Velocidad y duración por método de acceso |
| `guests` | `tenant_id`, `phone_enc`, `phone_hash`, `email_enc`, `email_hash`, nombre, `first_venue_id`, `first_seen_at`, `last_seen_at`, `visit_count` | PII cifrada; el hash (HMAC con clave aparte) permite buscar sin descifrar |
| `guest_devices` | `guest_id`, `mac_hmac`, familia del navegador, `first_seen_at`, `last_seen_at` | La MAC no se guarda en claro; solo vive en memoria durante el login |
| `consents` | `guest_id`, `venue_id`, `kind` (`terms`/`marketing`), `text_version`, `text_hash`, `granted`, `at`, `withdrawn_at`, IP y agente | Registro auditable; el retiro no borra la fila, añade fecha |
| `otp_challenges` | `venue_id`, destino (hash), código (HMAC), `expires_at`, `attempts`, canal, IP | Códigos de 6 dígitos, vigencia de 5 min |
| `guest_sessions` | `venue_id`, `guest_id`, `device_id`, `hotspot_username`, `method`, `started_at`, `ended_at`, `bytes_in`, `bytes_out`, `ip` | Se alimenta del worker |
| `venue_daily_stats` | `venue_id`, `day`, únicos, nuevos, recurrentes, sesiones, duración media, bytes | Agregado diario para que los paneles no recorran sesiones |
| `segments` | `tenant_id`, nombre, reglas (jsonb) | Fase 2 |
| `campaigns` / `campaign_events` | tipo, contenido (jsonb), segmento, vigencia / `kind` (`impression`, `click`, `redeem`) | Fase 2 |
| `vouchers` | `venue_id`, código, plan, validez, `used_at` | Fase 2 |
| `resellers`, `reseller_members` | marca, dominio / usuario↔revendedor | Fase 3; `tenants.reseller_id` |

**RLS:**
- Personal del tenant: `tenant_id = current_tenant() and is_admin()` para lectura. Roles nuevos `venue_manager` y `marketing` (migración de enum aparte, como `0003`) acotados a sus sedes con una tabla `profile_venues`.
- Revendedor (Fase 3): función `my_reseller_tenants()` con lectura de agregados. No se amplía `current_tenant()`.
- Invitados: ninguna política. Solo server actions.
- Tests de aislamiento obligatorios en cada fase: entre tenants, entre sedes, entre roles y contra `anon`.

**Retención:** tarea que anonimiza `guests` inactivos pasado un plazo configurable por tenant (propuesta inicial: 24 meses, a validar con el abogado) y atiende solicitudes de acceso, rectificación y eliminación.

## C. Integración con MikroTik (Hotspot con login externo)

### Flujo
1. El invitado se conecta, el DHCP le da IP y abre una web HTTP. El Hotspot lo redirige a `/login`.
2. `login.html` (personalizado, en la carpeta `hotspot/` del router) redirige al portal:
   `https://connect.useservices.company/w/{local}?mac=$(mac-esc)&ip=$(ip)&login=$(link-login-only-esc)&orig=$(link-orig-esc)&err=$(error-esc)`
3. El portal muestra la página del local: método de acceso, términos y casilla de marketing.
4. **Verificación de la MAC/IP.** El router no firma esos parámetros, así que el portal los trata como una afirmación: consulta `/ip/hotspot/host` por túnel y confirma que ese IP↔MAC existe y está sin autenticar. Evita enlazar la visita a un dispositivo ajeno.
5. El invitado completa el método (OTP, voucher, etc.). El servidor guarda al invitado, el consentimiento y una `guest_session` pendiente.
6. El servidor crea el usuario en el router: `PUT /ip/hotspot/user` con nombre `g_<id corto>`, contraseña aleatoria, perfil del plan, `limit-uptime` y `comment` con el id de sesión.
7. El portal responde con una **redirección GET de nivel superior** a `http://<router>/login?username=…&password=…&dst=<orig>`. Se usa GET y no un formulario POST para evitar el aviso de formulario inseguro en navegadores y asistentes de portal cautivo (iOS/Android) ⚠️.
8. El router autentica al cliente y abre la sesión.
9. El worker, cada ~60 s por router, lee `/ip/hotspot/active`, actualiza bytes y duración, y cierra las sesiones que desaparecen. Los usuarios temporales vencidos se borran con `DELETE`.

### Configuración del router (por local)
- Perfil del hotspot con `login-by=http-pap` (contraseña de un solo uso y vida corta; viaja por la red local) y `http-cookie-lifetime` según el plan.
- **Walled garden** para que el invitado alcance el portal antes de iniciar sesión: `walled-garden` por nombre y, si no basta para HTTPS, `walled-garden ip` con la IP del VPS ⚠️. Incluir los dominios del proveedor de OTP si se usa un widget externo.
- Red del Hotspot en su propio puente y subred (como la prueba en `ether3`); no se activa sobre redes existentes.

### Fallos y resiliencia
| Caso | Comportamiento |
|---|---|
| Portal caído | `login.html` muestra una página estática de “servicio no disponible”. Opcional por local: modo de emergencia con acceso de prueba de pocos minutos (apagado por defecto) |
| REST del router no responde | El portal muestra reintento; la creación es idempotente por id de sesión |
| Túnel caído | El worker marca el router como “sin enlace”, alerta y reintenta con espera creciente |
| Router reiniciado | Las sesiones se reconcilian al volver a sondear |
| Varias sedes | Un par WireGuard por router, con IP de túnel asignada desde `venue_routers.tunnel_ip` y generada por el script de aprovisionamiento |

### Rendimiento
El hEX lite de pruebas (64 MB de RAM, un solo núcleo) sirve para validar el flujo, **no** para producción con muchos clientes simultáneos. Para locales reales usar equipos con más memoria y un AP aparte. El sondeo debe usar `/ip/hotspot/active` (solo sesiones vivas), no recorrer todos los usuarios.

### UniFi, Omada y RADIUS (Fase 3)
FreeRADIUS accesible solo por el túnel, con contabilidad (`Acct-Session-Time`, octetos) y base de usuarios en Postgres. Cubre UniFi y Omada con un portal externo. Sustituye el sondeo por contabilidad exacta.

## D. Roadmap

### Fase 0, laboratorio (1 semana)
Prototipo mínimo en la red de `ether3`: `login.html` externo, walled garden, usuario temporal por REST y redirección GET.
**Aceptación:** conexión completa desde un iPhone y un Android; sesión visible en `/ip/hotspot/active`; el límite de velocidad medido coincide con el plan; resultados de lo marcado ⚠️ documentados.

### Fase 1, invitados con datos propios (~4 semanas)
Locales y routers, ajustes del portal, métodos de acceso (correo y teléfono con OTP; voucher si sobra tiempo), consentimiento, sesiones, worker, panel con visitas (únicos, nuevos vs. recurrentes, horas pico) y exportación CSV.
**Aceptación:**
- Un invitado nuevo navega en menos de 60 s desde que abre el portal.
- Un invitado recurrente se reconoce como tal en el panel.
- Con el portal caído, el cliente ve la página de servicio no disponible.
- RLS probado entre tenants y entre sedes.
- Una solicitud de eliminación borra o anonimiza al invitado en el mismo día.
- Modo simulado intacto.

### Fase 2, marketing (~4 semanas)
Campañas posteriores a la conexión (banner, cupón, encuesta), segmentos, correo y WhatsApp solo a quienes consintieron, agregados diarios, PDF, alertas, vouchers y QR.
**Aceptación:** una campaña se muestra solo al segmento elegido y mide impresiones, clics y canjes; nadie sin consentimiento recibe mensajes.

### Fase 3, reventa y escala (~4 semanas)
Revendedor con marca y subdominio, facturación por sede o AP, FreeRADIUS y contabilidad, UniFi/Omada, filtrado DNS opcional, API y webhooks.

## E. Riesgos
| Riesgo | Efecto | Mitigación |
|---|---|---|
| MAC aleatoria en móviles | Cuesta reconocer el mismo dispositivo | El reconocimiento descansa en la identidad (teléfono/correo); la MAC es un dato auxiliar. Medir el efecto en la Fase 0 |
| Datos personales | Sanciones y pérdida de confianza | Consentimiento separado y registrado, cifrado, retención, derechos de acceso/eliminación. Referencia: Ley 81 de 2019 y su reglamento (Decreto Ejecutivo 285 de 2021). **Confirmar con un abogado antes de lanzar** |
| Abuso de OTP/SMS (costo) | Facturas altas, bloqueo del proveedor | Límite por destino e IP, 5 intentos por código, CAPTCHA al pedir el código, tope diario por local |
| Portal cautivo en iOS/Android | Mini‑navegador rechaza redirecciones o contenido mixto | Redirección GET de nivel superior; probar en la Fase 0 ⚠️ |
| HTTPS en el walled garden | El invitado no alcanza el portal | Entrada por IP del VPS si el nombre no basta ⚠️ |
| Carga en routers pequeños | Cortes o lentitud | Sondeo ligero, equipos adecuados, límite de usuarios por modelo |
| Un solo VPS compartido | El portal cae si caen otras apps | Aislar recursos; plan de migración a un servidor propio al crecer |
| Contraseñas y claves | Fuga | `ROUTER_CRED_KEY` y la clave de los hashes respaldadas fuera del servidor; rotación documentada |
| PAP sobre HTTP en la LAN | Captura de credenciales en la red del local | Credencial de un solo uso, vida corta, `shared-users=1`, borrado al terminar |

## F. Modelo comercial (hipótesis a validar)
No hay cifras de mercado verificadas aquí; esto es un marco para llenar con datos reales.

- **Planes por sede y mes:** Básico (portal, panel, exportación), Pro (campañas, segmentos, alertas), Cadena (varias sedes, marca propia).
- **Cargos variables:** mensajes de SMS/WhatsApp a costo del proveedor más margen; AP adicionales por encima de un tope.
- **Revendedor:** USE Services compra con descuento y fija su precio final; el portal de revendedor muestra consumo y facturación por cliente.
- **Costo por sede** = servidor y base (prorrateado) + mensajes del mes + soporte. Margen = precio del plan − ese costo.

Antes de fijar precios: consultar las tarifas actuales de los proveedores de mensajería, cotizar el hardware recomendado y comparar con 2 o 3 ofertas locales.

## Preguntas abiertas (con recomendación)
1. **Primer canal de OTP.** Recomiendo empezar con correo (barato, sin plantillas aprobadas) y añadir WhatsApp después; en Panamá el teléfono suele convertir mejor, pero requiere proveedor y costos.
2. **Vigencia de datos.** Propongo 24 meses para datos identificables, configurable por tenant; confirmar con el abogado.
3. **Dónde corre el worker.** En el mismo VPS, otro contenedor. Alternativa: servidor aparte si el VPS compartido se queda corto.
4. **Locales existentes.** Convertir cada tenant actual en un tenant con una sede, sin pérdida de datos.
5. **Hardware de prueba siguiente.** Sugiero un equipo con más memoria que el hEX lite para medir carga real en la Fase 0.
