# Hotspot de prueba en el MikroTik (red aparte en `ether3`)

Objetivo: probar el flujo actual (usuario aprobado en el portal → inicia sesión en el Hotspot → límite de velocidad → consumo) **sin tocar las redes en uso** (`bridge1`, `bridge2`, VLAN, `pppoe-out1`).
Los comandos son no interactivos (sin el asistente `/ip hotspot setup`) para poder revertirlos. Pégalos **bloque por bloque**: la terminal del router se ha confundido con pegados largos.
⚠️ = no verificado en un router real; se confirma al probar.

Antes de empezar: `ether3` debe estar **sin cable** y no debes estar conectado al router por ese puerto.

## 1. Red de prueba
```
/interface bridge port remove [find interface=ether3]
/interface bridge add name=bridge-hotspot
/interface bridge port add bridge=bridge-hotspot interface=ether3
/ip address add address=192.168.200.1/24 interface=bridge-hotspot
```

## 2. DHCP de la red de prueba
Se entregan DNS públicos directamente, para no abrir el DNS del router a nadie más.
```
/ip pool add name=pool-hotspot ranges=192.168.200.10-192.168.200.200
/ip dhcp-server network add address=192.168.200.0/24 gateway=192.168.200.1 dns-server=8.8.8.8,1.1.1.1
/ip dhcp-server add name=dhcp-hotspot interface=bridge-hotspot address-pool=pool-hotspot lease-time=1h disabled=no
```

## 3. Hotspot
```
/ip hotspot profile add name=hsprof-test hotspot-address=192.168.200.1 login-by=http-chap,http-pap
/ip hotspot add name=hotspot-test interface=bridge-hotspot address-pool=pool-hotspot profile=hsprof-test disabled=no
```
La salida a internet usa el `masquerade` hacia `pppoe-out1` que ya existe.

## 4. Verificar
```
/ip hotspot print
/ip dhcp-server print
```
Debe verse `hotspot-test` sin `X` y `dhcp-hotspot` sin `X`.

## 5. Probar con un dispositivo
1. Enchufa un portátil, o un punto de acceso WiFi, en `ether3`. Debe recibir una IP `192.168.200.x`.
2. Abre una web sin HTTPS, p. ej. `http://neverssl.com`. Debe redirigir a `http://192.168.200.1/login`. ⚠️ La resolución de nombres de un cliente sin sesión puede requerir ajuste si no redirige.
3. Inicia sesión con un usuario creado desde el portal (p. ej. `srubend`). El portal no guarda la contraseña; si no la tienes, ponle una nueva: `/ip hotspot user set srubend password="Clave12345"`.
4. Comprueba:
```
/ip hotspot active print
/queue simple print
/ip dhcp-server lease print
```
5. Mide la velocidad (fast.com): con el perfil `Clientes` se espera ~5 Mbps de bajada y ~2 de subida. Si salen invertidas, hay que cambiar el orden en `lib/mikrotik.ts`.
6. Abre **Consumo** en el portal: debe aparecer el usuario con sus bytes.

## 6. Si algo no funciona, pega estas salidas
```
/ip hotspot print detail
/ip hotspot host print
/ip firewall filter print
/ip firewall nat print
/ip dns print
```

## 7. Deshacer todo (vuelve `ether3` a `bridge1`)
```
/ip hotspot remove [find name=hotspot-test]
/ip hotspot profile remove [find name=hsprof-test]
/ip dhcp-server remove [find name=dhcp-hotspot]
/ip dhcp-server network remove [find address=192.168.200.0/24]
/ip pool remove [find name=pool-hotspot]
/ip address remove [find interface=bridge-hotspot]
/interface bridge port remove [find interface=ether3]
/interface bridge remove [find name=bridge-hotspot]
/interface bridge port add bridge=bridge1 interface=ether3
```

## Lo que NO hace falta todavía
El portal cautivo de invitados (`/w/{código}`) hoy es una vista simulada: **no se conecta con el Hotspot**. Para esa fase (diseño en `docs/DISENO-SMARTWIFI.md`, sección C) harán falta, además de lo de arriba: un `login.html` que redirija al portal, entradas en el *walled garden* para que el cliente alcance el portal antes de iniciar sesión, y `login-by=http-pap`. Se prepararán y probarán en la Fase 0.
