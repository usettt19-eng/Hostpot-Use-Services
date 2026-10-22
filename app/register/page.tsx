import RegisterForm from "./register-form";

// El código del establecimiento llega por la URL (?school=) desde el portal del local. Se lee en el servidor
// para que el formulario viaje en el HTML (los mini-navegadores de portal cautivo ejecutan poco JavaScript).
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  return <RegisterForm initial={(school ?? "").slice(0, 80)} />;
}
