# La campanita de avisos (pedido 3 del plan v5)

Un botón en la barra, con el número de avisos sin leer, y un panel con la lista. En la computadora el panel cuelga de la campanita; en el celular es una hoja que sube desde abajo. Solo web: **no hay servidor nuevo ni avisos al teléfono**. Cada aviso se calcula con lo que se lee de la red, y lo que ya se leyó se guarda en el navegador.

Código: `components/Campanita.tsx` (+ `campanita.css`), `hooks/useNotificaciones.ts`, `lib/notificaciones.ts` (los avisos y lo leído, con pruebas), `lib/lecturaNotificaciones.ts` (qué se lee y cuándo) y `lib/invitaciones.ts`.

## Qué avisa

Hay dos clases. Lo que **te toca hacer ahora** sale del estado de las tandas y dura mientras siga siendo cierto; sale arriba. Lo que **pasó** sale de los eventos de la red, que la red guarda unos 7 días en testnet.

| Aviso | Sale de | Id (para saber si ya se leyó) |
| --- | --- | --- |
| "Te toca pagar $20 en Tanda 5" (+ "Vence el viernes…") | La misma regla que la "siguiente acción" de la página de la tanda (`siguienteAccion`) | `pagar:<tanda>:<turno>` |
| "Vas tarde: paga tu cuota de $20 en Tanda 5" | Idem, con el plazo vencido | `tarde:<tanda>:<turno>` |
| "Te toca cobrar $100 en Tanda 5" ("Tu pozo está listo.") | Idem: es tu turno, ya pagaste y venció el plazo (o todos pagaron) | `cobrar:<tanda>:<turno>` |
| "Debes $100 en Tanda 5" | Idem, si tienes un pago pendiente en esa tanda | `deuda:<tanda>` |
| "Beto, que tiene un pago pendiente, se unió a tu tanda" | Los miembros de tus tandas **abiertas** y el historial público (`tieneMoraPendiente`; pedido 4) | `pendiente:<tanda>:<persona>` |
| "Te invitaron a Tanda 5" | El enlace de invitación que abriste y todavía no usaste (ver abajo) | `invitacion:<tanda>` |
| "Ana te pagó $40 de lo que te debía" | Eventos `abono` y `abono_fin` a tu favor | `abono:<id del evento>` |
| "La tanda empezó" | Evento `iniciada` de tus tandas | `empezo:<tanda>` |
| "La tanda terminó" ("recibiste $94,50 al final") | Eventos `finalizada` y `liquidado` | `termino:<tanda>` |

"Tus tandas" son las que creaste o donde estás. Los textos usan el glosario (`lib/glosario.ts`): pago pendiente, depósito, pozo, turno.

## Cómo se lee (y cuánto cuesta)

- Cada **15 s** mientras la página se ve (la misma cadencia de la lista de tandas), y de inmediato al abrir el panel.
- Solo se revisan las **24 tandas más recientes** (y las de las invitaciones). De cada una se recuerda si es de la persona: lo que ya no cambia (terminada, cancelada, o en curso y ajena, porque a una tanda en curso nadie más se puede unir) **no se vuelve a leer**. Las demás tandas abiertas se releen cada minuto.
- De cada tanda viva de la persona: 3 consultas por vuelta (la tanda, sus miembros y el turno en curso), más su modo de turnos, que se lee una sola vez. Los eventos son los de `leerEventos` (los mismos de la página de la tanda: por tramos y solo lo nuevo; si dos lugares piden la misma tanda, comparten la lectura). Las tandas abiertas no leen eventos; las terminadas hace más de 7 días, tampoco.
- Si una lectura falla, se sigue con lo último que se sabía. La campanita nunca muestra un error ni escribe en la consola.
- No se muestra en la demo (`#/demo`, que se proyecta) ni sin sesión.

## Qué se guarda en el navegador

- `rounda:notificaciones:<cuenta>`: `{ base, ids }`. `base` es el momento (segundos Unix) en que esa cuenta usó la campanita por primera vez en ese navegador: **lo que pasó antes cuenta como leído**, para que al entrar desde otro teléfono no aparezca una montaña de avisos viejos. Lo que te toca hacer ahora nunca se da por leído así. `ids` son los avisos ya leídos (los últimos 300).
- `rounda:invitaciones`: `[{ id, desde }]`. Si **lo primero que abre la persona es la página de una tanda** (el enlace que le mandaron), se anota. El aviso solo sale mientras la tanda siga abierta, con lugares libres y sin que la persona esté en ella. Va por navegador, no por cuenta: quien abre el enlace puede no haber entrado todavía.
- Al **cerrar** el panel, todo lo que se vio queda leído. El botón "Marcar todo como leído" lo hace sin cerrar.
- Sin almacenamiento (ventana privada), todo funciona y lo leído dura lo que dure la página.

## Probarlo a mano

1. Con la cuenta de Carla en el mock del e2e: `cd web/e2e && node snap.mjs "#/tandas" campanita 1280 GDPIB76VVYNDJINI6BRYGVOKTPOTERZABL43OB7DIOCLTXSKEUMJWNUN` (hace falta `npm run preview` en `web/`). Verás el número 1: la primera vez, la historia vieja cuenta como leída.
2. Para ver los avisos de "lo que pasó" en una cuenta que ya los tiene como leídos, en la consola del navegador: `localStorage.setItem('rounda:notificaciones:<tu G...>', JSON.stringify({ base: 0, ids: [] }))` y recargar.
3. Para repetir "Te invitaron": `localStorage.removeItem('rounda:invitaciones')`, abrir el enlace de una tanda abierta (sin unirte) y pasar a otra página.

## Límites conocidos

- No hay avisos mientras la pestaña está cerrada: la campanita se actualiza cuando se abre Rounda.
- "La tanda empezó" y "te pagaron" dependen de que la red todavía guarde esos eventos (unos 7 días en testnet).
- Mientras no haya nombres de tanda (pedido 5, contrato v5) las tandas salen como "Tanda 5". La función `tanda(id)` del contexto de `lib/notificaciones.ts` es el único lugar que hay que cambiar para mostrar el nombre.
- Los avisos de amigos ("Tu amigo Beto creó una tanda") llegan con el pedido 6.
