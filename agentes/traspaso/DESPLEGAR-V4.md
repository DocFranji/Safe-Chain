# Versión 4: desplegar en testnet y salir a producción

Escrita por el ORQ el jueves 8 de octubre de 2026 (noche). Reemplaza a `DESPLEGAR-V3.md` y a `SALIDA-PRODUCCION.md`
para esta versión. Entrega: **lunes 12, 16:00 CR**. Congelamiento: **domingo 11, 12:00**. Piloto: **sábado 10**.

## Qué trae la v4

| Qué | Dónde | Quién lo hizo |
| --- | --- | --- |
| Cerrar la ronda antes si todos pagaron, sin mover las fechas (N3) | contrato de la tanda (`tiempos.rs`) | M1 |
| Pagar una deuda después de que la tanda terminó (N2b) | contrato de la tanda (`deudas.rs`) | M1 |
| Quien debe algo en cualquier tanda no se puede unir a otra (N2a) | historial (`tiene_mora`) + tanda (`ganchos.rs`) | M2 |
| Apodo público, perfil con historial y deudas, cerrar sesión (N4) | historial (`poner_apodo`) + web | M2 |
| Requisitos de historial que ya no se archivan en tandas largas (PR #17) | contrato de la tanda | M2 |
| Diseño definitivo **Órbita**, modo claro u oscuro, historia de eventos por tramos | web | WEB, ORQ |

**Cambian la tanda y el historial**, así que hay que desplegar contratos nuevos. El token TUSD **no** cambia (mismo
emisor), así que el faucet de Vercel sigue sirviendo con la misma `FAUCET_ISSUER_SECRET`.

**Lo que se pierde (es testnet, está bien):** las tandas de la v3 no aparecen en la web v4 (el contrato nuevo empieza
vacío) y el historial nuevo empieza en cero para todos.

## Orden (no saltarse pasos)

| Paso | Quién | Cuándo | Resultado |
| --- | --- | --- | --- |
| 1. Desplegar v4 en testnet | @DocFranji (WSL, tiene las llaves) | **Ya**: el contrato de `integracion` es el definitivo | Direcciones `C...` nuevas |
| 2. Publicar las direcciones en el tablero | @DocFranji | Al terminar el paso 1 | Comentario en el issue #4 |
| 3. Conectar la vista previa a la v4 | WEB, con revisión del ORQ | Apenas estén las direcciones | `#/estado` en verde en la vista previa |
| 4. Probar N2, N3 y N4 en la vista previa | Equipo | Viernes 9 | Reportes en el tablero |
| 5. Fusionar `integracion` → `main` | @DocFranji | Viernes 9, después del paso 4 | Producción con la v4 |
| 6. Renovar la bóveda rápida | @DocFranji | Antes del piloto y del video | Rendimiento visible en la demo |

**No fusionen `integracion` en `main` antes del paso 3.** Hasta entonces la web de `integracion` apunta a la tanda
v3: la página `#/estado` sale en rojo ("La web y el contrato coinciden") y los botones nuevos (apodo, pagar deuda
de una tanda terminada, cerrar antes) fallan al usarlos.

## Paso 1 · Desplegar en testnet (@DocFranji, unos 15 minutos)

```bash
cd ~/Safe-Chain
git fetch origin
git checkout integracion
git pull
git log --oneline -1      # el commit más nuevo de integracion (el contrato no cambia desde b078e5b)
git status                # sin cambios propios pendientes

# Respaldo de las direcciones v3 (para volver atrás si hace falta)
cp scripts/.contratos ~/contratos-v3.txt

# Herramientas al día (target WASM, CLI de Stellar 28, dependencias de web/)
bash scripts/preparar_entorno.sh

# (Opcional, 2 minutos) Que las pruebas de contratos pasen en tu máquina
cargo test

# Despliegue
bash scripts/desplegar_testnet.sh 2>&1 | tee ~/despliegue-v4.log
```

- Es normal ver "(admin ya existía)". Reusa las cuentas de prueba y el **mismo emisor de TUSD**, así que `TOKEN`
  debe salir igual que siempre: `CDM2YCJVE37HUCNOY5E65NOEKTQVQM2WD6CUVHSL5WZFVISPIUIYHAQ5`.
- Despliega dos bóvedas nuevas (principal y rápida, cada una con 10 000 TUSD para intereses), la tanda, el
  historial y el adaptador de Blend. Al final reparte USDC de prueba a Ana, Beto y Carla. Si una cuenta ya recibió
  USDC antes, el script lo avisa y sigue: es normal.
- **Si el paso 9 (Blend) falla** porque el pool no responde: vuelve a correr todo con
  `SIN_BLEND=1 bash scripts/desplegar_testnet.sh` y avísalo en el tablero. La web esconde USDC si no hay bóveda.

Revisa el resultado:

```bash
cat scripts/.contratos
```

Tienen que estar `TOKEN`, `BOVEDA`, `BOVEDA_RAPIDA`, `TANDA`, `HISTORIAL` y `ADAPTADOR_USDC`, todas `C...`, y
`TANDA` e `HISTORIAL` **distintas** de las v3 (`CADFZ…BYMC` y `CBDXY…N4HK`).

**(Opcional, 5 minutos) Ensayo de punta a punta** con rondas de 1 minuto:

```bash
PERIODO=60 bash scripts/demo.sh 2>&1 | tee ~/demo-v4.log
```

Al final debe mostrar el rendimiento repartido y el puntaje del historial de cada persona.

## Paso 2 · Publicar las direcciones (@DocFranji)

Un comentario en el tablero (issue #4) con el contenido de `scripts/.contratos`. Son direcciones públicas.

- **No pegues** la línea de `FAUCET_ISSUER_SECRET` que imprime el script, ni ninguna llave `S...`.
- Si `TOKEN` salió distinto de `CDM2YCJ…`, dilo: el faucet necesitaría la llave de ese emisor, y esa llave la pones
  tú directamente en Vercel.
- **No cambies nada en Vercel ni en `main` todavía.**

## Paso 3 · Conectar la vista previa (WEB, con revisión del ORQ)

1. En `web/src/config.ts`, cambiar los valores por defecto de `TANDA_ID` (y de `TOKEN_ID` solo si cambió) por los
   del paso 2. `HISTORIAL_ID` se queda vacío: la web le pregunta a la tanda cuál usa.
2. Actualizar las direcciones que aparezcan en docs (`README.md`, `docs/`) si nombran la tanda v3.
3. `bash scripts/verificar.sh web` en verde y PR hacia `integracion`. El ORQ lo ensaya y lo integra.
4. En https://rounda-git-integracion-rounda.vercel.app/#/estado: todo en verde, con la tanda nueva y "La web y el
   contrato coinciden".

## Paso 4 · Probar en la vista previa (equipo)

La guía `PROBAR-V3.md` sigue sirviendo para lo de antes (R1 a R7). Lo nuevo de la v4:

| Prueba | Qué hacer | Qué debe pasar |
| --- | --- | --- |
| **N3 · cerrar antes** | Demo rápida con rondas de **10 minutos**. Los tres pagan enseguida | Aparece "Cerrar la ronda" sin esperar los 10 minutos. Quien cobra recibe ya y la ronda 2 se puede pagar desde ya, con su fecha límite de siempre |
| N3 · no en subasta | Lo mismo en modo **subasta** | No deja cerrar antes ("En la subasta la ronda no se puede cerrar antes…") |
| N3 · falta alguien | Pagan dos de tres | No deja cerrar antes |
| **N2b · deuda después del final** | Garantía 0 %, Ana cobra en la ronda 1 y deja de pagar. Terminen la tanda | Ana ve su deuda en el **Perfil** y la puede pagar con la tanda ya terminada. El dinero le llega a quien cobró de menos |
| **N2a · bloqueo** | Con Ana debiendo (antes de pagar), que intente unirse a otra tanda | "Tienes una deuda pendiente en otra tanda. Págala desde tu Perfil…". Al pagar todo, ya se puede unir |
| **N4 · perfil** | `#/perfil`: poner un apodo (2 a 24 caracteres) | El apodo aparece en las tandas, junto a la dirección corta. Apodos raros (1 letra, emojis, 25 caracteres) se rechazan con mensaje claro |
| N4 · cerrar sesión | Con Freighter y con Google, "Cerrar sesión" | Vuelve a la pantalla de entrar. Al recargar, sigue sin sesión |

Cada problema va en un comentario del tablero, con la plantilla de `PROBAR-V3.md` (cambiando "[Prueba v3]" por
"[Prueba v4]").

## Paso 5 · Salida a producción (@DocFranji, unos 20 minutos)

El ORQ deja abierto un **PR borrador de `integracion` hacia `main`** con esta lista. Se marca como listo cuando los
pasos 3 y 4 estén hechos.

### 5.1 Fusionar

En GitHub: el PR de `integracion` → `main` → **Merge pull request** (sin squash, para no perder la historia). O desde
WSL:

```bash
git fetch origin
git checkout main && git pull
git merge --no-ff -m "Producción v4: cerrar antes, deudas después del final, bloqueo de morosos, perfil y Órbita" origin/integracion
git log --oneline -1     # anota este commit: es el que debe quedar en Production
git push origin main
```

### 5.2 Variables de **Production** en Vercel

Settings → Environment Variables, filtrando por **Production**:

| Variable | Qué hacer |
| --- | --- |
| `VITE_TANDA_ID` | **Quítala** (manda el código, que ya trae la v4) o ponle la `TANDA` nueva. **Si queda con la v3 o la v2, producción no usa la v4** |
| `VITE_HISTORIAL_ID` | **Quítala** (la web le pregunta a la tanda) o ponle el `HISTORIAL` nuevo. Si queda con el historial v3, los apodos y el bloqueo de morosos fallan |
| `VITE_TOKEN_ID` | No cambió. Déjala o quítala, da igual |
| `VITE_TEMA` | Ya no se usa (Órbita es el único diseño). Se puede quitar |
| `VITE_BOVEDA_SIMULADA` | Si está en `false`, quítala |
| `VITE_USDC_ID`, `VITE_FAUCET_BLEND_URL` | Si existen **vacías**, quítalas (vacías esconden USDC) |
| `VITE_NOMBRES`, `VITE_PRIVY_APP_ID`, `FAUCET_ISSUER_SECRET` | Sin cambios. La llave **nunca** sale de Vercel |

### 5.3 Redeploy del commit de la fusión

Si cambiaste variables **después** del despliegue automático del push:

1. Deployments → filtra por **Production**.
2. Abre el despliegue cuyo commit es **el de la fusión** (compara el hash).
3. ⋯ → **Redeploy**, **sin** "Use existing Build Cache".
4. Espera **Ready** y confirma que el commit sea el de la fusión.

### 5.4 Revisar producción

1. https://rounda-phi.vercel.app/#/estado: todo en verde, la tanda que muestra es la **nueva** y dice "La web y el
   contrato coinciden".
2. Recorrido corto: entrar con Freighter y con Google, pedir TUSD, crear una Demo rápida de 3, unirse con dos
   cuentas más, pagar las tres cuotas y **cerrar antes** (N3), poner un apodo en el Perfil (N4), cerrar sesión.
3. Avisar en el tablero con el commit que quedó en Production.

### 5.5 Volver atrás si algo sale mal

- **1 minuto:** Vercel → Deployments → el despliegue anterior de Production → ⋯ → **Instant Rollback**. Vuelve la
  web v3, que apunta a la tanda v3 (`CADFZ…BYMC`, viva hasta ~abril de 2027).
- Si cambiaste variables en el paso 5.2, devuélvelas con `~/contratos-v3.txt`.
- `main` se puede quedar como está mientras se arregla: lo que ve el público es el despliegue de Vercel.

## Paso 6 · Antes del piloto (sábado 10) y del video

```bash
cd ~/Safe-Chain
bash scripts/renovar_boveda_rapida.sh
```

La bóveda rápida rinde menos cuanto más vieja es. El script usa `scripts/.contratos`, que ya apunta a la v4. Las
tandas creadas después usan la bóveda nueva.
