# Configuración de un MikroTik para el portal (RouterOS 7)

Referencia única de cómo debe quedar un router. Estado: **verificada en el router de prueba (hEX lite, 7.12.1)** salvo lo marcado «sin verificar» o «pendiente». Nunca escribir claves aquí.

## Quién hace qué
| Qué | Lo hace | Dónde |
|---|---|---|
| Túnel WireGuard, usuario `portal`, API segura, red del Hotspot, Hotspot, walled garden, `login.html`, **reglas de aislamiento** | Se pega en el router | `/platform/router/{id}` → «Generar configuración» (`lib/router-script.ts`, bloques copiables y `.rsc`) |
| Cola padre `PORTAL-ROOT`, perfiles de velocidad (límite, mínimo, ráfaga, `parent-queue`, `address-list=visitantes`), colas de equipos fijos, lista `equipos-fijos` | El portal, solo | «Guardar y aplicar en el router» y al registrar/editar/quitar equipos; el cron lo mantiene cada minuto |
| Usuarios del Hotspot y excepciones por MAC de equipos fijos | El portal, solo | Usuarios / Equipos fijos |
| Lista blanca de los enlaces de las campañas (`/ip hotspot walled-garden`, comentario «Portal: campaña», dominio y `*.dominio`) | El portal, solo | Al guardar, activar, pausar o borrar una campaña |
| Endurecimiento del router (servicios, firewall de entrada, MAC-server) | **A mano, todavía no está en el script** | Ver «Pendiente» |

## Lo que debe existir en el router (comprobar con estos comandos)
```
/ip hotspot print                                   # hotspot-… activo, sin X
/ip hotspot ip-binding print                        # equipos fijos como bypassed
/ip hotspot user profile print detail               # cada perfil con parent-queue=PORTAL-ROOT y rate-limit largo; el de visitantes con address-list=visitantes
/queue simple print                                 # PORTAL-ROOT antes que hs-<hotspot>; FIXED-… y FIXED-POOL colgando de PORTAL-ROOT
/ip firewall address-list print where list=equipos-fijos   # IP de los equipos fijos (las llena el portal)
/ip firewall filter print stats where comment~"^portal:"   # 3 reglas; los contadores suben al probar
/interface bridge settings print                    # use-ip-firewall=yes
```

## Datos del router real que importan (7.12)
- `rate-limit` con mínimo: tiempo de ráfaga en **segundos sin la letra `s`**; `0/0` = sin ráfaga. Ej.: `2048k/5120k 0/0 0/0 0/0 8 750k/750k`.
- **`PORTAL-ROOT` debe ir antes que la cola dinámica `hs-<servidor>`**: esa abarca toda la interfaz y, si va antes, ninguna cola hija recibe tráfico (nadie queda limitado). El portal lo corrige al aplicar y en el cron. Las colas `<hotspot-…>` que RouterOS pone arriba cuelgan de `PORTAL-ROOT` y no importan.
- Una cola con `limit-at` mayor que `max-limit` se rechaza, y `max-limit=0` cuenta como menor.
- Las colas y listas del portal no tocan lo ajeno: solo `PORTAL-ROOT`, `FIXED-*`, y entradas de lista con comentario «Portal: …».
- La IP de un equipo fijo sin IP escrita se obtiene por su MAC (hosts del Hotspot, DHCP, ARP).

## Reparto verificado
En el router de prueba, con varios equipos descargando a la vez: las colas de usuarios, visitantes y equipos fijos cuentan tráfico y descartan paquetes al pasar su tope, y `FIXED-POOL` reparte con PCQ (`pcq-queues` activos). Sin medir todavía: el mínimo garantizado por dispositivo con la línea saturada (requiere ver las tasas de cada cola a la vez durante la prueba).

## Aislamiento de visitantes
Bloque «Aislar a los visitantes» del script: `use-ip-firewall=yes`, lista `redes-privadas` y tres reglas (visitantes → equipos fijos, visitantes → redes privadas, visitantes → puertos de administración del router).
- Verificado en el router de prueba: las tres reglas descartan paquetes (`forward` hacia equipos fijos y hacia redes privadas; `input` hacia los puertos de administración, con la regla puesta al final de la lista, sin moverla).
- Si en otro router el contador de la regla de `input` no sube al probar `https://<IP del router>` desde un visitante y la página carga, una regla del Hotspot la deja pasar antes: `/ip firewall filter move [find comment="portal: visitantes no administran el router"] destination=0`.
- Límite: el router no ve el tráfico entre equipos conectados al mismo punto de acceso WiFi (hay que activar el aislamiento de clientes o una red de invitados en el AP).
- Se activa siempre con **Safe Mode**.

## Pendiente (aún no automatizado ni en el script)
- Cerrar `www` (puerto 80) y `/tool bandwidth-server`; SSH y WinBox solo desde la red de administración.
- Reglas de firewall de entrada básicas: aceptar established/related, descartar invalid, aceptar el túnel (UDP 13231 desde la IP pública del servidor), ICMP, y descartar el resto desde la WAN.
- Cerrar MAC-server y descubrimiento de vecinos hacia el puente del Hotspot.
- Actualizar RouterOS (7.12.1 por debajo de las versiones corregidas) tras una copia de seguridad.
- Cambiar las contraseñas que se compartieron en el chat.
