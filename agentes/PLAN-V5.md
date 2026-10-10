# Plan v5: seis pedidos nuevos antes del congelamiento

Escrito por el ORQ el sábado 10 de octubre de 2026. **Congelamiento: domingo 11 a las 12:00 CR.** Entrega: lunes 12 a
las 16:00 CR. Todo es testnet.

## Decisiones (tomadas el 10 de octubre)

| # | Pedido | Decisión |
| --- | --- | --- |
| 1 | Encontrar el sitio en buscadores | `robots.txt`, `sitemap.xml`, metadatos y una guía de lo demás (`docs/seo.md`). Solo web |
| 2 | Depósito del que se va sin pagar | **Proporcional al final.** La garantía de quien deja de pagar ya no cubre cuotas completas en orden. Se aparta y, al finalizar, se reparte entre los afectados según cuánto le faltó a cada uno. Contrato v5 |
| 3 | Centro de notificaciones | Campanita en la barra con una lista de avisos que salen de la red (deudas que te pagaron, te toca pagar, te toca cobrar, la tanda empezó, invitaciones…). Lo leído se guarda en el navegador. Solo web |
| 4 | Morosos en tandas donde ya estaban | **Avisar fuerte** a los demás miembros antes de que empiece la tanda (y mientras dura). El contrato no cambia |
| 5 | Buscar y filtrar tandas, y ponerles nombre | Búsqueda y filtros en la lista (persona, tipo, cuota, duración, reputación, nombre). **El nombre se guarda en el contrato v5** (público, de 2 a 40 caracteres) |
| 6 | Amigos | **Guardados en el navegador** (privados, sin desplegar nada). Pestaña "Amigos" para invitarlos rápido |

**Contrato v5, "intentar con límite":** M1 lo programa ya. Entra solo si su PR está listo el **domingo a las
06:00** y @DocFranji lo despliega **antes de las 09:00**. Si no, queda en su rama para después de la entrega y la
demo sigue con la v4. Lo que es solo web no depende de la v5.

## Quién hace qué

| Agente | Pedidos | Rama | Cuenta |
| --- | --- | --- | --- |
| **M1** (`m1-tiempos-deudas`) | 2 y el nombre en el contrato (5) | `mision/m1-tiempos-deudas` | DocFranji |
| **UX** | 3, 4, 6 y el campo de nombre al crear (5) | `mision/ux` | DocFranji |
| **WEB** (`web-preview`) | 1, búsqueda y filtros (5), y la marca "hay pagos pendientes" en la lista (4) | `mision/web-preview` | Paul |
| **ORQ** | Integrar el PR #32, revisar, ensayar con `verificar.sh`, coordinar el despliegue v5 | `mision/orquestador` | Paul |

Máximo 2 agentes activos por cuenta: DocFranji tiene M1 y UX; Paul tiene ORQ y WEB. M2, M3 y M4 no tienen trabajo nuevo.

### Zonas de la web (para no chocar)

| Archivo o pantalla | Dueño |
| --- | --- |
| `web/public/` (robots, sitemap, imagen para redes), `web/index.html`, `vercel.json`, `docs/seo.md` | WEB |
| Lista de tandas (`pages/Lobby.tsx`) y su lógica de filtros (`lib/filtros.ts`, nuevo) | WEB |
| Barra: la campanita y su panel (`components/Campanita.tsx`, `lib/notificaciones.ts`, nuevos) | UX |
| Página de la tanda (`pages/PaginaTanda.tsx`) y unirse: aviso de pagos pendientes | UX |
| Perfil y amigos (`pages/Perfil.tsx`, `lib/amigos.ts`, nuevo) | UX |
| Crear (`pages/CrearTanda.tsx`): campo de nombre | UX |
| `web/src/config.ts`, `web/e2e/mock.mjs` (direcciones de los contratos) | WEB, solo cuando haya v5 |
| Textos: usar `lib/glosario.ts` y `dinero()` | Todos |

Si alguien necesita tocar un archivo de otro dueño, avisa primero en el tablero.

## M1 · Pedido 2: el depósito se reparte entre los afectados

**Hoy:** cuando alguien deja de pagar, su garantía cubre cuotas **completas, en orden** (`lib.rs::cerrar_ronda`,
"Regla 1"). Si la garantía es menor al 100 %, quien cobra justo después recibe todo y los siguientes nada.

**Lo que se pide (decisión del equipo):** proporcional al final.
- Mientras la tanda sigue, la garantía del que no pagó **no se usa** para cubrir: cada falta queda como deuda
  (`Faltante` a favor de quien cobró de menos), igual que hoy cuando la garantía no alcanza.
- Al **finalizar**, lo que quede de su garantía se reparte entre sus acreedores en proporción a lo que le falta a
  cada uno (y se descuenta de su deuda). Los centavos que sobren del redondeo van al último acreedor o al fondo de
  quienes cumplieron. Decide M1 y lo documenta.
- **Caso a decidir por M1 (y explicarlo en `docs/tiempos-y-deudas.md`):** quien se atrasa una sola vez pero sí
  tiene garantía suficiente para todo lo que le falta pagar (garantía ≥ cuotas que le quedan). Recomendación: en ese
  caso se mantiene la cobertura inmediata de hoy, porque nadie sale perjudicado y quien cobra no tiene que esperar.
  La regla proporcional aplica cuando la garantía **no alcanza** para todo lo que falta.
- Si el moroso paga su deuda antes del final (`pagar_deuda`), su garantía vuelve a ser suya como hoy.

**Obligatorio:**
- `assert_conservacion()` en todas las pruebas nuevas: el ejemplo del pedido (garantía de 50 %, cobra en el turno 1
  y no paga nunca), dos morosos con acreedores en común, moroso que paga a medias y el peor caso de 12.
- `PEOR_CASO_WASM=1 cargo test -p tanda peor_caso -- --nocapture --test-threads=1` dentro de los límites de mainnet
  (100 M de instrucciones, 100 lecturas, **50 escrituras** y 16 384 bytes de eventos) en `finalizar` con 11 morosos.
- `INVARIANTES_SEMILLAS=400 cargo test -p tanda --release invariantes_al_azar` en verde.
- Evento nuevo para la web, por ejemplo `garantia_repartida (deudor, acreedor, monto)`, y su mensaje en
  `web/src/lib/historia.ts` ("Carla recibió $30 de la garantía de Ana").

## M1 · Pedido 5: nombre de la tanda en el contrato

- De 2 a 40 caracteres (letras, números, espacios y `.,-_!?¿¡`, con tildes). Error nuevo **`NombreInvalido = 70`**
  (rango de M1 para la v5: 70–74), con su mensaje en `web/src/lib/contrato.ts`.
- **Una sola firma para quien crea.** El nombre va al crear (`crear_tanda` y `crear_tanda_avanzada`, o en
  `OpcionesTanda`), no en una llamada aparte.
- Se puede leer de forma barata desde la lista: recomendado guardarlo en una clave propia (`Nombre(id)`) con
  `get_nombre(id)` y, además, incluirlo en el evento `creada`.
- Las tandas sin nombre se muestran como hoy ("Tanda 5").
- **Publica la interfaz en el tablero hoy antes de las 18:00 CR** (firma y cómo leer el nombre), para que UX y WEB
  la usen sin esperar al despliegue. Regenera el cliente con `bash scripts/generar_cliente.sh`.

## UX · Pedido 3: centro de notificaciones (campanita)

- Botón de campanita en la barra, con un número cuando hay avisos sin leer. Al tocarla, un panel pequeño con la lista
  (en el celular, a pantalla completa o como hoja desde abajo).
- Avisos (todos salen de la red, sin servidor nuevo):
  - "Ana te pagó $40 de lo que te debía" (abonos de deudas a tu favor);
  - "Te toca pagar $20 en *Tanda de la oficina* (vence el viernes)";
  - "Te toca cobrar $100" / "Tu pozo está listo";
  - "La tanda empezó" / "La tanda terminó: mira cuánto recibiste";
  - "Beto, que tiene un pago pendiente, se unió a tu tanda" (pedido 4);
  - **invitaciones:** "Tu amigo Beto creó una tanda" (con los amigos del pedido 6) y "Te invitaron a *Tanda X*"
    cuando la persona abre un enlace de invitación sin unirse todavía (se guarda en el navegador).
- Lo leído se guarda en el navegador (`rounda:notificaciones:<cuenta>`). Sin notificaciones push.
- Reusa la lectura de eventos que ya existe (`lib/rpc.ts`, `leerEventos`), sin multiplicar consultas: solo las tandas
  donde la persona participa y con el mismo intervalo de lectura de hoy.

## UX · Pedido 4: aviso fuerte de pagos pendientes

- En la página de la tanda **mientras está abierta (antes de empezar)**: si algún miembro ya unido tiene un pago
  pendiente en otra tanda (`tiene_mora` del historial), un aviso rojo arriba, que no se puede pasar por alto:
  "Beto tiene un pago pendiente en otra tanda. Si la tanda empieza y no paga, su depósito podría no alcanzar."
- Al **unirse**, si ya hay alguien así en la tanda, se pide confirmar ("Unirme igual").
- Mientras la tanda sigue: una marca junto a la persona en la lista de miembros.
- Más el aviso de la campanita del pedido 3.

## UX · Pedido 6: amigos

- Guardados en el navegador (`rounda:amigos:<cuenta>`), con apodo y dirección.
- Agregar desde la lista de miembros de una tanda, desde el perfil público de alguien o pegando una dirección `G...`.
- Pestaña **"Amigos"** en el Perfil: lista con apodo y reputación, botón "Invitar a una tanda" (elige una de tus
  tandas abiertas y comparte el enlace por WhatsApp o copiándolo) y "Quitar".
- Se avisa en la pantalla que los amigos se guardan solo en ese teléfono o computadora.

## UX · Pedido 5: campo de nombre al crear

- Campo "Nombre de la tanda (opcional)" en Crear, con el límite de 2 a 40 caracteres.
- Solo aparece si el contrato desplegado tiene nombres (que la web lo detecte por la interfaz o por el cliente). Con la
  v4 no se muestra.

## WEB · Pedido 1: encontrar el sitio en buscadores

- `web/public/robots.txt`: permite todo en producción y apunta al sitemap
  (`Sitemap: https://rounda-phi.vercel.app/sitemap.xml`).
- **Las vistas previas de Vercel no deben indexarse:** `robots.txt` con `Disallow: /` o encabezado
  `X-Robots-Tag: noindex` cuando `VERCEL_ENV` no es `production` (por ejemplo, generando el archivo al compilar).
- `web/public/sitemap.xml` con la portada (las rutas `#/…` no las indexan los buscadores).
- `index.html`:
  - `lang="es"`, título y descripción con las palabras que la gente busca ("tanda", "ahorro", "Costa Rica",
    "Stellar");
  - `link rel="canonical"`;
  - Open Graph y Twitter con una imagen de 1200×630 en `web/public/`;
  - JSON-LD (`WebApplication`).
- `docs/seo.md`: los pasos que dependen de una persona (dar de alta el sitio en Google Search Console y Bing
  Webmaster, enviar el sitemap, dominio propio, enlaces desde el README, la página del hackatón y redes) y
  recomendaciones para después (rutas sin `#` o una portada prerenderizada, una página de preguntas frecuentes,
  rendimiento).

## WEB · Pedido 5: buscar y filtrar tandas

- En la lista de tandas, una barra de búsqueda por texto: nombre (con v5), número, apodo o dirección del creador o de
  un miembro.
- Filtros:
  - **tipo** (orden fijo, precio por turno, subasta, sorteo, elegir turno);
  - **cuota** (rango);
  - **duración** (días, semanas, meses);
  - **reputación del creador** (nivel mínimo);
  - **estado** (abiertas, en curso, terminadas; las canceladas ocultas por defecto);
  - **"sin personas con pagos pendientes"** (pedido 4).
- Los filtros se ven en la URL (`#/tandas?cuota=…`) para poder compartirlos, y se recuerdan en el navegador.
- Lógica pura con pruebas (`lib/filtros.ts`) y pruebas de navegador.
- El nombre se muestra en la tarjeta de cada tanda si el contrato lo tiene. Con la v4, "Tanda N" como hoy.

## Calendario (hora de Costa Rica)

| Cuándo | Qué | Quién |
| --- | --- | --- |
| Sáb 10, ya | Integrar el PR #32 en `integracion` (ensayo y `verificar.sh` completo) | ORQ |
| Sáb 10, 18:00 | Interfaz del nombre publicada en el tablero | M1 |
| Dom 11, 06:00 | PR de M1 (pedidos 2 y nombre) listo, en verde | M1 |
| Dom 11, 07:00 | ORQ lo ensaya e integra | ORQ |
| Dom 11, 09:00 | **Límite del despliegue v5** (`DESPLEGAR-V4.md`, paso 1; las mismas instrucciones sirven) | @DocFranji |
| Dom 11, 10:00 | PRs de UX y WEB listos; WEB cambia la tanda en `config.ts` y `mock.mjs` si hubo v5 | UX, WEB |
| Dom 11, 11:30 | Todo integrado y vista previa revisada por una persona | ORQ, equipo |
| Dom 11, 12:00 | **Congelamiento** | — |
| Dom 11, tarde | Salida a producción (`integracion` → `main`) y variables de Production si hubo v5 | @DocFranji |

**Si la v5 no llega a las 09:00:** el PR de M1 no se integra (o se revierte con `git revert -m 1`, sin force-push), la
web queda con la v4 y lo demás sale igual. El nombre en Crear y en la lista se queda oculto, porque se detecta.

## Riesgos

- **El pedido 2 mueve dinero en `cerrar_ronda` y `finalizar`.** Las pruebas de conservación, las invariantes al
  azar y el peor caso de 12 son obligatorias. Si `finalizar` pasa de 50 escrituras con 11 morosos, se deja para
  después.
- **Una v5 empieza vacía** (las tandas de la v4 no se ven) y con el historial en cero si se despliega uno nuevo. Para
  la demo está bien; avisar al equipo.
- **El congelamiento llega mañana a las 12:00.** Lo que no esté integrado antes no entra: nada de PRs grandes a
  última hora.
