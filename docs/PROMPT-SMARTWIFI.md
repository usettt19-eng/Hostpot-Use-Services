# Prompt para evolucionar el portal a una plataforma de WiFi inteligente

Pégalo en una sesión de Claude Code abierta en este repo, o pásalo a un equipo de desarrollo. Está escrito para **extender el portal que ya existe**, no para empezar de cero.

```text
Actúa como arquitecto de software senior y desarrollador full-stack, con experiencia en redes MikroTik, plataformas SaaS multi-tenant, analítica de audiencias y protección de datos personales.

CONTEXTO (léelo en el repo antes de proponer nada: CLAUDE.md, docs/, supabase/migrations/)
Ya existe un portal funcionando en producción de pruebas:
- Next.js 15 (App Router) + TypeScript, Supabase (Auth + Postgres + RLS), Docker detrás de nginx, dominio connect.useservices.company.
- Multi-tenant por establecimiento (school, restaurant, pub, hotel) con roles propios por tipo.
- MikroTik RouterOS v7 por REST sobre un túnel WireGuard, certificado autofirmado con huella fijada (lib/mikrotik.ts), modo simulado sin router.
- Flujo actual: el usuario se registra, un administrador lo aprueba, el portal crea el usuario en /ip/hotspot/user con el límite de velocidad de su rol. Panel de consumo leyendo bytes-in/out.
Reglas que NO se rompen (están en CLAUDE.md): service role solo en servidor; llamadas al router solo desde el servidor; no loguear credenciales; UI en español; RLS en todas las tablas con tests; migraciones numeradas y reversibles; modo simulado se mantiene.

OBJETIVO
Convertir el portal en "SmartWiFi Analytics" para negocios de Panamá y Latinoamérica: WiFi cautivo que captura clientes con consentimiento, mide la audiencia, permite campañas de marketing y se puede revender a otros negocios. Crea una marca, textos y diseño propios; no copies los de ningún competidor.

DIFERENCIA CLAVE CON LO QUE YA HAY
Hoy el acceso es "registro + aprobación manual". La nueva experiencia es de AUTOSERVICIO para invitados: el visitante se conecta, ve el portal cautivo de ese local, se identifica (teléfono con OTP, correo, voucher o QR), acepta términos y navega, sin intervención de un administrador. El modelo de aprobación actual se conserva para el personal (empleados, staff).

MÓDULOS (en este orden de prioridad)
1. Portal cautivo propio por local: el Hotspot de MikroTik redirige al portal (login externo), el portal autentica al invitado y le crea la sesión en el router (REST o RADIUS). Personalizable por establecimiento: logo, colores, idioma (es/en), términos, métodos de acceso activos, redirección posterior. Duración de sesión y perfil de velocidad por método de acceso.
2. Consentimiento y datos: consentimiento explícito y separado para marketing, registro de cuándo y con qué texto se aceptó, derecho de acceso, rectificación y eliminación, retención configurable. Referencia legal: Ley 81 de 2019 de Panamá (protección de datos personales) y su reglamento; GDPR como buena práctica. Señala qué debe revisar un abogado.
3. Visitantes y dispositivos: perfil por persona y por MAC (aleatoria en móviles modernos: considera el impacto), historial de visitas, frecuencia, recencia, sede. Segmentos automáticos: nuevos, recurrentes, VIP, inactivos.
4. Analítica: conexiones, únicos, nuevos vs. recurrentes, duración media, picos por hora/día, tráfico, por sede y por local. Alimentada por /ip/hotspot/active y los contadores del router (job programado que guarde usage_stats y sesiones). Exportación CSV y PDF. Alertas básicas (router sin respuesta, saturación).
5. Marketing: banner/cupón/encuesta mostrados tras conectar, mensajes por correo o WhatsApp solo a quienes consintieron, campañas por segmento, métricas de impresiones, clics y canjes.
6. Revendedor (white-label): un operador (USE Services) crea y gestiona varios clientes con su propia marca y subdominio, con facturación por sede o por punto de acceso.
7. Fase posterior: integración UniFi/Omada/RADIUS genérico, filtrado DNS, presencia por sondeo (solo con base legal), facturación electrónica de Panamá, webhooks y API pública.

ENTREGABLES
A. Propuesta de arquitectura sobre el stack actual: qué se queda, qué se añade (por ejemplo un servicio de jobs y, si conviene, FreeRADIUS) y por qué. Diagrama.
B. Modelo de datos: migraciones nuevas (venue/sede, guest, device, session, consent, campaign, impression, reseller), con RLS por tenant y por rol, y los tests de aislamiento.
C. Plan de integración con MikroTik: cómo se hace el login externo (página login.html del hotspot que redirige al portal, http-chap/pap o MAC), cómo se crea y cierra la sesión, qué pasa si el portal o el router caen (walled garden, trial, timeouts), y cómo escala a muchos routers.
D. Roadmap en tres fases de unas 4 semanas, con criterios de aceptación medibles por fase.
E. Lista de riesgos (privacidad, MAC aleatoria, carga del router, abuso de OTP/SMS) con mitigaciones.
F. Modelo comercial para Panamá: planes por sede, costos de SMS/WhatsApp, margen del revendedor.

FASE 1 (impleméntala después de que apruebe el diseño)
Portal cautivo de invitados con teléfono/correo + OTP, consentimiento, personalización básica por local, sesiones registradas, dashboard de visitas (únicos, nuevos vs. recurrentes, horas pico) y exportación CSV. Con tests de RLS, modo simulado y documentación de despliegue.

Empieza entregando A, B y C. No escribas código hasta que confirme el diseño. Pregunta lo que necesites para decidir, pero propón una opción recomendada en cada pregunta.
```

## Por qué está así
- **Parte de lo que ya funciona**, así no se rehace el túnel, el despliegue ni la seguridad.
- **Separa invitados y personal**: los invitados entran solos; el personal sigue con aprobación.
- **Pide diseño antes de código**, porque cambia el modelo de datos y la integración con el router.
- **Privacidad desde el inicio**: guardar teléfonos y correos para marketing exige consentimiento y retención claros.
