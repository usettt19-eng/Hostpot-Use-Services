import { ChangePasswordForm } from "@/components/PasswordForms";

export default function AccountPage() {
  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h1>Mi cuenta</h1>
      <p className="muted">Cambia la contraseña con la que entras a este panel. Es distinta de la contraseña del WiFi.</p>
      <ChangePasswordForm />
    </div>
  );
}
