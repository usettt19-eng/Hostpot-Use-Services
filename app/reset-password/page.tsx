import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ResetForm } from "@/components/PasswordForms";
import AuthLogo from "@/components/AuthLogo";

export const dynamic = "force-dynamic";

export default async function ResetPage() {
  const jar = await cookies();
  if (jar.get("pw_reset")?.value !== "1") redirect("/forgot-password");
  return (
    <div className="auth">
      <div className="card">
        <AuthLogo />
        <h1>Elige tu contraseña nueva</h1>
        <p className="muted">Al guardarla se cerrarán las demás sesiones de tu cuenta.</p>
        <ResetForm />
      </div>
    </div>
  );
}
