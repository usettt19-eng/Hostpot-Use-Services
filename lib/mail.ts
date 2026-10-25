import nodemailer from "nodemailer";

// Envío de correo por SMTP (cualquier proveedor: el del dominio, Brevo, Resend, SES, Gmail con clave de aplicación…).
// Variables de entorno, solo servidor: SMTP_URL (smtps://usuario:clave@servidor:465) y MAIL_FROM («Nombre <correo@dominio>»).
// Las credenciales nunca se escriben en el código ni en la bitácora.

export const mailConfigured = () => !!process.env.SMTP_URL?.trim() && !!process.env.MAIL_FROM?.trim();

let transport: nodemailer.Transporter | null = null;

export async function sendMail(m: { to: string; subject: string; text: string }): Promise<void> {
  if (!mailConfigured()) throw new Error("Correo no configurado (SMTP_URL y MAIL_FROM)");
  transport ??= nodemailer.createTransport(process.env.SMTP_URL!, { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 });
  await transport.sendMail({ from: process.env.MAIL_FROM, to: m.to, subject: m.subject, text: m.text });
}
