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

const isConfigured = (c: RouterConfig) => !!(c.router_url && c.router_user && c.router_password);

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

export const formatBytes = (n: number) => {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};
