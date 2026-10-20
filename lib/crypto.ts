import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. La clave (32 bytes en base64) viene de ROUTER_CRED_KEY; solo servidor.
function key() {
  const b = Buffer.from(process.env.ROUTER_CRED_KEY ?? "", "base64");
  if (b.length !== 32) throw new Error("ROUTER_CRED_KEY debe ser 32 bytes en base64");
  return b;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
