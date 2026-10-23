import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import mark from "@/assets/mark.png";
import logo from "@/assets/logo.png";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase";
import { SITE } from "@/lib/site";
import "./landing.css";

export const metadata: Metadata = {
  title: `${SITE.name}: WiFi con tu marca y bajo control`,
  description:
    "Portal de bienvenida personalizado, usuarios con velocidad por rol, visitantes con consentimiento y estadísticas para escuelas, restaurantes, pubs y hoteles sobre routers MikroTik.",
};

export const dynamic = "force-dynamic";

const TYPES = ["Escuelas", "Restaurantes", "Pubs", "Hoteles"];

const AUDIENCE = [
  {
    tag: "Escuelas",
    title: "Clases con internet, sin distracciones",
    text: "Alumnos, docentes y personal con su propio acceso y su propia velocidad.",
    items: ["Horario de acceso para alumnos, por día", "El acceso termina cuando cierra la ventana", "Más velocidad para docentes y dirección"],
  },
  {
    tag: "Restaurantes y pubs",
    title: "Conoce a quién vuelve",
    text: "Cada cliente se conecta desde una página con tu marca y tú ves quién regresa.",
    items: ["Nuevos y recurrentes en las estadísticas", "Promociones solo a quien aceptó recibirlas", "Horas y días de más movimiento"],
  },
  {
    tag: "Hoteles",
    title: "Huéspedes, equipo y televisores",
    text: "Los huéspedes entran por el portal y el personal con su usuario. Los televisores no necesitan iniciar sesión.",
    items: ["Equipos fijos conectados sin portal", "Personal con varios dispositivos", "Términos de uso en español e inglés"],
  },
];

const GROUPS = [
  {
    name: "Tu portal de bienvenida",
    items: [
      ["Tu marca, no la nuestra", "Logo, colores, fondo, tipografía y textos. Elige entre varias plantillas y míralas en escritorio y en móvil antes de publicar."],
      ["Español e inglés", "Cada texto tiene su versión en los dos idiomas. El portal muestra el idioma que usa el visitante."],
      ["Términos y condiciones con versión", "Si cambias los términos, el portal vuelve a pedir su aceptación. Queda constancia de lo que aceptó cada persona."],
      ["Borrador y publicación", "Edita con calma, revisa y publica cuando esté listo. El historial permite volver a una versión anterior."],
      ["Tú decides qué pedir", "Nombre, correo y teléfono pueden ser obligatorios, opcionales o no pedirse. La duración de la sesión la fijas tú."],
      ["Página de destino", "Al terminar de conectarse, lleva al visitante a tu web, tu menú o tu promoción."],
    ],
  },
  {
    name: "Usuarios y velocidad",
    items: [
      ["Velocidad por rol", "Dirección, personal, docentes, alumnos, gerentes, clientes o huéspedes: cada rol con su bajada y su subida."],
      ["Varios dispositivos por persona", "El personal puede usar teléfono y computadora a la vez. El número se ajusta por rol."],
      ["Aprobar o crear cuentas", "La gente se registra con el código de tu local y tú la apruebas, o creas la cuenta directamente."],
      ["Suspender en un clic", "Una cuenta suspendida pierde el WiFi al instante y lo recupera cuando la reactivas."],
      ["Horarios para escuelas", "Define en qué días y horas pueden conectarse los alumnos. Fuera de ese horario el portal no da acceso."],
      ["Equipos fijos", "Impresoras, pantallas y cámaras entran por su dirección MAC, sin iniciar sesión y sin pasar por el portal."],
    ],
  },
  {
    name: "Visitantes y datos",
    items: [
      ["Consentimiento claro", "El visitante acepta los términos y, si quiere, recibir promociones. Cada aceptación queda registrada."],
      ["Lista y exportación", "Consulta tus visitantes y descárgalos en CSV para usarlos en tus propias herramientas."],
      ["Derecho a borrar", "Elimina a una persona y todo lo suyo con un solo botón cuando lo pida."],
      ["Datos cifrados", "Correos y teléfonos se guardan cifrados. Los dispositivos se identifican con un código, no con su dirección."],
    ],
  },
  {
    name: "Control y seguimiento",
    items: [
      ["Conectados ahora", "Quién está en tu red en este momento, con su rol, su dispositivo y cuánto lleva conectado."],
      ["Historial de conexiones", "Cuándo entró y salió cada usuario con cuenta, con cuántos dispositivos y por cuánto tiempo. Se conserva 90 días."],
      ["Estadísticas", "Visitantes por día, semana o mes, nuevos frente a recurrentes, duración media y las horas pico."],
      ["Consumo por usuario", "Cuántos datos ha usado cada persona con cuenta."],
    ],
  },
  {
    name: "Para quien administra varios locales",
    items: [
      ["Cada local, aislado", "Cada establecimiento ve solo lo suyo. Nadie puede mirar los datos de otro."],
      ["Panel de plataforma", "Crea establecimientos, revisa su actividad y suspende o reactiva el servicio de cualquiera."],
      ["Configuración del router guiada", "Genera los comandos exactos para dejar un MikroTik listo como Hotspot, para pegarlos o importarlos desde un archivo."],
      ["Pensado para MikroTik", "Se conecta al router por su API segura, con el certificado verificado y por un túnel privado."],
    ],
  },
];

const STEPS = [
  ["Preparamos el router", "Generas los comandos de configuración de tu MikroTik y los aplicas. El portal comprueba que hay conexión."],
  ["Personalizas el portal", "Subes tu logo, eliges colores, escribes los términos y publicas."],
  ["Tu gente se conecta", "El personal entra con su usuario, los visitantes con su correo y los equipos fijos entran solos."],
  ["Controlas y mides", "Ves quién está conectado, cuánta gente viene y cuándo, y ajustas velocidades y horarios."],
];

const SAFETY = [
  ["Aislamiento entre locales", "La separación de datos la hace la propia base de datos, no solo la aplicación."],
  ["Cifrado de datos personales", "Correos y teléfonos de visitantes, y la contraseña de tu router, se guardan cifrados."],
  ["Sin contraseñas a la vista", "Las contraseñas del WiFi se muestran una sola vez al crearlas y no se guardan."],
  ["Historial con fecha de caducidad", "El registro de conexiones se borra solo a los 90 días y lo ven únicamente los administradores."],
  ["Conexión verificada al router", "El portal comprueba la huella del certificado del router antes de enviar nada."],
];

const SOON = [
  ["Verificación del correo", "Un código por correo para confirmar que el visitante es quien dice ser."],
  ["Varias sedes y routers", "Un mismo establecimiento con más de una sede o más de un router."],
  ["Campañas de promociones", "Mensajes a los visitantes que aceptaron recibirlos."],
  ["Filtros de contenido", "Bloquear categorías de sitios por rol u horario."],
];

// Datos de ejemplo del gráfico: [nuevos, recurrentes] por día
const BARS: [number, number][] = [[18, 8], [22, 10], [16, 12], [24, 14], [30, 16], [44, 22], [38, 26], [20, 12], [26, 13], [28, 17], [34, 19], [50, 24], [46, 30], [24, 15]];

export default async function Landing() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  const contact = SITE.contactEmail
    ? { href: `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(`Información sobre ${SITE.name}`)}`, label: "Solicitar información" }
    : SITE.whatsapp
      ? { href: `https://wa.me/${SITE.whatsapp.replace(/\D/g, "")}`, label: "Escribir por WhatsApp" }
      : null;
  const maxBar = Math.max(...BARS.map(([a, b]) => a + b));

  return (
    <div className="lp">
      <div className="lp-hero">
        <svg className="lp-arcs" viewBox="0 0 720 720" aria-hidden="true" fill="none" stroke="#3ad1b6" strokeWidth="1.5">
          {[120, 200, 280, 360, 440, 520, 600].map((r, i) => (
            <path key={r} d={`M ${720 - r} 720 A ${r} ${r} 0 0 1 720 ${720 - r}`} opacity={1 - i * 0.13} />
          ))}
        </svg>
        <div className="lp-wrap">
          <nav className="lp-nav" aria-label="Principal">
            <span className="lp-brand">
              <span className="lp-mark"><Image src={mark} alt="" width={38} height={38} unoptimized /></span>
              {SITE.name}
            </span>
            <a className="lp-link" href="#para-quien">Para quién</a>
            <a className="lp-link" href="#funciones">Funciones</a>
            <a className="lp-link" href="#como-funciona">Cómo funciona</a>
            <Link className="lp-btn ghost" href="/login">Entrar</Link>
          </nav>

          <div className="lp-hero-grid">
            <div>
              <p className="lp-kicker">WiFi para negocios y escuelas</p>
              <h1>Tu WiFi, con tu marca y <em>bajo tu control</em>.</h1>
              <p className="lp-lead">
                Una página de bienvenida con tu logo, cada persona con la velocidad que le corresponde, visitantes que aceptan tus términos
                y números claros de quién se conecta y cuándo. Todo desde un panel, sobre tu router MikroTik.
              </p>
              <div className="lp-cta">
                {contact && <a className="lp-btn primary" href={contact.href}>{contact.label}</a>}
                <Link className={`lp-btn ${contact ? "ghost" : "primary"}`} href="/login">Entrar al panel</Link>
              </div>
              <ul className="lp-types" aria-label="Tipos de establecimiento">
                {TYPES.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
            <div className="lp-phone-wrap">
              <div className="lp-phone" role="img" aria-label="Ejemplo de la página de bienvenida en un teléfono: logo, título, campo de correo, aceptación de términos y botón Conectarme">
                <div className="lp-screen" aria-hidden="true">
                  <div className="logo">A</div>
                  <h3>Bienvenido a Café Aurora</h3>
                  <p>Conéctate gratis mientras disfrutas tu café.</p>
                  <div className="field">Tu nombre</div>
                  <div className="field">tucorreo@ejemplo.com</div>
                  <div className="check"><i />Acepto los términos y condiciones</div>
                  <div className="check"><i />Quiero recibir promociones</div>
                  <div className="go">Conectarme</div>
                </div>
              </div>
              <span className="lp-caption">Vista de ejemplo del portal del visitante</span>
            </div>
          </div>
        </div>
      </div>

      <div role="main">
        <section className="lp-section" id="para-quien">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Para quién</p>
            <h2>Un mismo servicio, adaptado a cada tipo de local</h2>
            <p className="lp-sub">Los roles, las velocidades de partida y las opciones cambian según seas escuela, restaurante, pub u hotel.</p>
            <div className="lp-grid">
              {AUDIENCE.map((a) => (
                <article className="lp-card" key={a.tag}>
                  <span className="lp-tag">{a.tag}</span>
                  <h3>{a.title}</h3>
                  <p>{a.text}</p>
                  <ul>{a.items.map((i) => <li key={i}>{i}</li>)}</ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section alt" id="funciones">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Funciones</p>
            <h2>Todo lo que necesitas para manejar tu WiFi</h2>
            <p className="lp-sub">Desde lo que ve el visitante hasta lo que ve quien administra.</p>
            <div className="lp-groups">
              {GROUPS.map((g) => (
                <div className="lp-group" key={g.name}>
                  <h3>{g.name}</h3>
                  <div className="lp-feat">
                    {g.items.map(([t, d]) => (
                      <div key={t}><h4>{t}</h4><p>{d}</p></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="como-funciona">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Cómo funciona</p>
            <h2>De un router a un WiFi administrado, en cuatro pasos</h2>
            <p className="lp-sub">No necesitas un técnico dedicado: la configuración del router se genera por ti.</p>
            <ol className="lp-steps">
              {STEPS.map(([t, d]) => (
                <li key={t}><h3>{t}</h3><p>{d}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section alt">
          <div className="lp-wrap lp-split">
            <div>
              <p className="lp-eyebrow">Números claros</p>
              <h2>Sabe quién vuelve y a qué hora te visitan</h2>
              <p className="lp-sub" style={{ marginBottom: 0 }}>
                Las estadísticas separan a los visitantes nuevos de los que regresan, comparan con el periodo anterior y muestran los días y las
                horas de más movimiento. Elige 7 días, 30 días, 90 días o 12 meses.
              </p>
            </div>
            <div className="lp-panel" role="img" aria-label="Ejemplo de gráfico de visitantes por día, con nuevos y recurrentes">
              <header><b>Visitantes por día</b><span>Datos de ejemplo</span></header>
              <div className="lp-kpis">
                <div><span>Hoy</span><b>128</b></div>
                <div><span>7 días</span><b>742</b></div>
                <div><span>Recurrentes</span><b>38%</b></div>
              </div>
              <div className="lp-bars" aria-hidden="true">
                {BARS.map(([n, r], i) => (
                  <div className="lp-barstack" key={i}>
                    <i style={{ height: `${(r / maxBar) * 100}%`, background: "var(--lp-amber)", borderRadius: "4px 4px 0 0" }} />
                    <i style={{ height: `${(n / maxBar) * 100}%`, background: "var(--lp-signal)" }} />
                  </div>
                ))}
              </div>
              <div className="lp-legend"><span>Nuevos</span><span className="b">Recurrentes</span></div>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-wrap lp-split">
            <div>
              <p className="lp-eyebrow">Seguridad y privacidad</p>
              <h2>Tus datos y los de tus visitantes, protegidos</h2>
              <p className="lp-sub" style={{ marginBottom: 0 }}>
                Un WiFi para el público guarda datos de personas. El servicio está hecho para tratarlos con cuidado desde el diseño.
              </p>
            </div>
            <ul className="lp-list">
              {SAFETY.map(([t, d]) => (
                <li key={t}><div><b>{t}</b><span>{d}</span></div></li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section alt lp-soon">
          <div className="lp-wrap">
            <p className="lp-eyebrow">En camino</p>
            <h2>Lo que viene</h2>
            <p className="lp-sub">Estas funciones todavía no están disponibles. Las listamos para que sepas hacia dónde va el servicio.</p>
            <div className="lp-grid">
              {SOON.map(([t, d]) => (
                <article className="lp-card" key={t}><h3>{t}</h3><p>{d}</p></article>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="lp-final">
        <div className="lp-wrap">
          <h2>Pon orden en el WiFi de tu local</h2>
          <p>Si ya tienes cuenta, entra a tu panel. Si quieres el servicio para tu escuela, restaurante, pub u hotel, ponte en contacto.</p>
          <div className="lp-cta">
            {contact && <a className="lp-btn primary" href={contact.href}>{contact.label}</a>}
            <Link className={`lp-btn ${contact ? "ghost" : "primary"}`} href="/login">Entrar al panel</Link>
          </div>
        </div>
      </section>

      <footer className="lp-wrap lp-foot">
        <span className="lp-footlogo"><Image src={logo} alt={`${SITE.name}, ${SITE.company}`} unoptimized /></span>
        <span>{SITE.name} · {SITE.company}</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
