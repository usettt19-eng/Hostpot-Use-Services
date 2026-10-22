# Portal de Red Escolar (multitenant)

Next.js 15 + Supabase + MikroTik RouterOS v7 (REST).

## Qué hace
- **Multitenant**: cada establecimiento (escuela, restaurante, pub u hotel) es un tenant aislado con RLS en Postgres.
- **Registro y roles**: directivo, staff, docente, estudiante. Las cuentas nuevas quedan *pendientes* hasta que un administrador las aprueba.
- **Perfiles de ancho de banda por rol**: se sincronizan al `user profile` del Hotspot (`rate-limit`).
- **Usuarios del Hotspot**: al aprobar se crea el usuario en el router; se puede deshabilitar o quitar.
- **Panel de consumo**: bytes de bajada/subida por usuario y por rol.
- Sin router configurado, funciona en **modo simulado**.

## Puesta en marcha
1. Crea un proyecto en Supabase y ejecuta `supabase/migrations/0001_init.sql` en el SQL editor.
2. Copia `.env.example` a `.env.local` y completa las claves.
3. `npm install && npm run dev`
4. Entra a `/platform` (tu correo en `PLATFORM_ADMIN_EMAILS`) para crear el establecimiento y su administrador; para el primer arranque puedes abrir `/register-school` con `ALLOW_PUBLIC_SCHOOL_REGISTRATION=1`. El código del establecimiento que se muestra sirve para que los demás se registren en `/register`.
5. En **Ancho de banda → Conexión al MikroTik** ingresa URL, usuario y contraseña.

## MikroTik
```
/ip service set www-ssl disabled=no
/user group add name=portal policy=read,write,api,rest-api,test
/user add name=portal group=portal password=CAMBIAR
```
El router debe ser accesible desde el servidor donde corre el portal (VPN o IP pública restringida).

## Pendiente antes de producción
- Cifrar `router_password` (Supabase Vault) en vez de guardarla en texto plano.
- Mostrar la contraseña del Hotspot al usuario aprobado (hoy se genera aleatoria y no se muestra).
- Tarea programada que guarde `usage_stats` periódicamente para historial.
