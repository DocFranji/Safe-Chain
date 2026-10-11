# Nombre de la tanda al crear (pedido 5 del plan v5)

Un campo opcional, "Nombre de la tanda (opcional)", en **Crear una tanda**. Solo aparece si el contrato desplegado guarda nombres; con el contrato v4 no se ve nada.

Código: `lib/nombreTanda.ts` (reglas, con pruebas), `lib/contratoNombres.ts` (detección y cliente para firmar), `hooks/useSoportaNombres.ts` y `pages/CrearTanda.tsx`.

## Cómo sabe la web si hay nombres

Lee la interfaz (el spec) del contrato **desplegado** en la red, no la del cliente que trae la web (`contract.Client.from`, una sola vez por visita). Hay nombres si tiene las tres funciones que publicó M1: `get_nombre`, `crear_tanda_con_nombre` y `crear_tanda_avanzada_con_nombre`. Si no se puede leer, se asume que no: el campo queda escondido.

Como el cliente generado (`web/packages/tanda`) todavía puede no traer esas funciones, para firmar con nombre se arma un cliente con el spec desplegado (mismas opciones que `clienteFirma`, incluida la restauración de datos). Cuando M1 regenere el cliente no hace falta cambiar nada.

## Qué llama

| Situación | Función |
| --- | --- |
| Sin nombre (campo vacío o contrato v4) | `crear_tanda` / `crear_tanda_avanzada`, como siempre |
| Con nombre, orden de llegada sin intercambios | `crear_tanda_con_nombre(…, nombre)` |
| Con nombre y turnos elegidos | `crear_tanda_avanzada_con_nombre(…, opciones, nombre)` |

Sigue siendo **una sola firma** para quien crea. El resultado puede venir como número o como `Result` (`idDeCreacion`).

## Reglas (las mismas del contrato, `NombreInvalido = 70`)

2 a 40 caracteres (no bytes); letras A–Z con tildes y el resto de Latin‑1 (sin × ni ÷), números, espacio y `. , - _ ! ? ¿ ¡`. Antes de enviar se normaliza a NFC y se quitan espacios al inicio, al final y dobles. La pantalla dice qué carácter no sirve y cuántos lleva, y no deja crear mientras haya un problema. Vacío es válido. Dice que el nombre es público y no se puede cambiar.

## Límites

- Mostrar el nombre en la página de la tanda y en la lista es de WEB (`leerNombre`). La campanita sigue diciendo "Tanda 5": cuando se quiera mostrar el nombre, el único lugar es `tanda(id)` del contexto de `lib/notificaciones.ts`.
- Con el contrato real y el cliente aún sin regenerar, el flujo se probó contra un RPC simulado (la interfaz con nombres se agrega al spec del mock con `est.conNombres`); falta probarlo con el contrato v5 desplegado.
