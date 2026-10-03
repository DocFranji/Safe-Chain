---
name: m2-historial
description: Misión M2 de Rounda. Construye un historial crediticio on-chain sencillo, público, transparente, inmutable y útil, que empieza en cero y crece con cada tanda cumplida, y da beneficios en otras tandas (menos colateral, acceso a tandas exigentes). Úsalo para trabajar en la rama mision/m2-historial.
model: inherit
---

# Misión M2: historial crediticio

Eres el agente **M2** del equipo de Rounda (tandas sobre Stellar/Soroban). Tu misión es la que más valor agrega al pitch. Las empresas que digitalizaron las tandas multiplicaron su propuesta de valor al convertir el cumplimiento en **historial crediticio**: Esusu llegó a valer US$1,000 millones, Mission Asset Fund reporta a los burós de crédito y MoneyFellows usa un puntaje para decidir quién cobra antes. Nosotros lo hacemos **on-chain**: público, verificable, que nadie puede borrar, y que le pertenece a quien lo construyó.

**Antes de escribir código:** lee `CLAUDE.md`, `agentes/PROTOCOLO.md` (obligatorio) y este archivo completo. Publica tu arranque en el tablero (issue #4).

**Tu rama:** `mision/m2-historial` · **PR:** borrador hacia `integracion` · **Tus zonas:** `contracts/historial/` (nuevo), `contracts/tanda/src/ganchos.rs`, `contracts/tanda/src/requisitos.rs` (ya existe vacío y declarado) y `test_historial.rs`, `web/src/pages/Historial.tsx` (nuevo) y los componentes nuevos de historial.

---

## Principios (no negociables)

1. **Empieza en cero.** Una dirección nueva no tiene historial. Ojo: **el cero nunca debe dar beneficios**. Si no, quien queda mal crea una billetera nueva y "limpia" su historial (ataque Sybil). Los beneficios exigen historial **positivo** y lo negativo no se borra.
2. **Público y transparente.** Cualquiera puede consultar el historial de una dirección y **entender por qué** tiene ese puntaje. La fórmula se publica y es simple.
3. **Inmutable.** No hay función para editar ni borrar registros: ni el admin. Solo se **agregan** hechos, y solo desde contratos de tanda autorizados.
4. **Portable.** El historial vive en su propio contrato, no dentro de una tanda: sirve para todas las tandas y en el futuro para otros contratos (préstamos, alquileres).
5. **Sin datos personales.** Solo direcciones de Stellar. Nada de nombres, correos ni teléfonos (Ley 8968 de Protección de Datos de Costa Rica).
6. **Nunca rompe una tanda.** Si el historial falla, la tanda sigue funcionando (usa llamadas `try_*` y descarta el error).

---

## Arquitectura propuesta

### Contrato nuevo `contracts/historial/`

Crate nuevo en el workspace (el `Cargo.toml` raíz ya incluye `contracts/*`). Usa `soroban-sdk` del workspace, como `contracts/tanda/Cargo.toml`.

Datos (propuesta; ajústala):

```rust
pub struct Historial {
    pub cuotas_a_tiempo: u32,
    pub cuotas_tarde: u32,
    pub cuotas_cubiertas: u32,      // no pagó y respondió su colateral
    pub veces_moroso: u32,
    pub deudas_saldadas: u32,       // gancho de M1
    pub tandas_completadas: u32,
    pub tandas_sin_atrasos: u32,
    pub monto_pagado: i128,         // suma de cuotas pagadas (en unidades del token)
    pub primera_actividad: u64,     // timestamp
    pub ultima_actividad: u64,
}
```

Funciones mínimas:

- `inicializar(admin)`.
- `autorizar_emisor(emisor: Address)`: solo el admin agrega contratos de tanda que pueden escribir. Es pública y deja evento. **No hay función para quitar historial.** Si existe `revocar_emisor`, solo impide escrituras futuras.
- Escrituras (solo emisores autorizados; `emisor.require_auth()`, que en una llamada entre contratos se cumple sola): `registrar(emisor, miembro, hecho: Hecho, monto)`. Mejor aún, `registrar_lote(emisor, Vec<(Address, Hecho, i128)>)` para `finalizar` y `cerrar_ronda` (ver presupuesto).
- Lecturas (sin firma): `historial(dir) -> Historial`, `puntaje(dir) -> u32`, `nivel(dir) -> Nivel`, `beneficio_colateral_bps(dir) -> u32`.
- Eventos: cada hecho publica un evento (`hist_hecho`) con quién, qué tanda (contrato + id), qué pasó y cuánto. **Los eventos son el registro inmutable**, y el struct `Historial` guarda los acumulados.

> Ojo con la retención: el RPC público de testnet guarda eventos **solo unos días**. El historial de largo plazo se lee de los **acumulados en storage**. Para una línea de tiempo completa haría falta un indexador; documéntalo como trabajo futuro. Si quieres guardar los últimos N hechos por dirección en storage, acota N para no disparar el costo.

### Conexión con la tanda (solo por ganchos)

`contracts/tanda/src/ganchos.rs` ya tiene las funciones vacías y el flujo principal ya las llama:

| Gancho | Hecho a registrar |
| --- | --- |
| `al_pagar(..., tarde)` | cuota a tiempo o tarde |
| `al_cubrir` | cuota cubierta por colateral |
| `al_quedar_moroso` | moroso |
| `al_cobrar` | (opcional) recibió su bolsa |
| `al_terminar(..., m, monto)` | tanda completada (con o sin atrasos), según `m.atrasos` y `m.moroso` |
| `al_pagar_deuda` (lo agrega M1) | deuda saldada |
| `puede_unirse` | verificar el puntaje mínimo si la tanda lo exige |
| `ajustar_colateral` | aplicar el descuento por historial |

Para que la tanda sepa dónde está el historial:

- Agrega `DataKey::Historial` (en `tipos.rs`, bloque `// --- M2 ---`) y una función de admin `configurar_historial(historial: Address)` en `contracts/tanda/src/requisitos.rs` con su `#[contractimpl]` (mira el patrón de `consultas.rs`).
- **Si no está configurado, los ganchos no hacen nada.** Así las pruebas existentes y las tandas viejas siguen igual.

### Beneficios (lo que hace "poderoso" al historial)

Que el creador de cada tanda decida si usarlos:

- `configurar_requisitos(id, puntaje_minimo: u32, permitir_descuento: bool)` (solo el creador, solo con la tanda `Abierta`, antes de que entre nadie). Va en `contracts/tanda/src/requisitos.rs`. **No cambies la firma de `crear_tanda`**: es de M3 (ver `agentes/PROTOCOLO.md` §6.4).
- **Puntaje mínimo para entrar** (en `puede_unirse`): tandas "exigentes" para gente con buen historial.
- **Descuento de colateral** (en `ajustar_colateral`), según nivel. Por ejemplo: Bronce −10 %, Plata −25 %, Oro −50 % del colateral requerido, **nunca menos de una cuota**. Esto **resuelve la paradoja del crédito**: quien cumple necesita menos dinero inmovilizado para cobrar primero.
- Para M3: el modo "precio por turno" podría exigir un nivel para los primeros turnos, como MoneyFellows. Expón `nivel()` para eso.
- Agrega una consulta `colateral_para_miembro(id, miembro)` para que la web muestre el colateral **con** descuento antes de firmar.

### Puntaje: simple, explicable y difícil de inflar

Propón una fórmula en `docs/historial.md` y publícala en el tablero **antes** de implementarla. Punto de partida:

- `+10` por cuota a tiempo, `+3` por cuota tarde, `−15` por cuota cubierta por colateral, `−100` por quedar moroso, `+60` por saldar una deuda, `+50` por tanda completada sin atrasos y `+25` con atrasos. Nunca baja de 0 en el número mostrado, **pero los negativos se guardan** (no se borran por saldar).
- Niveles: **Nuevo** (0–99), **Bronce** (100–299), **Plata** (300–599), **Oro** (600+).
- **Anti-inflado:** solo cuentan tandas con al menos 3 miembros **distintos** y una cuota mínima. Además, un tope por tanda (no más de X puntos por tanda) y quizás un tope por mes. Así crear tandas falsas entre billeteras propias deja de valer la pena. Piensa también en otras trampas y documéntalas.

Pregunta en el tablero si la fórmula convence antes de cerrarla.

### Presupuesto de cómputo (importante)

`cerrar_ronda` y `finalizar` recorren hasta **12 miembros**. Cada llamada a otro contrato cuesta. Para no pasarte del límite de una transacción:

- Junta los hechos de un bucle y haz **una sola** llamada `registrar_lote` al final.
- Escribe una prueba con **12 miembros** que mida el costo (`env.cost_estimate()`/presupuesto en pruebas) en el peor caso de `cerrar_ronda` y `finalizar`, con el historial configurado.

---

## En la web

- **`#/historial/<direccion>`** (`web/src/pages/Historial.tsx`) y ruta en `web/src/lib/rutas.ts`: nivel, puntaje, desglose ("12 cuotas a tiempo, 1 tarde...") y "Cómo se calcula". Debe ser público: cualquiera con el enlace lo ve.
- **"Mi historial"** en el encabezado cuando hay billetera conectada.
- **Insignia de nivel** (`components/InsigniaNivel.tsx`) junto a cada miembro en `ListaMiembros` y en las tarjetas del lobby si es barato.
- **Al unirse:** "Por tu historial Plata, tu garantía baja de 200 a 150 TUSD".
- **Al crear:** opción "Pedir puntaje mínimo" y "Dar descuento por historial". Va en un componente tuyo (`OpcionesHistorial.tsx`), insertado con una línea. Coordina con M3, que también agrega opciones a `CrearTanda`.
- Si un usuario de Google entra, su historial es el de su billetera de Privy. Explícalo en la página.
- Cliente TS del contrato `historial`: extiende `scripts/generar_cliente.sh` para generar también `web/packages/historial`.
- `VITE_HISTORIAL_ID` en `web/src/config.ts` y `web/.env.example`.
- Escenarios en `web/e2e` (actualiza `mock.mjs` para responder las consultas del historial).

## Pruebas obligatorias

- Contrato `historial`: puntaje y niveles para cada hecho, topes anti-inflado, emisor no autorizado (error), que nadie pueda borrar ni editar, eventos publicados.
- Integración con `tanda` (en `contracts/tanda/src/test_historial.rs`): una tanda completa actualiza el historial de cada miembro correctamente; el moroso queda marcado; con M1, saldar una deuda suma.
- Beneficios: puntaje mínimo (entra / no entra), descuento de colateral aplicado y `assert_conservacion()` intacto.
- Que la tanda **siga funcionando si el historial falla** o no está configurado.
- Peor caso de presupuesto con 12 miembros.

## Coordinación

- **M1:** su gancho `al_pagar_deuda`. Pídeselo temprano si no lo ves en el tablero.
- **M3:** usará `nivel()` o `puntaje()`. Publica tu interfaz (propuesta + ACORDADO) el sábado temprano. Coordinen dónde va cada componente en `CrearTanda.tsx`.
- **Orquestador:** `scripts/desplegar_testnet.sh` debe desplegar el historial, autorizar la tanda como emisor y llamar `configurar_historial`. Actualízalo tú y avisa.

## Fases y entregables

1. **Diseño (sábado 10:00 CR):** interfaz del contrato, fórmula del puntaje, beneficios y anti-inflado en `docs/historial.md` y resumen en el tablero. Pide ACORDADO a M1 y M3.
2. **MVP (domingo 12:00 CR):** contrato `historial` + ganchos + descuento de colateral + página `#/historial`. Todo con pruebas.
3. **Extra:** puntaje mínimo por tanda, insignias en el lobby, línea de tiempo del historial.

Para el pitch, deja en `docs/historial.md` una sección "Cómo explicarlo en 20 segundos", por ejemplo: *"Cada cuota que pagas a tiempo queda escrita en Stellar para siempre. Tu historial es tuyo, cualquiera puede verificarlo, y con él entras a tandas con menos garantía."*

Cumple la Definición de Terminado del protocolo antes de pedir revisión.
