// Preguntas frecuentes del administrador del establecimiento. Los nombres de pantallas y botones deben coincidir con los del panel.
// En los textos, **así** pone negrita.

export type Faq = { q: string; a: string[]; steps?: string[] };
export type FaqGroup = { id: string; title: string; items: Faq[] };

export const FAQ: FaqGroup[] = [
  {
    id: "inicio", title: "Primeros pasos", items: [
      { q: "¿Qué hay en cada pantalla del menú?", a: [
        "**Inicio**: cuántas personas esperan tu aprobación, usuarios activos, visitantes de hoy y conectados, con accesos rápidos.",
        "**Usuarios**: aprobar, crear, suspender y quitar cuentas. **Ancho de banda**: velocidad y dispositivos por rol. **Equipos fijos**: impresoras y pantallas.",
        "**Diseño y horarios**: la página de bienvenida (portal) y el horario de acceso. **Visitantes**: quienes entraron con su correo.",
        "**Conectados**: quién está en la red ahora. **Historial**: cuándo se conectó cada usuario. **Estadísticas**: resúmenes por día, semana y mes. **Consumo**: datos usados.",
      ] },
      { q: "¿Quién configura el router?", a: [
        "El administrador de la plataforma. Tú no ves ni cambias esa conexión. En **Ancho de banda** solo aparece si el router está conectado o no.",
      ] },
      { q: "¿Cómo cambio la contraseña con la que entro al panel?", a: [
        "Pulsa **Mi cuenta** (debajo de tu nombre, abajo en el menú), escribe tu contraseña actual y la nueva (mínimo 10 caracteres, con letras y números). Al cambiarla se cierran las demás sesiones de tu cuenta. Esta contraseña es distinta de la del WiFi.",
        "Si entraste con una contraseña temporal, el panel te pide cambiarla antes de dejarte continuar.",
      ] },
      { q: "Olvidé la contraseña del panel", a: [
        "En la pantalla de inicio de sesión pulsa **¿Olvidaste tu contraseña?**, escribe tu correo y te llegará un enlace para elegir una nueva. El enlace dura poco tiempo; si venció, pide otro. Revisa también el correo no deseado.",
      ] },
      { q: "¿Qué debo hacer el primer día?", a: ["Recorre este listado antes de abrir la red al público:"], steps: [
        "Revisa la velocidad y los dispositivos por rol en **Ancho de banda**.",
        "Escribe los términos y condiciones en español y en inglés en **Diseño y horarios** y usa **Guardar y publicar**.",
        "Si es una escuela, configura el horario de acceso.",
        "Registra tus impresoras y pantallas en **Equipos fijos**.",
        "Crea las cuentas del personal en **Usuarios** y entrégales su usuario y contraseña de WiFi.",
        "Prueba con tu teléfono: entra como visitante y comprueba que apareces en **Conectados**.",
        "Avisa al personal de que se registran sus conexiones.",
      ] },
    ],
  },
  {
    id: "usuarios", title: "Usuarios", items: [
      { q: "¿Cómo apruebo a alguien que se registró?", a: [
        "La persona se registra sola con el **código de tu establecimiento** y queda pendiente, sin WiFi. Aparece en el cuadro **Pendientes de aprobar**, arriba en **Usuarios**.",
      ], steps: [
        "Elige su rol (el que pidió es solo una sugerencia).",
        "Pulsa **Aprobar**. Se crea su usuario de WiFi y el portal muestra el usuario y la contraseña **una sola vez**.",
        "Anótalos y entrégaselos: no se guardan.",
      ] },
      { q: "¿Cómo creo una cuenta sin esperar el registro?", a: [
        "En **Usuarios**, abre **Crear usuario** y escribe nombre completo, correo y rol. Puedes poner tú la contraseña del WiFi o dejarla vacía para que se genere. La cuenta queda activa al instante.",
        "Los nombres de usuario no se repiten: si ya existe `ana`, el siguiente será `ana2`.",
      ] },
      { q: "¿Dónde veo la contraseña del WiFi de alguien?", a: [
        "No se puede ver: se muestra una sola vez al crear o aprobar la cuenta y el sistema no la guarda. Si alguien la olvidó, dale una nueva (siguiente pregunta).",
      ] },
      { q: "Alguien olvidó la contraseña del WiFi, ¿cómo le doy una nueva?", a: [
        "En **Usuarios**, pulsa **Nueva clave WiFi** en la fila de esa persona. Puedes escribir la contraseña (mínimo 6 caracteres) o dejar el campo vacío para que el sistema genere una, y pulsa **Cambiar**.",
        "El portal la cambia en el router, cierra las sesiones que la persona tuviera abiertas y te muestra la contraseña nueva **una sola vez**: anótala y entrégasela. En la tabla queda la fecha del último cambio.",
        "Esta es la contraseña del WiFi. La del panel de administración se cambia en **Mi cuenta**.",
      ] },
      { q: "¿Cómo le quito el WiFi a alguien por un tiempo?", a: [
        "**Suspender** deja a la persona sin WiFi al instante (y **Reactivar** se lo devuelve). **Deshabilitar WiFi** corta solo el WiFi sin tocar la cuenta, y **Habilitar WiFi** lo devuelve.",
      ] },
      { q: "¿Qué hace el botón Quitar?", a: [
        "Elimina el usuario de WiFi de esa persona en el router. Úsalo cuando alguien se va definitivamente. Para una ausencia, es mejor suspender.",
      ] },
      { q: "¿Cómo cambio el rol de alguien?", a: [
        "En **Usuarios**, elige otro rol en su fila y pulsa **Guardar**. La velocidad y los dispositivos cambian con el rol.",
      ] },
    ],
  },
  {
    id: "velocidad", title: "Velocidad y dispositivos", items: [
      { q: "¿Cómo cambio la velocidad de un rol?", a: [
        "En **Ancho de banda**, cambia la bajada y la subida de su fila (en kbps; 1.024 kbps son 1 Mbps, y debajo ves el equivalente en Mbps) y pulsa **Aplicar**. El cambio llega al router al momento.",
      ] },
      { q: "¿Cuántos dispositivos puede usar cada persona?", a: [
        "Lo defines por rol, de 1 a 10, en la columna **Dispositivos** de **Ancho de banda**. Por defecto el personal tiene 2 y los demás 1. Pulsa **Aplicar** para que llegue al router.",
      ] },
      { q: "Si alguien usa 2 dispositivos, ¿se divide la velocidad?", a: [
        "No: cada dispositivo recibe la velocidad completa del rol. Con 2 dispositivos a 10 Mbps, entre los dos pueden usar hasta 20 Mbps. Tenlo en cuenta si tu internet es limitado.",
      ] },
    ],
  },
  {
    id: "reparto", title: "Reparto del ancho de banda", items: [
      { q: "¿Qué son el mínimo garantizado y la ráfaga?", a: [
        "En **Ancho de banda**, cada rol tiene un **máximo** (lo más que puede usar), un **mínimo** (lo que siempre se le garantiza aunque la red esté llena de gente) y, si quieres, una **ráfaga**: un empujón por encima del máximo durante unos segundos, útil para que las páginas carguen rápido.",
        "La columna del mínimo avisa cuántas personas caben con su garantía a la vez. Si ese número es muy bajo para tu local, baja el mínimo o sube el máximo del internet contratado.",
      ] },
      { q: "No veo las columnas de mínimo y ráfaga", a: [
        "Aparecen cuando el administrador de la plataforma ya indicó cuánto internet contrató tu establecimiento y eligió el reparto «por rol». Mientras tanto, cada persona solo tiene su máximo. Si tu establecimiento usa el reparto «equitativo», todos comparten por igual y no hay velocidades por rol.",
      ] },
      { q: "¿Cómo limito la velocidad de una impresora, una pantalla o una cámara?", a: [
        "En **Equipos fijos**, al registrarlo abre «Límite de velocidad propio» y escribe su máximo de bajada y subida (en Mbps) y, si quieres, un mínimo garantizado. **Necesita IP fija.**",
        "Si no pones límites, el equipo entra al **grupo de equipos fijos**: todos ellos se reparten por igual lo que les toca y nunca dejan sin internet a los clientes. La tabla muestra «Propio» o «Grupo» en la columna Velocidad.",
      ] },
    ],
  },
  {
    id: "portal", title: "Portal de bienvenida", items: [
      { q: "¿Cómo cambio el logo, los colores y los textos?", a: [
        "En **Diseño y horarios**. Puedes cambiar título, subtítulo, texto del botón, pie, plantilla, colores, bordes, tipografía, logo e imagen de fondo (PNG, JPG o WebP). Los textos tienen versión en español y en inglés (botones **ES** y **EN**) y puedes ver el resultado en escritorio y en móvil antes de publicar.",
      ] },
      { q: "Guardé mis cambios pero el visitante no los ve", a: [
        "Lo que editas es un borrador. **Guardar** solo lo guarda; para que el visitante lo vea hay que publicar. Usa **Guardar y publicar**.",
        "**Publicar el borrador guardado** publica solo lo que ya estaba guardado, **Descartar borrador** tira los cambios y **Copiar al borrador** (en el Historial de versiones) recupera una versión anterior.",
      ] },
      { q: "¿Cómo pongo los términos y condiciones?", a: [
        "Escríbelos en el campo **Términos y condiciones**, en los dos idiomas, y usa **Guardar y publicar**. Si más adelante los cambias, el portal vuelve a pedir su aceptación a quienes entren después.",
      ] },
      { q: "¿Qué datos le pido al visitante?", a: [
        "Nombre, correo y teléfono pueden ser obligatorios, opcionales o no pedirse. También defines la **duración de la sesión** (de 10 a 1.440 minutos).",
        "Ojo: el correo **no se verifica**. Cualquiera puede escribir el de otra persona, así que no lo uses para nada sensible.",
      ] },
      { q: "¿A dónde va el visitante al terminar de conectarse?", a: [
        "Donde pongas en **Después de conectar, ir a** (una dirección que empieza con https://). Es opcional.",
        "En teléfonos puede no verse: el teléfono cierra su ventanita de portal al detectar internet, aunque la persona ya esté conectada. En computadoras sí se muestra.",
      ] },
      { q: "¿Cómo entra el personal desde el portal?", a: [
        "La página de bienvenida tiene una sección **«Soy del personal»** para quienes tienen usuario y contraseña de WiFi. Les lleva a iniciar sesión sin pasar por el formulario de visitantes.",
      ] },
    ],
  },
  {
    id: "horarios", title: "Horarios (solo escuelas)", items: [
      { q: "¿Cómo limito el WiFi de los alumnos a las horas de clase?", a: [
        "En **Diseño y horarios**, en «Horario de acceso de alumnos»: marca los días, ajusta la hora de inicio y fin y pulsa **Guardar horario**.",
        "Fuera de ese horario el portal no da acceso y dice cuándo vuelve a abrir. Dentro del horario, el acceso dura hasta que cierre la ventana. Las horas son de Panamá.",
      ] },
      { q: "No marqué ningún día, ¿qué pasa?", a: [
        "Entonces **no hay restricción**: los alumnos pueden conectarse a cualquier hora. El horario no aplica a restaurantes, pubs ni hoteles.",
      ] },
      { q: "¿El horario afecta al personal?", a: [
        "No. Aplica a los visitantes que entran por el portal. Las cuentas con usuario propio (personal, docentes) no se limitan por él.",
      ] },
    ],
  },
  {
    id: "visitantes", title: "Visitantes y datos", items: [
      { q: "¿Cómo descargo la lista de visitantes?", a: ["En **Visitantes**, pulsa **Descargar CSV** y ábrelo en una hoja de cálculo. Bórralo de tu computadora cuando termines."] },
      { q: "Un visitante me pide que borre sus datos", a: ["En **Visitantes**, pulsa **Eliminar** en su fila. Se borran la persona, sus consentimientos y sus sesiones."] },
      { q: "¿A quién puedo enviarle promociones?", a: ["Solo a quienes figuran con «Sí» en la columna **Promociones**: aceptaron recibirlas."] },
      { q: "¿Qué datos se guardan y quién los ve?", a: [
        "Correos y teléfonos de visitantes se guardan cifrados y solo los ven los administradores de tu local. Los dispositivos se registran con un código, no con su dirección. Las contraseñas del WiFi no se guardan. Tus datos están separados de los de otros locales.",
      ] },
    ],
  },
  {
    id: "seguimiento", title: "Seguimiento y estadísticas", items: [
      { q: "¿Cómo sé quién está conectado ahora?", a: [
        "En **Conectados**. Muestra una fila por dispositivo con el nombre, rol, usuario, dirección de red, tiempo conectado y datos usados, y se actualiza sola cada 30 segundos. Usa los filtros **Todos**, **Usuarios** y **Visitantes**. Una persona con 2 dispositivos aparece dos veces.",
      ] },
      { q: "¿Qué significa «Solo en el router»?", a: [
        "Son usuarios creados directamente en el router que el portal no conoce. Si ves alguno que no esperabas, avisa al administrador de la plataforma.",
      ] },
      { q: "¿Cómo veo cuándo se conectó alguien?", a: [
        "En **Historial**: elige 7, 30 o 90 días y pulsa **Ver sesiones** en una persona. Se guarda 90 días y solo lo ven los administradores. Avisa al personal de que se registran sus conexiones.",
        "«Tiempo total» suma todos los dispositivos: dos dispositivos conectados una hora cuentan dos horas.",
      ] },
      { q: "¿Cómo leo las estadísticas?", a: [
        "En **Estadísticas** elige 7 días, 30 días, 90 días o 12 meses. Las tarjetas comparan con el periodo anterior y las barras separan visitantes **nuevos** (primera vez) de **recurrentes** (ya habían venido). Pasa el cursor sobre una barra para ver el número exacto, o abre **Ver como tabla**. Las fechas usan la hora de Panamá.",
      ] },
      { q: "En Consumo no aparece lo que alguien está usando ahora", a: [
        "El router actualiza esos totales cuando termina la sesión. Para ver quién está conectado en este momento usa **Conectados**.",
      ] },
    ],
  },
  {
    id: "fijos", title: "Equipos fijos", items: [
      { q: "¿Cómo conecto una impresora, una pantalla o un televisor?", a: [
        "Estos equipos no pueden iniciar sesión en un portal. En **Equipos fijos** escribe su dirección MAC, un nombre y, si quieres, su ubicación y motivo; al guardar quedan con acceso directo. En **Registrados** ves si la excepción sigue activa en el router y puedes **Quitar** las que ya no necesitas.",
        "Un equipo fijo se salta el portal y sus límites: registra solo equipos tuyos.",
      ] },
      { q: "¿Cómo encuentro la MAC de un equipo?", a: [
        "Es un código de seis pares de caracteres, como `14:CB:19:58:66:75`. Suele estar en una etiqueta del equipo o en su menú de red o información del dispositivo.",
      ] },
    ],
  },
  {
    id: "problemas", title: "Si algo no funciona", items: [
      { q: "Una persona dice que no tiene WiFi", a: [
        "En **Usuarios**, revisa si está pendiente, suspendida o con el WiFi deshabilitado, y si tiene el rol correcto.",
      ] },
      { q: "Un alumno no puede conectarse", a: ["En escuelas, revisa el horario en **Diseño y horarios**: fuera de las horas marcadas no hay acceso."] },
      { q: "El personal no puede usar un segundo dispositivo", a: ["Mira el número de **Dispositivos** de su rol en **Ancho de banda** y pulsa **Aplicar**."] },
      { q: "Una tableta o teléfono se conecta pero no abre el portal ni da internet", a: [
        "Pide a la persona que desactive la VPN y el «DNS privado», y que abra en el navegador una dirección **sin https**, por ejemplo `http://neverssl.com`. Debe llevarla al portal.",
        "Si es un equipo del local que no puede iniciar sesión, regístralo en **Equipos fijos**. Si el problema sigue, avisa al administrador de la plataforma.",
      ] },
      { q: "«Conectados» dice que no pudo consultar el router", a: [
        "El router o el internet del local pueden estar apagados. Revisa que el router tenga luz y red; si sigue, avisa al administrador de la plataforma.",
      ] },
      { q: "Veo «Servicio suspendido»", a: ["El administrador de la plataforma suspendió el servicio de tu establecimiento. Contáctalo."] },
      { q: "Antes de pedir ayuda, ¿qué datos preparo?", a: ["El nombre de la persona afectada, la hora aproximada y lo que ves en la pantalla. Eso acorta mucho la solución."] },
    ],
  },
  {
    id: "buenas", title: "Buenas prácticas", items: [
      { q: "¿Qué debo cuidar como administrador?", a: [
        "No compartas tu usuario de administrador: si alguien más necesita administrar, pide otra cuenta. No pegues contraseñas en chats ni correos. Quita a quien ya no trabaja contigo el mismo día que se va. Revisa los pendientes al empezar la semana: una persona pendiente no recibe ningún aviso, simplemente no puede conectarse.",
      ] },
    ],
  },
];
