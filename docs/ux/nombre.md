# Nombre de la tanda al crear (pedido 5 del plan v5)

Un campo opcional, "Nombre de la tanda (opcional)", en **Crear una tanda**. Solo aparece si el contrato desplegado guarda nombres; con el contrato v4 no se ve nada.

Código: `lib/nombreTanda.ts` (las reglas, de M1), `lib/nombreCrear.ts` (limpiar lo escrito y leer el resultado), `lib/contratoNombres.ts` (detección), `hooks/useSoportaNombres.ts` y `pages/CrearTanda.tsx`.

## Cómo sabe la web si hay nombres

El cliente que trae la web ya conoce las funciones de nombre, pero el contrato **desplegado** puede ser el anterior (v4). Por eso la web lee la interfaz (el spec) del contrato en la red (`contract.Client.from`, una vez por visita) y busca las tres funciones que publicó M1: `get_nombre`, `crear_tanda_con_nombre` y `crear_tanda_avanzada_con_nombre`. Si no se puede leer, se asume que no: el campo queda escondido. Las llamadas usan el cliente de siempre (`clienteFirma`).

## Qué llama

| Situación | Función |
| --- | --- |
| Sin nombre (campo vacío o contrato v4) | `crear_tanda` / `crear_tanda_avanzada`, como siempre |
| Con nombre, orden de llegada sin intercambios | `crear_tanda_con_nombre(…, nombre)` |
| Con nombre y turnos elegidos | `crear_tanda_avanzada_con_nombre(…, opciones, nombre)` |

Sigue siendo **una sola firma** para quien crea. El resultado puede venir como número o como `Result` (`idDeCreacion`).

## Reglas (las mismas del contrato, `NombreInvalido = 70`)

2 a 40 caracteres (no bytes); letras A–Z con tildes y el resto de Latin‑1 (sin × ni ÷), números, espacio y `. , - _ ! ? ¿ ¡`. Antes de enviar se normaliza a NFC y se quitan espacios al inicio, al final y dobles (`limpiarNombre`); la validación es `errorNombre` de `nombreTanda.ts`. La pantalla dice qué no sirve y cuántos caracteres lleva, y no deja crear mientras haya un problema. Vacío es válido. Dice que el nombre es público y no se puede cambiar.

## Límites

- Mostrar el nombre en la página de la tanda y en la lista es de WEB (`leerNombre`). La campanita sigue diciendo "Tanda 5": cuando se quiera mostrar el nombre, el único lugar es `tanda(id)` del contexto de `lib/notificaciones.ts`.
- El flujo se probó contra un RPC simulado (`est.conNombres` en el mock le deja al contrato "desplegado" las funciones de nombre); falta probarlo con el contrato v5 real desplegado.
