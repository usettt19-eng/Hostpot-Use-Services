import Link from "next/link";
import { ForgotForm } from "@/components/PasswordForms";

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="auth">
      <div className="card">
        <h1>Recuperar contraseña</h1>
        <p className="muted">Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.</p>
        {error && <p className="err" role="alert">El enlace no es válido o ya venció. Pide uno nuevo.</p>}
        <ForgotForm />
        <p className="muted"><Link href="/login">Volver a entrar</Link></p>
      </div>
    </div>
  );
}
