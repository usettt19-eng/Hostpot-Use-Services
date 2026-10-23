import Image from "next/image";
import logo from "@/assets/logo.png";
import { SITE } from "@/lib/site";

/** Logo del servicio para las pantallas de acceso. Va sobre un fondo blanco para verse bien también en modo oscuro. */
export default function AuthLogo() {
  return (
    <div className="authlogo">
      <Image src={logo} alt={SITE.name} priority unoptimized />
    </div>
  );
}
