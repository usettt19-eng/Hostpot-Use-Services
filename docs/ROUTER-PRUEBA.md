# Hotspot de prueba en el MikroTik (red aparte en `ether3`)

Estado (2026-10-22): pasos 1 a 4 aplicados y la sesión de `srubend` funcionó. Pendiente medir la velocidad.

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

## 8. Portal del invitado en el Hotspot (acceso por correo)
Hace que el router muestre **tu** portal (`/w/{código}`) en lugar del login de MikroTik. Requiere haber desplegado el portal con la migración `0007`, tener el router del establecimiento configurado en **Ancho de banda** y, de preferencia, un portal publicado en **Portal**.

**a) Permitir que el visitante alcance el portal antes de iniciar sesión** (walled garden):
```
/ip hotspot walled-garden add dst-host=connect.useservices.company comment="portal"
/ip hotspot walled-garden ip add dst-address=187.33.153.78 protocol=tcp dst-port=443 action=accept comment="portal"
```
⚠️ La regla por IP deja abierto el puerto 443 de esa IP, que es la del VPS: el visitante sin sesión podría abrir cualquier otro sitio que alojes ahí. Es aceptable para pruebas; para producción conviene una IP exclusiva del portal.

**b) Cambiar la página de inicio de sesión del Hotspot.** Usa `deploy/mikrotik/login.html` del repositorio (cambia el dominio y el código `use-test` si hace falta).
1. Guarda la original: `/ip hotspot print` y luego `/file print where name~"hotspot/login"`. Si la carpeta `hotspot/` no existe, ejecuta `/ip hotspot reset-html` ⚠️.
2. Renómbrala: `/file set [find name="hotspot/login.html"] name="hotspot/login-original.html"`.
3. En WinBox → Files, arrastra el `login.html` del repositorio dentro de la carpeta `hotspot/`.
4. Que el perfil acepte el inicio de sesión con usuario y contraseña por URL: `/ip hotspot profile set hsprof-test login-by=http-chap,http-pap` (ya está así).

**c) Probar**
1. Conecta un dispositivo a `ether3`, abre `http://neverssl.com`: debe llevarte a `https://connect.useservices.company/w/use-test?...` con tu diseño. ⚠️ Si ves el texto `$(mac-esc)` sin sustituir en la URL, esa variable no existe en tu versión: pega la URL.
2. Escribe un correo, acepta los términos y pulsa el botón: debe pasar un instante por el login del Hotspot y abrir la web original.
3. En el router: `/ip hotspot active print` (un usuario `g_…`) y `/ip hotspot user print` (el usuario temporal).
4. En el portal: **Visitantes** debe mostrar el correo, y **Consumo** sigue mostrando solo a los usuarios aprobados.

**d) Deshacer**
```
/file remove [find name="hotspot/login.html"]
/file set [find name="hotspot/login-original.html"] name="hotspot/login.html"
/ip hotspot walled-garden remove [find comment="portal"]
/ip hotspot walled-garden ip remove [find comment="portal"]
```

## Varias sesiones con un mismo usuario (pruebas)
El límite de un dispositivo por usuario viene del perfil: `/ip hotspot user profile set Clientes shared-users=5`. Afecta a todos los usuarios con ese perfil. Los usuarios creados solo en el router (`/ip hotspot user add ...`) no aparecen en el portal.

## Lo que NO hace falta todavía
Verificación de correo (OTP) y el panel con gráficas: ver `docs/DISENO-SMARTWIFI.md`. El acceso por correo de la sección 8 **no verifica** que el correo sea del visitante.
