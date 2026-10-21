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

## G. Comparativa con Datawifi (según el texto de su página principal)
Base: texto copiado de `datawifi.co` por el usuario. Es lo que la empresa dice de sí misma; las cifras no están verificadas y la página no explica cómo funciona por dentro (integración con equipos, almacenamiento, retención). Las propuestas de abajo son nuestras.

| Elemento observado | Estado en este diseño | Propuesta |
|---|---|---|
| Portal con marca y experiencia personalizada | Cubierto (módulo 1) | Fase 1 |
| Registro y segmentación de usuarios | Cubierto (módulos 2 y 3) | Fase 1 y 2 |
| Datos "seguros, visuales e integrables" | Cubierto en parte: paneles, exportación y cifrado | API y webhooks en Fase 3 |
| **IA que convierte conexiones en insights (DSM)** | No cubierto | Fase 3, ver G.1 |
| Compatibilidad con muchos fabricantes (más de 40 homologaciones) | Solo MikroTik en las Fases 0 a 2 | Fase 3: UniFi, Omada y RADIUS; priorizar por los equipos que ya usen los clientes |
| Integraciones con redes sociales, CRM y pagos | Parcial: CRM por webhooks. Sin pagos ni login social | Decidir en G.2 |
| Programa de partners (BPS) | Cubierto como revendedor | Fase 3 |
| FlowMetrics: presencia y permanencia, clasificación del público en tiempo real, mapas de calor y flujos | Presencia por sondeo, diferida | Fase 4, ver G.3 |
| SmartFilter: acceso a internet por zonas, horarios y perfiles, con visibilidad del uso | Filtrado DNS opcional, diferido | Horarios por rol en Fase 2; zonas y filtrado en Fase 3, ver G.4 |
| Sectores: banca, comercial, educación, gobierno, hotelería, venue, retail, estadio, corporativo, transporte | Cuatro tipos de establecimiento | Ampliar `establishment_type` según el primer cliente real de cada sector |
| Venta con demo y expertos regionales | No aplica al producto | Preparar un entorno demo con datos simulados |
| Páginas legales completas | Parcial | Aviso de privacidad, términos y cookies por local, con el abogado |
| Compra de portal "básico" vs "inteligente" | No aplica | Usar la distinción en los planes (Básico / Pro) |

### G.1 Motor de insights (equivalente a DSM)
Su descripción es "datos de calidad + reglas de negocio + IA". Propuesta alineada con nuestra privacidad:
1. **Datos de calidad:** los agregados diarios (`venue_daily_stats`), ya depurados (sesiones cerradas, duplicados, MAC repetida).
2. **Reglas de negocio deterministas:** un motor de reglas calcula hallazgos medibles y reproducibles. Ejemplos: "los martes por la noche caen las visitas un 30 % frente a la media", "el 40 % de los nuevos no vuelve en 30 días", "campaña X con canje inferior al umbral".
3. **IA solo para redactar y recomendar:** el modelo recibe los hallazgos agregados y devuelve un resumen y acciones sugeridas en lenguaje claro. **No recibe datos personales** (ni teléfonos, correos ni MAC), solo cifras agregadas.
4. **Salida:** resumen semanal por local en el panel y por correo, con enlace a los gráficos que respaldan cada afirmación.
5. **Control:** cada recomendación muestra la regla y los datos que la originaron, y se puede marcar como útil o descartada.

Criterio de aceptación: en un local con datos simulados, el resumen cita cifras que coinciden con el panel, y no incluye ningún dato personal.

### G.2 Decisiones pendientes
1. **Pagos.** ¿Hay WiFi de pago o por planes en los primeros clientes? Si sí, se añade una pasarela (Fase 2) y un tipo de plan con precio; si no, se deja fuera.
2. **Login social.** Las plataformas cambian sus APIs de WiFi con frecuencia; recomiendo no depender de ello al inicio y ofrecer correo y teléfono.
3. **Más sectores.** Qué tipos de establecimiento añadir además de los cuatro actuales.
4. **IA.** Qué proveedor de modelos se usa para los resúmenes y dónde corre, con la regla de no enviar datos personales.

### G.3 Presencia y movilidad (equivalente a FlowMetrics)
Su página lo describe como análisis de presencia y permanencia, clasificación del público en tiempo real, mapas de calor y flujos. No dice cómo lo logra; lo siguiente es nuestra evaluación técnica.

**Lo que se puede hacer según el equipo disponible**
| Capacidad | Qué necesita | Con el hardware actual |
|---|---|---|
| Visitas y permanencia de quienes **se conectan** | El Hotspot y las sesiones de la Fase 1 | Sí, ya está en el diseño |
| Presencia de dispositivos **sin conectar** (sondeo) | Que los puntos de acceso reporten las señales de dispositivos cercanos | No: MikroTik con Hotspot no lo entrega de forma útil |
| Mapas de calor y flujos entre zonas | Varios puntos de acceso con intensidad de señal y un plano del local, o un controlador que estime posiciones | No; requiere controladores como UniFi u Omada |
| Clasificación del público (nuevo/recurrente, personal/visitante) | Permanencia y frecuencia por dispositivo o por persona | Parcial; el personal se separa porque ya tiene cuenta en el portal |

**Condiciones para hacerlo**
1. **Base legal.** Medir a personas que no se han conectado ni aceptado nada es la parte más sensible. Solo con asesoría legal, aviso visible en el local y datos anonimizados al origen (sin guardar MAC ni identificadores en claro).
2. **Precisión limitada.** La MAC aleatoria de los móviles modernos hace que un mismo dispositivo aparezca como varios y deprime el conteo de recurrentes. Las cifras deben presentarse como estimaciones.
3. **Hardware.** Las zonas y los mapas de calor exigen más de un punto de acceso por área y un controlador compatible. Se vincula con la Fase 3 (UniFi, Omada, RADIUS).
4. **Privacidad en el diseño.** Agregar por zona y franja horaria en el equipo o en el worker, y almacenar solo conteos, nunca trazas individuales.

**Propuesta:** Fase 4, después de tener el piloto en producción y un controlador compatible instalado en un cliente real. Primero se entrega permanencia y visitas de quienes se conectan (ya incluido), que da gran parte del valor sin el riesgo legal.

### G.4 Políticas de acceso (equivalente a SmartFilter)
Su página lo describe como gestión del acceso a internet por **zonas, horarios y perfiles**: qué se puede navegar, cuándo y dónde, con políticas flexibles y visibilidad del uso. No menciona bloqueo de malware; mi suposición anterior de "filtrado DNS" era solo una parte posible. En el portal ya existe un perfil por rol con límites de velocidad; la extensión natural es añadir políticas al mismo modelo.

**Modelo propuesto**
- `venue_zones`: zonas de un local (por ejemplo "Aulas", "Recepción", "Terraza"), cada una ligada a un servidor Hotspot o interfaz del router.
- `access_policies`: nombre, horario semanal (ventanas permitidas por día), categorías o dominios bloqueados y lista de dominios siempre permitidos.
- Asignación de una política a un rol, un plan de invitados o una zona.
- `usage_events` agregados por política y categoría (solo conteos, sin historial individual).

**Cómo se aplicaría en MikroTik** ⚠️ (a validar en el laboratorio)
| Necesidad | Mecanismo posible |
|---|---|
| Horarios | `time=` en reglas de firewall o `/system scheduler` que activa y desactiva reglas; `limit-uptime` y `session-timeout` por perfil |
| Zonas | Un servidor Hotspot por interfaz o puente, con su propio perfil |
| Bloqueo por dominio | Reglas de firewall con coincidencia de nombre en TLS (`tls-host`) o entradas DNS estáticas; sin descifrar tráfico |
| Filtrado por categoría | Redirigir el DNS de un perfil a un resolvedor con filtros de categorías mediante listas de direcciones y `dst-nat` |
| Visibilidad del uso | Contadores del router por lista de direcciones; no registrar sitios visitados por persona |

**Privacidad:** no guardar el historial de navegación de personas. Se mide por categoría y política en conjunto, y el aviso del portal debe decir qué se filtra.

**Fases:**
- **Fase 2:** horarios por rol y por plan, que ya tienen valor en escuelas, hoteles y oficinas y no requieren filtrado.
- **Fase 3:** zonas y bloqueo por categoría o dominio, con el panel de uso agregado.

## H. Personalización del portal por establecimiento (requisito)
Cada establecimiento (y, si hace falta, cada local) controla cómo se ve y qué dice su portal. Esto sustituye la lista corta de `venue_portal_settings` del apartado B.

### H.1 Qué se puede personalizar
| Área | Opciones | Límites |
|---|---|---|
| Identidad | Nombre visible, logo, imagen o color de fondo, color principal y de acento, color de texto, radio de los botones, tipografía | Tipografías de una lista cerrada, alojadas en nuestro dominio. Logo PNG, WebP o SVG de hasta 512 KB |
| Plantilla | 3 diseños predefinidos: tarjeta centrada, imagen dividida, fondo completo | Sin HTML ni CSS libre |
| Textos | Título, subtítulo, etiquetas de botones, mensaje de bienvenida, pie, enlace a la política de privacidad | Español e inglés; se elige por el idioma del navegador, con uno por defecto |
| Términos y condiciones | Texto propio con **versiones** | Cambiar el texto crea una versión nueva y exige un nuevo consentimiento |
| Acceso | Métodos activos y su orden, y qué datos se piden (nombre, correo, teléfono, campos opcionales) | Mínimos por defecto; cada campo extra se marca obligatorio u opcional y avisa que debe justificarse legalmente |
| Después de conectar | URL de destino, banner, cupón o encuesta (Fase 2) | Solo `https://`, con lista de dominios permitidos |
| Planes de red | Velocidad y duración por método | Se configura en `venue_guest_plans` |

### H.2 Cómo funciona
- **Borrador y publicación:** los cambios se editan como borrador y se publican con un clic. Se guarda el historial y se puede volver a una versión anterior.
- **Vista previa:** en escritorio y móvil, en modo simulado (sin router), antes de publicar.
- **Contraste:** la edición avisa o impide combinaciones de color por debajo de AA (legibilidad).
- **Quién edita:** `superadmin`, `director` y `manager` editan todo; `venue_manager` solo sus locales; `marketing` edita textos y diseño, pero **no** los términos legales.
- **El router no se toca:** el `login.html` del Hotspot es el mismo para todos y solo redirige al portal. Cambiar el diseño no requiere acceder al router.

### H.3 Seguridad (un portal cautivo pide datos personales, así que es objetivo de suplantación)
1. **Sin HTML, CSS ni JavaScript libres** de los clientes: solo campos estructurados y plantillas nuestras. Evita XSS y portales falsos con nuestro dominio.
2. **Imágenes:** validar el tipo real del archivo, tamaño y dimensiones, quitar metadatos y sanear los SVG (o convertirlos a PNG).
3. **Alojamiento de recursos en el dominio del portal.** Las imágenes se sirven con una ruta del portal (`/w/{local}/assets/...`) aunque estén en Supabase Storage, sin CDN ni fuentes de terceros. Así el walled garden del router solo necesita permitir el dominio y la IP del portal.
4. **Cabeceras:** CSP estricta en `/w/*`, sin scripts de terceros y sin cookies de seguimiento.
5. **URLs:** solo `https://`, nunca `javascript:` ni `data:`, y con lista de dominios permitidos por local.
6. **Rendimiento:** página renderizada en el servidor, con JavaScript mínimo y menos de unos 150 KB, porque los mini-navegadores de portal cautivo de iOS y Android son limitados ⚠️.

### H.4 Modelo de datos
- `venue_portal_versions`: `venue_id`, `version`, `status` (`draft` o `published`), `settings` (jsonb validado en el servidor con un esquema), `created_by`, `created_at`, `published_at`.
- Una sola versión publicada por local, y una restricción única que lo garantiza.
- Los términos viven en `venue_terms` (`venue_id`, `version`, `locale`, `text`, `text_hash`) y los consentimientos apuntan a esa versión.
- Los archivos (logo, fondo) en un bucket privado de Supabase Storage, con una tabla `venue_assets` que guarda dueño, tipo, tamaño y hash.
- RLS por `tenant_id`; la lectura pública del portal pasa por el servidor, sin política abierta.

### H.5 Dominios propios (white-label, Fase 3)
`{local}.connect.useservices.company` con certificado comodín (requiere validación DNS) y dominios propios del cliente (`wifi.cliente.com`) con su certificado. Cada dominio nuevo debe poder alcanzarse desde el walled garden, y como todos resuelven a la misma IP del VPS basta con permitir esa IP.

### H.6 Criterios de aceptación (Fase 1)
- Un administrador cambia logo, colores, textos e idioma, y publica en menos de 5 minutos, sin tocar el router.
- Dos establecimientos distintos muestran portales distintos en el mismo servidor.
- Una combinación de colores ilegible se detecta antes de publicar.
- Un archivo que no es una imagen válida o un SVG con scripts se rechaza.
- Cambiar los términos fuerza un nuevo consentimiento en la siguiente visita.
- Un usuario de un establecimiento no puede ver ni editar el portal de otro (prueba de RLS).
- La página pública pesa menos del límite y funciona sin JavaScript de terceros.
