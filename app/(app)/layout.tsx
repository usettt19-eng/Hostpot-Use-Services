import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase";
import { logout } from "@/app/actions";
import { ROLE_LABEL, isAdminRole } from "@/lib/roles";
import { isPlatformAdmin } from "@/lib/platform";
import { isTenantSuspended } from "@/lib/tenant-status";
import { enabledModules } from "@/lib/tenant-modules";
import AppNav, { type NavGroup } from "@/components/AppNav";
import Link from "next/link";
import { ChangePasswordForm } from "@/components/PasswordForms";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles").select("tenant_id, full_name, role, status, tenants(name)").eq("id", auth.user.id).single();
  const platform = isPlatformAdmin(auth.user.email);
  const suspended = !platform && !!me && (await isTenantSuspended(me.tenant_id));
  const isAdmin = !suspended && me && me.status === "active" && isAdminRole(me.role);
  const tenant = me?.tenants as unknown as { name: string } | null;
  const brand = tenant?.name ?? "Portal";

  const modules = isAdmin && me ? await enabledModules(me.tenant_id) : new Set<string>();
  const groups: NavGroup[] = [{ title: null, items: [{ href: "/dashboard", label: "Inicio", icon: "home" }] }];
  if (isAdmin) {
    groups.push(
      { title: "Gestión", items: [
        { href: "/admin/users", label: "Usuarios", icon: "users" },
        { href: "/admin/bandwidth", label: "Ancho de banda", icon: "gauge" },
        { href: "/admin/fixed-devices", label: "Equipos fijos", icon: "device" },
      ] },
      { title: "Portal", items: [
        { href: "/admin/portal", label: "Diseño y horarios", icon: "portal" },
        { href: "/admin/guests", label: "Visitantes", icon: "guest" },
        ...(modules.has("promotions") ? [{ href: "/admin/promotions", label: "Promociones", icon: "tag" }] : []),
      ] },
      { title: "Seguimiento", items: [
        { href: "/admin/connected", label: "Conectados", icon: "live" },
        { href: "/admin/staff-history", label: "Historial", icon: "history" },
        { href: "/admin/stats", label: "Estadísticas", icon: "chart" },
        { href: "/admin/usage", label: "Consumo", icon: "data" },
      ] },
    );
  }
  if (isAdmin) groups.push({ title: "Ayuda", items: [{ href: "/admin/help", label: "Preguntas frecuentes", icon: "help" }] });
  if (platform) groups.push({ title: "Plataforma", items: [{ href: "/platform", label: "Establecimientos", icon: "building" }] });

  const mustChange = auth.user.user_metadata?.must_change_password === true;
  const footer = (
    <>
      <div className="who">
        <b>{me?.full_name ?? auth.user.email}</b>
        <span>{me ? ROLE_LABEL[me.role] : ""}</span>
        <Link href="/account">Mi cuenta</Link>
      </div>
      <form action={logout}><button className="ghost">Salir</button></form>
    </>
  );

  return (
    <div className="app">
      <AppNav groups={groups} brand={brand} initial={brand.trim().charAt(0).toUpperCase() || "P"} footer={footer} />
      <main>
        {mustChange ? (
          <div className="card" style={{ maxWidth: 520 }}>
            <h1>Cambia tu contraseña</h1>
            <p className="muted">Entraste con una contraseña temporal. Elige una nueva para continuar.</p>
            <ChangePasswordForm forced />
          </div>
        ) : suspended ? (
          <div className="card">
            <h1>Servicio suspendido</h1>
            <p className="muted">El acceso de este establecimiento está suspendido. Contacta al administrador de la plataforma.</p>
          </div>
        ) : children}
      </main>
    </div>
  );
}
