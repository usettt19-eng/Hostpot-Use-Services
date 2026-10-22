// Cliente RouterOS v7 REST (https://help.mikrotik.com/docs/spaces/ROS/pages/47579162/REST+API)
import https from "node:https";
import type { TLSSocket } from "node:tls";

// Si el tenant no tiene router configurado, opera en modo simulado (no falla, devuelve datos de ejemplo).

export type RouterConfig = {
  router_url: string | null;
  router_user: string | null;
  router_password: string | null;
  /** SHA-256 del certificado del router (hex, con o sin ":"). Si se define, se fija (pinning) en lugar de validar la cadena. */
  router_cert_fingerprint?: string | null;
};

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
export async function syncBandwidthProfile(
  c: RouterConfig,
  name: string,
  downloadKbps: number,
  uploadKbps: number
) {
  if (!isConfigured(c)) return { simulated: true };
  const rate = `${uploadKbps}k/${downloadKbps}k`;
  const existing = await rest<{ ".id": string; name: string }[]>(
    c, "GET", `/ip/hotspot/user/profile?name=${encodeURIComponent(name)}`
  );
  if (existing.length) {
    await rest(c, "PATCH", `/ip/hotspot/user/profile/${existing[0][".id"]}`, { "rate-limit": rate });
  } else {
    await rest(c, "PUT", "/ip/hotspot/user/profile", { name, "rate-limit": rate });
  }
  return { simulated: false };
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
