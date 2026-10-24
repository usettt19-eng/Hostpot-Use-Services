// Cliente RouterOS v7 REST (https://help.mikrotik.com/docs/spaces/ROS/pages/47579162/REST+API)
import https from "node:https";
import type { TLSSocket } from "node:tls";
import { isIPv4, normalizeMac } from "./guest-utils.ts";
import { FIXED_POOL, FIXED_PREFIX, PARENT_QUEUE, PCQ_DOWN, PCQ_UP, buildRateLimit, fixedQueueName, type SharingMode } from "./queues.ts";

// Si el tenant no tiene router configurado, opera en modo simulado (no falla, devuelve datos de ejemplo).

export type RouterConfig = {
  router_url: string | null;
  router_user: string | null;
  router_password: string | null;
  /** SHA-256 del certificado del router (hex, con o sin ":"). Si se define, se fija (pinning) en lugar de validar la cadena. */
  router_cert_fingerprint?: string | null;
  /** Internet contratado y red del Hotspot (kbps / CIDR). Si faltan, no hay reparto: todo funciona como antes. */
  total_down_kbps?: number | null;
  total_up_kbps?: number | null;
  hotspot_network?: string | null;
  /** «roles»: cada rol con su velocidad (por defecto). «equal»: todos por igual con PCQ. */
  sharing_mode?: SharingMode;
};

/** ¿Este establecimiento tiene configurado el reparto del ancho de banda? */
export const hasSharing = (c: RouterConfig) => !!(c.total_down_kbps && c.total_up_kbps && c.hotspot_network);

export type RouterUserUsage = { name: string; bytesIn: number; bytesOut: number; disabled: boolean };

export const isConfigured = (c: RouterConfig) => !!(c.router_url && c.router_user && c.router_password);

export const normalizeFingerprint = (f: string | null | undefined) =>
  (f ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase();

/**
 * Llamada REST a RouterOS. Con huella configurada acepta certificados autofirmados,
 * pero solo si coinciden con ella; los datos (incluidas las credenciales) no se envían
 * hasta verificar la huella.
 */
function rest<T>(c: RouterConfig, method: string, path: string, body?: unknown): Promise<T> {
  const url = new URL(`${c.router_url!.replace(/\/$/, "")}/rest${path}`);
  const pin = normalizeFingerprint(c.router_cert_fingerprint);
  const payload = body ? JSON.stringify(body) : undefined;

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        agent: false,
        timeout: 8000,
        rejectUnauthorized: !pin,
        headers: {
          Authorization: "Basic " + Buffer.from(`${c.router_user}:${c.router_password}`).toString("base64"),
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (!res.statusCode || res.statusCode >= 400) {
            return reject(new Error(`RouterOS ${method} ${path} → ${res.statusCode} ${text.slice(0, 200)}`));
          }
          try {
            resolve((text ? JSON.parse(text) : undefined) as T);
          } catch {
            reject(new Error(`RouterOS ${method} ${path}: respuesta no válida`));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("El router no respondió a tiempo")));
    req.on("error", reject);
    req.on("socket", (socket) => {
      socket.once("secureConnect", () => {
        if (pin) {
          const got = normalizeFingerprint((socket as TLSSocket).getPeerCertificate().fingerprint256);
          if (got !== pin) return req.destroy(new Error("La huella del certificado del router no coincide"));
        }
        req.end(payload);
      });
    });
  });
}

/** Asegura un user-profile de Hotspot con límite de velocidad "subida/bajada" (ej. 1024k/2048k). */
/** El router rechazó el reparto en un perfil, pero el perfil quedó con el límite simple y sigue sirviendo. */
export class SharingRejectedError extends Error {}

export type ProfileTuning = { maxDevices?: number; minKbps?: number; burstKbps?: number };

/**
 * Asegura un user-profile de Hotspot con su límite de velocidad y dispositivos. Con el reparto configurado, también
 * lo cuelga de la cola padre (para que los clientes compartan el internet) y le añade mínimo garantizado y ráfaga.
 */
export async function syncBandwidthProfile(
  c: RouterConfig,
  name: string,
  downloadKbps: number,
  uploadKbps: number,
  tuning: ProfileTuning = {}
) {
  if (!isConfigured(c)) return { simulated: true };
  const sharing = hasSharing(c);
  const equal = sharing && c.sharing_mode === "equal";
  // Modo equitativo: el perfil no crea cola por usuario; el padre (PCQ) reparte por igual entre todos
  const rate = equal ? "" : buildRateLimit({
    downloadKbps, uploadKbps,
    minKbps: sharing ? tuning.minKbps : 0,
    burstKbps: sharing ? tuning.burstKbps : 0,
  });
  const shared = String(Math.min(10, Math.max(1, Math.round(tuning.maxDevices ?? 1) || 1)));
  const body: Record<string, string> = { "rate-limit": rate, "shared-users": shared, ...(sharing && !equal ? { "parent-queue": PARENT_QUEUE } : {}) };
  const existing = await rest<{ ".id": string; name: string }[]>(
    c, "GET", `/ip/hotspot/user/profile?name=${encodeURIComponent(name)}`
  );
  const apply = (b: Record<string, string>) => existing.length
    ? rest(c, "PATCH", `/ip/hotspot/user/profile/${existing[0][".id"]}`, b)
    : rest(c, "PUT", "/ip/hotspot/user/profile", { name, ...b });
  try {
    await apply(body);
  } catch (e) {
    if (!sharing) throw e;
    // El router rechazó el reparto (padre, mínimo o ráfaga): el perfil no debe quedar sin actualizar, así que se deja con el límite simple de siempre
    await apply({ "rate-limit": buildRateLimit({ downloadKbps, uploadKbps }), "shared-users": shared });
    throw new SharingRejectedError(`El router rechazó el reparto en el perfil «${name}» (${e instanceof Error ? e.message : "error"}); quedó con el límite simple`);
  }
  return { simulated: false };
}

/**
 * Igual que `syncBandwidthProfile`, pero si el router solo rechazó el reparto (el perfil quedó con el límite simple) no falla:
 * aprobar, crear usuarios o conectar visitantes no deben bloquearse por eso. El error sí se informa al aplicar el reparto.
 */
export async function syncBandwidthProfileSafe(...args: Parameters<typeof syncBandwidthProfile>) {
  try {
    return await syncBandwidthProfile(...args);
  } catch (e) {
    if (e instanceof SharingRejectedError) {
      console.error("syncBandwidthProfile:", e.message);
      return { simulated: false };
    }
    throw e;
  }
}

/** Crea o actualiza la cola padre con el internet contratado. Va antes que los perfiles que cuelgan de ella. */
export async function ensureParentQueue(c: RouterConfig) {
  if (!isConfigured(c)) return { simulated: true };
  if (!hasSharing(c)) throw new Error("Falta configurar el internet contratado y la red del WiFi");
  const equal = c.sharing_mode === "equal";
  const body = {
    target: c.hotspot_network!,
    "max-limit": `${c.total_up_kbps}k/${c.total_down_kbps}k`,
    queue: equal ? `${PCQ_UP}/${PCQ_DOWN}` : "default-small/default-small",
    comment: "Portal: reparto del ancho de banda del WiFi",
  };
  const found = await rest<{ ".id": string }[]>(c, "GET", `/queue/simple?name=${encodeURIComponent(PARENT_QUEUE)}`);
  if (found.length) await rest(c, "PATCH", `/queue/simple/${found[0][".id"]}`, body);
  else await rest(c, "PUT", "/queue/simple", { name: PARENT_QUEUE, ...body });
  await ensureParentFirst(c);
  return { simulated: false };
}

/**
 * Deja `PORTAL-ROOT` como primera cola de la lista. RouterOS atiende las colas de primer nivel en orden y la cola general del
 * Hotspot (`hs-<servidor>`, dinámica, apunta a toda la interfaz) se queda con todo el tráfico si va antes: las colas que cuelgan de
 * `PORTAL-ROOT` (usuarios, visitantes, equipos fijos) no recibirían ni un byte y nadie quedaría limitado. Dato del router real (7.12).
 * Devuelve true si tuvo que moverla.
 */
export async function ensureParentFirst(c: RouterConfig): Promise<boolean> {
  if (!isConfigured(c) || !hasSharing(c)) return false;
  const all = await rest<{ ".id": string; name?: string }[]>(c, "GET", "/queue/simple");
  const first = all[0];
  const mine = all.find((q) => q.name === PARENT_QUEUE);
  if (!first || !mine || first[".id"] === mine[".id"]) return false;
  await rest(c, "POST", "/queue/simple/move", { numbers: mine[".id"], destination: first[".id"] });
  return true;
}

export type FixedQueueSpec = { mac: string; ip: string; downKbps: number; upKbps: number; minKbps: number };

/** Cola propia de un equipo fijo (exento del Hotspot), colgada de la cola padre. Requiere IP fija. */
export async function upsertFixedQueue(c: RouterConfig, q: FixedQueueSpec) {
  if (!isConfigured(c) || !hasSharing(c)) return { simulated: true };
  const name = fixedQueueName(q.mac);
  // 0 = sin tope propio (sigue limitado por el padre); el mínimo nunca supera un tope que sí exista
  const caps = [q.downKbps, q.upKbps].filter((n) => n > 0);
  const min = caps.length ? Math.min(q.minKbps, ...caps) : q.minKbps;
  const body = {
    target: `${q.ip}/32`,
    "max-limit": `${Math.max(0, q.upKbps)}k/${Math.max(0, q.downKbps)}k`,
    "limit-at": `${Math.max(0, min)}k/${Math.max(0, min)}k`,
    parent: PARENT_QUEUE,
    comment: "Portal: equipo fijo",
  };
  const found = await rest<{ ".id": string }[]>(c, "GET", `/queue/simple?name=${encodeURIComponent(name)}`);
  if (found.length) await rest(c, "PATCH", `/queue/simple/${found[0][".id"]}`, body);
  else await rest(c, "PUT", "/queue/simple", { name, ...body });
  return { simulated: false };
}

export async function removeFixedQueue(c: RouterConfig, mac: string) {
  if (!isConfigured(c)) return;
  const found = await rest<{ ".id": string }[]>(c, "GET", `/queue/simple?name=${encodeURIComponent(fixedQueueName(mac))}`);
  for (const f of found) await rest(c, "DELETE", `/queue/simple/${f[".id"]}`);
}

/** Nombres de las colas de equipos fijos que existen en el router (para mostrar si siguen aplicadas). */
export async function listFixedQueueNames(c: RouterConfig): Promise<Set<string>> {
  const all = await rest<Record<string, string>[]>(c, "GET", "/queue/simple");
  return new Set(all.map((q) => q.name).filter((n) => n?.startsWith("FIXED-")));
}

export async function createHotspotUser(c: RouterConfig, username: string, password: string, profileName: string) {
  if (!isConfigured(c)) return { simulated: true };
  await rest(c, "PUT", "/ip/hotspot/user", { name: username, password, profile: profileName });
  return { simulated: false };
}

async function findUserId(c: RouterConfig, username: string) {
  const r = await rest<{ ".id": string }[]>(c, "GET", `/ip/hotspot/user?name=${encodeURIComponent(username)}`);
  return r[0]?.[".id"];
}

export async function setHotspotUserDisabled(c: RouterConfig, username: string, disabled: boolean) {
  if (!isConfigured(c)) return { simulated: true };
  const id = await findUserId(c, username);
  if (id) await rest(c, "PATCH", `/ip/hotspot/user/${id}`, { disabled: disabled ? "true" : "false" });
  return { simulated: false };
}

export async function deleteHotspotUser(c: RouterConfig, username: string) {
  if (!isConfigured(c)) return { simulated: true };
  const id = await findUserId(c, username);
  if (id) await rest(c, "DELETE", `/ip/hotspot/user/${id}`);
  return { simulated: false };
}

/** Consumo acumulado por usuario del Hotspot (campos bytes-in / bytes-out). */
export async function fetchUsage(c: RouterConfig, usernames: string[]): Promise<{ simulated: boolean; rows: RouterUserUsage[] }> {
  if (!isConfigured(c)) {
    return {
      simulated: true,
      rows: usernames.map((name, i) => ({
        name,
        bytesIn: (i + 1) * 120_000_000,
        bytesOut: (i + 1) * 30_000_000,
        disabled: false,
      })),
    };
  }
  const all = await rest<Record<string, string>[]>(c, "GET", "/ip/hotspot/user");
  const set = new Set(usernames);
  return {
    simulated: false,
    rows: all
      .filter((u) => set.has(u.name))
      .map((u) => ({
        name: u.name,
        bytesIn: Number(u["bytes-in"] ?? 0),
        bytesOut: Number(u["bytes-out"] ?? 0),
        disabled: u.disabled === "true",
      })),
  };
}

// ---- Equipos fijos: excepciones de Hotspot por MAC (no pasan por el login) ----

/** Crea una excepción `bypassed` para una MAC. Devuelve el id que asigna el router. */
export async function addBypassBinding(c: RouterConfig, mac: string, comment: string): Promise<string> {
  const res = await rest<Record<string, string>>(c, "PUT", "/ip/hotspot/ip-binding", {
    "mac-address": mac, type: "bypassed", comment,
  });
  return res[".id"];
}

/** Excepciones existentes en el router (para comprobar que siguen aplicadas). */
export async function listIpBindings(c: RouterConfig): Promise<Set<string>> {
  const rows = await rest<Record<string, string>[]>(c, "GET", "/ip/hotspot/ip-binding");
  return new Set(rows.map((r) => r[".id"]));
}

/** Borra una excepción. Si ya no existe en el router (404), se da por borrada. */
export async function removeIpBinding(c: RouterConfig, id: string): Promise<void> {
  try {
    await rest(c, "DELETE", `/ip/hotspot/ip-binding/${encodeURIComponent(id)}`);
  } catch (e) {
    if (!(e instanceof Error && e.message.includes("→ 404"))) throw e;
  }
}

// ---- Invitados (portal cautivo) ----

export type HostInfo = { mac: string; authorized: boolean; bypassed: boolean; server: string };

/** Busca en /ip/hotspot/host el dispositivo con esa IP. Sirve para comprobar que la MAC/IP de la URL es real. */
export async function findHostByAddress(c: RouterConfig, ip: string): Promise<HostInfo | null> {
  const rows = await rest<Record<string, string>[]>(c, "GET", `/ip/hotspot/host?address=${encodeURIComponent(ip)}`);
  const h = rows.find((r) => r.address === ip);
  if (!h) return null;
  return {
    mac: (h["mac-address"] ?? "").toUpperCase(),
    authorized: h.authorized === "true",
    bypassed: h.bypassed === "true",
    server: h.server ?? "",
  };
}

export type GuestUserSpec = { name: string; password: string; profile: string; limitUptime: string; comment: string };

export async function createGuestUser(c: RouterConfig, u: GuestUserSpec) {
  await rest(c, "PUT", "/ip/hotspot/user", {
    name: u.name, password: u.password, profile: u.profile, "limit-uptime": u.limitUptime, comment: u.comment,
  });
}

export type GuestUserInfo = { name: string; bytesIn: number; bytesOut: number; uptime: string };

/** Nombres de todos los usuarios del Hotspot (en minúsculas), para elegir un nombre que no choque. */
export async function listHotspotUserNames(c: RouterConfig): Promise<Set<string>> {
  const all = await rest<Record<string, string>[]>(c, "GET", "/ip/hotspot/user");
  return new Set(all.map((u) => (u.name ?? "").toLowerCase()).filter(Boolean));
}

/** Usuarios temporales de invitados (nombre "g_…") con sus contadores. */
export async function listGuestUsers(c: RouterConfig): Promise<GuestUserInfo[]> {
  const all = await rest<Record<string, string>[]>(c, "GET", "/ip/hotspot/user");
  return all
    .filter((u) => typeof u.name === "string" && u.name.startsWith("g_"))
    .map((u) => ({
      name: u.name,
      bytesIn: Number(u["bytes-in"] ?? 0),
      bytesOut: Number(u["bytes-out"] ?? 0),
      uptime: u.uptime ?? "0s",
    }));
}

/**
 * Sesiones abiertas ahora mismo, por nombre de usuario, con los contadores de la sesión en curso.
 * Los contadores del usuario (/ip/hotspot/user) solo se actualizan cuando la sesión termina.
 */
export async function listActiveSessions(c: RouterConfig): Promise<Map<string, { bytesIn: number; bytesOut: number }>> {
  const rows = await rest<Record<string, string>[]>(c, "GET", "/ip/hotspot/active");
  return new Map(
    rows.filter((r) => r.user).map((r) => [r.user, { bytesIn: Number(r["bytes-in"] ?? 0), bytesOut: Number(r["bytes-out"] ?? 0) }])
  );
}

export const formatBytes = (n: number) => {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};

/** Deshabilita todos los usuarios del Hotspot y expulsa las sesiones abiertas (suspensión del establecimiento). */
export async function cutAllAccess(c: RouterConfig): Promise<{ users: number; sessions: number }> {
  if (!isConfigured(c)) return { users: 0, sessions: 0 };
  const users = await rest<Record<string, string>[]>(c, "GET", "/ip/hotspot/user");
  let u = 0;
  for (const x of users) {
    if (x["name"] && x["name"] !== "default-trial") {
      await rest(c, "PATCH", `/ip/hotspot/user/${x[".id"]}`, { disabled: "true" });
      u++;
    }
  }
  const active = await rest<Record<string, string>[]>(c, "GET", "/ip/hotspot/active");
  for (const a of active) await rest(c, "DELETE", `/ip/hotspot/active/${a[".id"]}`);
  return { users: u, sessions: active.length };
}

/** Vuelve a habilitar los usuarios indicados (los de cuentas activas) al reactivar un establecimiento. */
export async function enableUsers(c: RouterConfig, usernames: string[]): Promise<number> {
  if (!isConfigured(c)) return 0;
  const wanted = new Set(usernames.map((n) => n.toLowerCase()));
  const users = await rest<Record<string, string>[]>(c, "GET", "/ip/hotspot/user");
  let n = 0;
  for (const x of users) {
    if (wanted.has((x["name"] ?? "").toLowerCase()) && x["disabled"] === "true") {
      await rest(c, "PATCH", `/ip/hotspot/user/${x[".id"]}`, { disabled: "false" });
      n++;
    }
  }
  return n;
}

/** Prueba la conexión y devuelve el modelo y la versión de RouterOS. */
export async function testConnection(c: RouterConfig): Promise<{ board: string; version: string }> {
  const r = await rest<Record<string, string>>(c, "GET", "/system/resource");
  return { board: r["board-name"] ?? "?", version: r["version"] ?? "?" };
}

export type ActiveSession = { user: string; address: string; mac: string; uptime: string; bytes: number; loginBy: string };

/** Sesiones abiertas ahora en el Hotspot (una fila por dispositivo, aunque compartan usuario). */
export async function listActiveDetails(c: RouterConfig): Promise<ActiveSession[]> {
  const rows = await rest<Record<string, string>[]>(c, "GET", "/ip/hotspot/active");
  return rows.filter((r) => r.user).map((r) => ({
    user: r.user, address: r.address ?? "", mac: (r["mac-address"] ?? "").toUpperCase(), uptime: r.uptime ?? "",
    bytes: Number(r["bytes-in"] ?? 0) + Number(r["bytes-out"] ?? 0), loginBy: r["login-by"] ?? "",
  }));
}

/** Cambia la contraseña de un usuario del Hotspot. Falla si el usuario no existe en el router. */
export async function setHotspotUserPassword(c: RouterConfig, username: string, password: string) {
  if (!isConfigured(c)) return { simulated: true };
  const id = await findUserId(c, username);
  if (!id) throw new Error("El usuario no existe en el router");
  await rest(c, "PATCH", `/ip/hotspot/user/${id}`, { password });
  return { simulated: false };
}

/** Cierra las sesiones abiertas de un usuario (para que vuelva a entrar con la contraseña nueva). Devuelve cuántas cerró. */
export async function kickUserSessions(c: RouterConfig, username: string): Promise<number> {
  if (!isConfigured(c)) return 0;
  const rows = await rest<Record<string, string>[]>(c, "GET", `/ip/hotspot/active?user=${encodeURIComponent(username)}`);
  const mine = rows.filter((r) => r.user === username && r[".id"]);
  for (const r of mine) await rest(c, "DELETE", `/ip/hotspot/active/${r[".id"]}`);
  return mine.length;
}


/** Grupo de equipos fijos que se reparten por igual (PCQ) bajo la cola padre. */
export async function upsertPoolQueue(c: RouterConfig, q: { target: string; guaranteeKbps: number }) {
  if (!isConfigured(c) || !hasSharing(c)) return { simulated: true };
  // RouterOS rechaza un limit-at mayor que el max-limit, y «0» (sin tope) cuenta como menor: el grupo puede usar hasta todo el internet contratado
  const maxUp = c.total_up_kbps ?? 0, maxDown = c.total_down_kbps ?? 0;
  const g = Math.max(0, q.guaranteeKbps);
  const body = {
    target: q.target,
    "max-limit": `${maxUp}k/${maxDown}k`,
    "limit-at": `${Math.min(g, maxUp || g)}k/${Math.min(g, maxDown || g)}k`,
    parent: PARENT_QUEUE,
    queue: `${PCQ_UP}/${PCQ_DOWN}`,
    comment: "Portal: equipos fijos (reparto por igual)",
  };
  const found = await rest<{ ".id": string }[]>(c, "GET", `/queue/simple?name=${encodeURIComponent(FIXED_POOL)}`);
  if (found.length) await rest(c, "PATCH", `/queue/simple/${found[0][".id"]}`, body);
  else await rest(c, "PUT", "/queue/simple", { name: FIXED_POOL, ...body });
  return { simulated: false };
}

/** Quita las colas «FIXED-…» que ya no corresponden a ningún equipo (borrados, cambiados de grupo o sin IP). `keep` = nombres que se conservan. */
export async function removeStaleFixedQueues(c: RouterConfig, keep: Set<string>): Promise<number> {
  if (!isConfigured(c)) return 0;
  const all = await rest<Record<string, string>[]>(c, "GET", "/queue/simple");
  let n = 0;
  for (const q of all) {
    if (q.name?.startsWith(FIXED_PREFIX) && !keep.has(q.name) && q[".id"]) {
      await rest(c, "DELETE", `/queue/simple/${q[".id"]}`);
      n++;
    }
  }
  return n;
}

/**
 * IP actual de cada equipo según el router, por MAC (en mayúsculas con «:»). Fuentes, de más a menos fiable para un equipo exento
 * del Hotspot: sus «hosts», los arrendamientos del DHCP y la tabla ARP. Cada fuente que falle se omite. Sirve para ponerles cola
 * a los equipos fijos aunque no se haya escrito su IP.
 */
export async function lookupIpsByMac(c: RouterConfig): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!isConfigured(c)) return out;
  const sources: [string, (r: Record<string, string>) => boolean][] = [
    ["/ip/hotspot/host", () => true],
    ["/ip/dhcp-server/lease", (r) => r.status === "bound" || r.status === undefined],
    ["/ip/arp", (r) => r.disabled !== "true" && r.invalid !== "true"],
  ];
  for (const [path, ok] of sources) {
    let rows: Record<string, string>[];
    try {
      rows = await rest<Record<string, string>[]>(c, "GET", path);
    } catch (e) {
      console.error("lookupIpsByMac", path, e instanceof Error ? e.message : "error");
      continue;
    }
    for (const r of rows) {
      const mac = normalizeMac(r["mac-address"] ?? "");
      const ip = r.address ?? "";
      if (mac && isIPv4(ip) && ok(r) && !out.has(mac)) out.set(mac, ip);
    }
  }
  return out;
}
