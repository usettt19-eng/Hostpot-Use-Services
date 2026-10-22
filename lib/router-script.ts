// Genera las instrucciones para configurar un MikroTik (RouterOS 7) como Hotspot del portal.
// Función pura: valida cada dato (el texto se pega en la terminal del router) y devuelve bloques para pegar uno a uno.

export type RouterScriptInput = {
  slug: string;
  portalHost: string;
  portalIp: string;        // vacío = sin regla por IP en el walled garden
  hotspotInterface: string;
  network: string;         // x.y.z.0/24
  restPassword: string;
  wg: null | { serverPublicKey: string; endpoint: string; routerAddress: string; serverAddress: string };
};

export type ScriptBlock = { title: string; text: string; commands: string; warn?: string };
export type ScriptResult = { ok: true; blocks: ScriptBlock[] } | { ok: false; error: string };

const IFACE = /^[A-Za-z][A-Za-z0-9_.-]{0,29}$/;
const HOST = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,98}[A-Za-z0-9])?$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PASS = /^[A-Za-z0-9._-]{12,64}$/;
const WGKEY = /^[A-Za-z0-9+/]{43}=$/;
const ENDPOINT = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,98}[A-Za-z0-9])?:\d{1,5}$/;

function ipv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) ? o : null;
}
const isPrivate = (o: number[]) => o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);

function cidr(s: string): { ip: string; o: number[]; bits: number } | null {
  const [ip, b] = s.split("/");
  const o = ipv4(ip ?? "");
  const bits = Number(b);
  return o && Number.isInteger(bits) && bits >= 8 && bits <= 30 ? { ip, o, bits } : null;
}

const fail = (error: string): ScriptResult => ({ ok: false, error });

export function buildRouterScript(i: RouterScriptInput): ScriptResult {
  if (!SLUG.test(i.slug)) return fail("Código de establecimiento inválido");
  if (!HOST.test(i.portalHost)) return fail("Dirección del portal inválida");
  if (i.portalIp && !ipv4(i.portalIp)) return fail("La IP del portal no es válida");
  if (!IFACE.test(i.hotspotInterface)) return fail("Nombre de interfaz inválido (letras, números, guion; ej. ether3)");
  const net = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.0\/24$/.exec(i.network);
  const base = net && ipv4(`${net[1]}.${net[2]}.${net[3]}.0`);
  if (!base || !isPrivate(base)) return fail("La red debe ser privada y terminar en .0/24 (ej. 192.168.200.0/24)");
  if (!PASS.test(i.restPassword)) return fail("La contraseña del usuario del portal debe tener 12 a 64 caracteres: letras, números, punto, guion o guion bajo");
  const p3 = `${base[0]}.${base[1]}.${base[2]}`;
  let wgServer = "";
  if (i.wg) {
    const w = i.wg;
    if (!WGKEY.test(w.serverPublicKey)) return fail("La clave pública del servidor no es válida (44 caracteres terminados en =)");
    if (!ENDPOINT.test(w.endpoint) || Number(w.endpoint.split(":").pop()) > 65535) return fail("El destino del túnel debe ser host:puerto (ej. connect.useservices.company:51820)");
    const ra = cidr(w.routerAddress);
    const sa = ipv4(w.serverAddress);
    if (!ra || !isPrivate(ra.o)) return fail("La IP del router en el túnel debe ser privada con máscara (ej. 10.99.0.3/24)");
    if (!sa || !isPrivate(sa)) return fail("La IP del servidor en el túnel debe ser privada (ej. 10.99.0.1)");
    wgServer = w.serverAddress;
  }

  const blocks: ScriptBlock[] = [];
  const add = (title: string, text: string, commands: string[], warn?: string) =>
    blocks.push({ title, text, commands: commands.join("\n"), warn });

  if (i.wg) {
    const w = i.wg;
    add("1. Túnel WireGuard hacia el portal",
      "El router inicia la conexión al servidor. Después de pegar esto, ejecuta el último comando para ver la clave pública del router y pásasela al dueño de la plataforma para que la agregue al servidor.",
      [
        `/interface wireguard add name=wg-portal listen-port=13231`,
        `/ip address add address=${w.routerAddress} interface=wg-portal`,
        `/interface wireguard peers add interface=wg-portal public-key="${w.serverPublicKey}" endpoint-address=${w.endpoint.split(":")[0]} endpoint-port=${w.endpoint.split(":")[1]} allowed-address=${w.serverAddress}/32 persistent-keepalive=25s`,
        `/interface wireguard print`,
      ],
      "Falta agregar el router como «peer» en el servidor (con su clave pública). Sin eso el túnel no se establece.");
  }

  add(`${i.wg ? "2" : "1"}. Acceso del portal al router (API REST)`,
    "Crea el usuario que usa el portal y habilita la API segura, solo accesible desde el túnel. Al final, copia la huella (fingerprint) del certificado: se pega en el portal.",
    [
      `/user group add name=portal policy=read,write,api,rest-api,test`,
      `/user add name=portal group=portal password="${i.restPassword}"`,
      `/certificate add name=portal-rest common-name=${i.wg ? i.wg.routerAddress.split("/")[0] : "router-portal"} days-valid=3650 key-usage=tls-server`,
      `/certificate sign portal-rest`,
      `/ip service set www-ssl certificate=portal-rest disabled=no${wgServer ? ` address=${wgServer}/32` : ""}`,
      ...(i.wg ? [`/ip firewall filter add chain=input in-interface=wg-portal protocol=tcp dst-port=443 action=accept place-before=0 comment="portal"`] : []),
      `/certificate print detail where name=portal-rest`,
    ],
    "El comando «sign» tarda unos segundos: espera a que termine antes de seguir. Sin túnel, limita `address` del servicio www-ssl a la IP del portal.");

  const n = i.wg ? 3 : 2;
  add(`${n}. Red del Hotspot`,
    `Una red aparte para los visitantes en ${i.hotspotInterface}, con su DHCP. No toca tus otras redes.`,
    [
      `/interface bridge port remove [find interface=${i.hotspotInterface}]`,
      `/interface bridge add name=bridge-hotspot`,
      `/interface bridge port add bridge=bridge-hotspot interface=${i.hotspotInterface}`,
      `/ip address add address=${p3}.1/24 interface=bridge-hotspot`,
      `/ip pool add name=pool-hotspot ranges=${p3}.10-${p3}.200`,
      `/ip dhcp-server network add address=${p3}.0/24 gateway=${p3}.1 dns-server=8.8.8.8,1.1.1.1`,
      `/ip dhcp-server add name=dhcp-hotspot interface=bridge-hotspot address-pool=pool-hotspot lease-time=1h disabled=no`,
    ],
    `${i.hotspotInterface} debe estar sin cable y no debes estar conectado al router por ese puerto. La salida a internet debe tener un masquerade (NAT) ya configurado en el router.`);

  add(`${n + 1}. Hotspot`, "Activa el Hotspot con inicio de sesión por navegador.", [
    `/ip hotspot profile add name=hsprof-portal hotspot-address=${p3}.1 login-by=http-chap,http-pap`,
    `/ip hotspot add name=hotspot-portal interface=bridge-hotspot address-pool=pool-hotspot profile=hsprof-portal disabled=no`,
  ]);

  add(`${n + 2}. Permitir que el visitante alcance el portal`, "Lista blanca (walled garden): lo que el visitante puede abrir antes de iniciar sesión.", [
    `/ip hotspot walled-garden add dst-host=${i.portalHost} comment="portal"`,
    ...(i.portalIp ? [`/ip hotspot walled-garden ip add dst-address=${i.portalIp} protocol=tcp dst-port=443 action=accept comment="portal"`] : []),
  ], i.portalIp ? "La regla por IP deja abierto el puerto 443 de esa IP: si en esa máquina hay otros sitios, el visitante sin sesión podría abrirlos." : undefined);

  add(`${n + 3}. Página de inicio de sesión del portal`,
    "Descarga la página que redirige al portal de este establecimiento. Antes, guarda una copia de la original (WinBox → Files → arrastra hotspot/login.html a tu PC).",
    [
      `/ip hotspot profile print detail where name=hsprof-portal`,
      `/tool fetch url="https://${i.portalHost}/w/${i.slug}/mikrotik-login.html" dst-path="hotspot/login.html" check-certificate=no`,
      `/file print where name~"hotspot/login"`,
    ],
    "Mira el campo html-directory del primer comando: si es «flash/hotspot», cambia dst-path a \"flash/hotspot/login.html\". El archivo final debe pesar menos de 1 KB.");

  add(`${n + 4}. Verificar`, "Debe verse el Hotspot y el DHCP sin una X (activos).", [
    `/ip hotspot print`,
    `/ip dhcp-server print`,
    `/ip hotspot walled-garden print`,
  ]);

  add(`${n + 5}. Deshacer`, "Quita lo que creó este script (no toca el túnel ni el usuario del portal).", [
    `/ip hotspot walled-garden remove [find comment="portal"]`,
    `/ip hotspot walled-garden ip remove [find comment="portal"]`,
    `/ip hotspot remove [find name=hotspot-portal]`,
    `/ip hotspot profile remove [find name=hsprof-portal]`,
    `/ip dhcp-server remove [find name=dhcp-hotspot]`,
    `/ip dhcp-server network remove [find address=${p3}.0/24]`,
    `/ip pool remove [find name=pool-hotspot]`,
    `/ip address remove [find interface=bridge-hotspot]`,
    `/interface bridge port remove [find interface=${i.hotspotInterface}]`,
    `/interface bridge remove [find name=bridge-hotspot]`,
    `/interface bridge port add bridge=bridge1 interface=${i.hotspotInterface}`,
  ], "La última línea devuelve el puerto a «bridge1»: cambia el nombre si tu puente principal se llama distinto.");

  return { ok: true, blocks };
}

/** Archivo .rsc para importar en el router (`/import file-name=...`): cada bloque va con su título como comentario. */
export function toRsc(blocks: ScriptBlock[], header: string): string {
  const out = [`# ${header}`, "# Importar con: /import file-name=<nombre-del-archivo>.rsc", ""];
  for (const b of blocks) {
    out.push(`# ---- ${b.title} ----`);
    if (b.warn) out.push(`# OJO: ${b.warn.replace(/\s+/g, " ")}`);
    out.push(b.commands, "");
  }
  return out.join("\n");
}
