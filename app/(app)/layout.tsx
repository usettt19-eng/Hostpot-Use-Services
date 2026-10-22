import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase";
import { logout } from "@/app/actions";
import { ROLE_LABEL, isAdminRole } from "@/lib/roles";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles").select("full_name, role, status, tenants(name)").eq("id", auth.user.id).single();
  const isAdmin = me && me.status === "active" && isAdminRole(me.role);
  const tenant = me?.tenants as unknown as { name: string } | null;

  return (
    <>
      <header className="top">
        <strong>{tenant?.name ?? "Portal"}</strong>
        <Link href="/dashboard">Inicio</Link>
        {isAdmin && (
          <>
            <Link href="/admin/users">Usuarios</Link>
            <Link href="/admin/bandwidth">Ancho de banda</Link>
            <Link href="/admin/usage">Consumo</Link>
            <Link href="/admin/portal">Portal</Link>
            <Link href="/admin/guests">Visitantes</Link>
            <Link href="/admin/fixed-devices">Equipos fijos</Link>
          </>
        )}
        <span className="muted">{me?.full_name} · {me ? ROLE_LABEL[me.role] : ""}</span>
        <form action={logout}><button className="ghost">Salir</button></form>
      </header>
      <main>{children}</main>
    </>
  );
}
