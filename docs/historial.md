# M2 · Historial crediticio on-chain

> Estado: **contratos implementados** (dom 4 oct 2026): `contracts/historial/` y la conexión en `tanda` (ganchos + `requisitos.rs`), con pruebas. Decisiones §7 aprobadas por @DocFranji (como se recomendó). Web, cliente TS y scripts de despliegue también listos (ver §6 y §9).

## Cómo explicarlo en 20 segundos

*"Cada cuota que pagas a tiempo queda escrita en Stellar para siempre. Tu historial es tuyo, cualquiera puede verificarlo y nadie lo puede borrar. Con él entras a tandas exigentes y dejas menos garantía."*

## Principios

1. **Empieza en cero y el cero no da beneficios.** Una billetera nueva no tiene nada que perder ni nada que ganar: los beneficios piden historial **positivo**.
2. **Lo negativo no se borra.** Saldar una deuda suma puntos, pero el registro de que hubo mora queda.
3. **Público y explicable.** Cualquiera consulta una dirección y ve el desglose y la fórmula.
4. **Inmutable.** No existe ninguna función para editar ni borrar. Ni el admin. Solo se **agregan** hechos, y solo desde contratos de tanda autorizados.
5. **Portable.** Vive en su propio contrato (`contracts/historial/`), sirve para todas las tandas y en el futuro para otros contratos.
6. **Sin datos personales.** Solo direcciones de Stellar (Ley 8968).
7. **Nunca rompe una tanda.** Toda escritura desde la tanda usa `try_*` y descarta el error. Si el historial no está configurado, los ganchos no hacen nada.

---

## 1. Contrato `historial`

### Tipos

```rust
#[contracttype]
pub enum Hecho {
    CuotaATiempo,            // +10
    CuotaTarde,              // +3
    CuotaCubierta,           // −15  (no pagó; respondió su colateral)
    Moroso,                  // −100 (su colateral no alcanzó)
    DeudaSaldada,            // +60  (gancho de M1)
    TandaCumplida,           // +50  (terminó sin atrasos ni mora)
    TandaConAtrasos,         // +25  (terminó, con atrasos, sin mora)
    Cobro,                   // 0    (recibió su bolsa; solo informativo)
}

#[contracttype]
pub struct HechoMiembro { pub miembro: Address, pub hecho: Hecho, pub monto: i128 }

#[contracttype]
pub struct Historial {
    pub cuotas_a_tiempo: u32,
    pub cuotas_tarde: u32,
    pub cuotas_cubiertas: u32,
    pub veces_moroso: u32,
    pub deudas_saldadas: u32,
    pub tandas_cumplidas: u32,      // sin atrasos
    pub tandas_con_atrasos: u32,
    pub cobros: u32,                // bolsas recibidas (0 puntos)
    pub monto_pagado: i128,         // suma de cuotas pagadas por el propio miembro
    pub puntos_positivos: u32,      // ya con topes aplicados
    pub puntos_negativos: u32,      // nunca bajan
    pub primera_actividad: u64,
    pub ultima_actividad: u64,
}

#[contracttype]
pub enum Nivel { Nuevo, Bronce, Plata, Oro }

#[contracttype]
pub struct Reglas {                 // parámetros anti-inflado (ver §3)
    pub cuota_minima: i128,         // por defecto 10 TUSD = 100_000_000
    pub tope_por_tanda: u32,        // por defecto 150 puntos positivos por tanda
}
```

### Funciones

| Función | Quién | Qué hace |
| --- | --- | --- |
| `inicializar(admin)` | admin (una vez) | Guarda el admin y las reglas por defecto |
| `autorizar_emisor(emisor)` | admin | Permite que un contrato de tanda escriba. Evento `emisor_ok` |
| `revocar_emisor(emisor)` | admin | Solo impide escrituras **futuras**. No borra nada. Evento `emisor_no` |
| `configurar_reglas(reglas)` | admin | Cambia los topes para hechos **futuros** (los puntos ya ganados no se recalculan). Evento `reglas` |
| `registrar_lote(emisor, tanda_id, cuota, hechos: Vec<HechoMiembro>)` | emisor autorizado (`emisor.require_auth()`, que en llamada entre contratos se cumple sola) | Agrega hechos. Un evento `hist_hecho` por hecho |
| `historial(dir) -> Historial` | cualquiera | Acumulados (cero si no hay nada) |
| `puntaje(dir) -> u32` | cualquiera | `puntos_positivos − puntos_negativos`, mínimo 0 |
| `nivel(dir) -> Nivel` | cualquiera | Según el puntaje (§2) |
| `beneficio_colateral_bps(dir) -> u32` | cualquiera | Descuento de colateral (§4). 0 si no aplica |
| `es_emisor(dir) -> bool`, `reglas() -> Reglas` | cualquiera | Transparencia |
| `puntos_en_tanda(emisor, tanda_id, miembro) -> u32` | cualquiera | Puntos positivos que ya ganó en esa tanda (para entender el tope) |

No hay `editar`, `borrar` ni `reiniciar`: no existen.

**Errores** (enum propio del contrato historial): `YaInicializado=1`, `NoInicializado=2`, `NoAutorizado=3` (emisor no autorizado), `ParametroInvalido=4`.

**Evento `hist_hecho`** (tópicos: `"hist_hecho"`, `miembro`): `emisor` (contrato de tanda), `tanda_id`, `hecho`, `monto`, `puntos` (con signo, ya con tope). **Los eventos son el registro inmutable hecho por hecho; el struct `Historial` guarda los acumulados.** Ojo: el RPC público de testnet guarda eventos solo unos días, así que la página lee los acumulados del storage; una línea de tiempo completa necesitaría un indexador (trabajo futuro).

---

## 2. Puntaje y niveles

| Hecho | Puntos |
| --- | --- |
| Cuota pagada a tiempo | +10 |
| Cuota pagada tarde | +3 |
| Cuota cubierta por colateral | −15 |
| Quedar moroso | −100 |
| Saldar una deuda (M1) | +60 |
| Terminar una tanda sin atrasos | +50 |
| Terminar una tanda con atrasos (sin mora) | +25 |

**Puntaje = positivos − negativos** (nunca se muestra menos de 0). Los negativos se guardan aparte y **no se borran**.

| Nivel | Puntaje |
| --- | --- |
| Nuevo | 0–99 |
| Bronce | 100–299 |
| Plata | 300–599 |
| Oro | 600+ |

Ejemplos: una tanda de 6 sin atrasos = 6×10 + 50 = **110 → Bronce**. Tres tandas de 6 limpias = 330 → **Plata**. Con el tope de 150 por tanda, **Oro pide al menos 4 tandas** cumplidas.

---

## 3. Anti-inflado (trampas y defensas)

| Trampa | Defensa |
| --- | --- |
| **Billetera nueva para "limpiar" la mora** (Sybil) | El cero no da beneficios: descuento y tandas exigentes piden puntaje positivo |
| **Tandas falsas entre billeteras propias** | (a) Solo suman puntos **positivos** las tandas con `cuota ≥ cuota_minima` (10 TUSD por defecto); los negativos cuentan siempre. (b) **Tope de 150 puntos positivos por tanda y miembro**: ganar Oro exige 4+ tandas completas, cada una con capital inmovilizado durante n rondas. (c) Todas las tandas tienen ≥ 3 miembros (ya lo exige el contrato) |
| **Tanda con cuota mínima y periodo de 60 s para farmear rápido** | Queda **abierto** (ver decisión 3). Mitigación hoy: el tope por tanda + la cuota mínima. Un "tope por mes" bloquearía la demo acelerada |
| **Contrato de tanda falso que escribe puntos** | Solo los emisores autorizados por el admin escriben (`autorizar_emisor`, público y con evento) |
| **Saldar deuda para borrar la mora** | La mora no se borra (`puntos_negativos` y `veces_moroso` se quedan); saldar suma +60 pero no recupera los −100 |
| **Moroso con deuda abierta que usa su puntaje viejo** | Sin beneficios mientras `veces_moroso > deudas_saldadas` |

Límite honesto: un historial on-chain **no prueba identidad**. Para tandas grandes, la defensa fuerte es combinarlo con el verificador KYC que ya existe (`marcar_verificado`).

---

## 4. Beneficios (los elige el creador de cada tanda)

### En el contrato `tanda` (`contracts/tanda/src/requisitos.rs`)

| Función | Quién | Qué hace |
| --- | --- | --- |
| `configurar_historial(historial: Address)` | admin de la tanda | Conecta el contrato de historial. Si no se llama, todo sigue igual que hoy |
| `configurar_requisitos(id, puntaje_minimo: u32, descuento: bool)` | creador, solo con la tanda `Abierta` y **sin miembros** | Guarda `DataKey::Requisitos(id)`. Si `puntaje_minimo > 0` exige historial configurado |
| `get_requisitos(id) -> Requisitos` | cualquiera | `{ puntaje_minimo, descuento }` (por defecto 0 y false) |
| `colateral_para_miembro(id, miembro) -> i128` | cualquiera | Colateral del próximo turno **con** descuento, para mostrarlo antes de firmar |
| `get_historial() -> Option<Address>` | cualquiera | Dirección del historial configurado |

### Descuento de colateral (`ganchos::ajustar_colateral`)

| Nivel | Descuento |
| --- | --- |
| Nuevo | 0 % |
| Bronce | 10 % |
| Plata | 25 % |
| Oro | 50 % |

- **Nunca menos de una cuota** (`max(colateral × (1 − d), cuota)`), y sin beneficio si tiene mora sin saldar.
- Lo calcula el historial (`beneficio_colateral_bps`), así la regla es una sola para todas las tandas.
- Si la llamada falla, **no hay descuento** (la unión sigue).
- Riesgo (por eso es opcional): el descuento traslada parte del riesgo a los demás miembros si quien cobra primero desaparece. Lo resuelve la paradoja del crédito: quien cumple necesita menos dinero inmovilizado para cobrar antes.

### Puntaje mínimo (`ganchos::puede_unirse`)

Si `puntaje_minimo > 0` y `puntaje(miembro) < puntaje_minimo` → `Error::PuntajeInsuficiente`. Si el historial no responde, **se rechaza** (falla cerrado): es una regla que el creador pidió, y dejar entrar a cualquiera la anularía. Es la única excepción a "el historial nunca afecta a la tanda", y solo en tandas que la pidieron.

### Para M3

`nivel(dir)` y `puntaje(dir)` son públicos: el modo "precio por turno" puede exigir nivel para los primeros turnos (como MoneyFellows). Si M3 prefiere, expongo desde la tanda un helper `pub(crate) fn nivel_de(env, miembro) -> Option<Nivel>` en `ganchos.rs`.

---

## 5. Conexión con la tanda (ganchos)

| Gancho | Hecho | Cómo se envía |
| --- | --- | --- |
| `al_pagar(..., tarde)` | `CuotaATiempo` / `CuotaTarde` (monto = cuota) | Una llamada `try_registrar_lote` (1 hecho) |
| `al_cubrir` | `CuotaCubierta` | Se acumula en un búfer |
| `al_quedar_moroso` | `Moroso` (monto = deuda) | Se acumula |
| `al_cobrar` | `Cobro` (monto = bolsa) | Se acumula |
| `al_terminar(..., m, monto)` | `TandaCumplida` si `atrasos == 0 && !moroso`; `TandaConAtrasos` si `atrasos > 0 && !moroso`; nada si moroso (ya se registró) | Se acumula |
| `al_pagar_deuda` (M1) | `DeudaSaldada` cuando `deuda_restante == 0` | Una llamada |
| **`al_fin_operacion(env, t, id)` (nuevo)** | — | Envía el búfer en **una sola** `try_registrar_lote` |

**Firma:** `ajustar_colateral(env, t, id, miembro, colateral)` recibe ahora `id` (los requisitos son por tanda).

**Presupuesto:** `cerrar_ronda` y `finalizar` recorren hasta 12 miembros. En vez de 12 llamadas entre contratos, los ganchos acumulan los hechos en un búfer en memoria temporal (`DataKey::HechosPendientes`, storage `temporary`) y `al_fin_operacion` hace **una** llamada. Habrá una prueba con 12 miembros que mida el costo de `cerrar_ronda` y `finalizar` con el historial configurado.

**Cambio mínimo en `lib.rs` (aviso en el tablero):** dos líneas, `ganchos::al_fin_operacion(&env, &t, id);` al final de `cerrar_ronda` y de `finalizar`. Es un gancho vacío si no hay historial. M1 y M3: si tocan esas funciones, por favor dejen esas líneas al final.

### Cambios en archivos compartidos

- `tipos.rs` (bloque `// --- M2: historial ---` al final): `Requisitos { puntaje_minimo: u32, descuento: bool }`. Las claves nuevas (`Historial`, `Requisitos(u32)`, `HechosPendientes`) van en un **enum propio** `ClaveM2` en `requisitos.rs` para no tocar `DataKey` (así no chocamos con M1/M3 agregando variantes al mismo enum). Errores **20–29**:
  - `HistorialNoConfigurado = 20`
  - `PuntajeInsuficiente = 21`
  - `RequisitosBloqueados = 22` (la tanda ya no está abierta o ya tiene miembros)
- `eventos.rs` (bloque M2): `hist_conf` (historial configurado) y `requisitos` (requisitos de una tanda).
- `consultas.rs`: no lo toco; mis consultas van en `requisitos.rs`.
- `lib.rs`: las dos líneas de `al_fin_operacion`.

---

## 6. Web (fase MVP)

- `#/historial/<direccion>` (`web/src/pages/Historial.tsx`): nivel, puntaje, desglose ("12 cuotas a tiempo, 1 tarde…") y "Cómo se calcula". Pública.
- "Mi historial" en el encabezado con billetera conectada. Con Google, el historial es el de su billetera de Privy (se explica en la página).
- `InsigniaNivel` junto a cada miembro en `ListaMiembros` (y en el lobby si es barato).
- Al unirse: "Por tu historial Plata, tu garantía baja de 200 a 150 TUSD" (usa `colateral_para_miembro`).
- Al crear: `OpcionesHistorial.tsx` ("Pedir puntaje mínimo", "Dar descuento por historial"), insertado con una línea en `CrearTanda.tsx`. Se aplica con una segunda firma (`configurar_requisitos`) justo después de crear.
- Cliente generado `web/packages/historial` (extiendo `scripts/generar_cliente.sh`), `VITE_HISTORIAL_ID` en `config.ts` y `.env.example`, escenarios e2e con `mock.mjs`.

---

## 7. Decisiones (DECIDIDAS por @DocFranji, sáb 3 oct, como se recomendó)

1. **Fórmula y niveles** (§2).
2. **Cuota mínima para sumar puntos** = 10 TUSD y **tope** = 150 por tanda (parámetros del admin, solo afectan hechos futuros).
3. **Sin tope por tiempo** en el MVP (rompería la demo acelerada). Trabajo futuro.
4. **Puntaje mínimo falla cerrado** si el historial no responde (§4).
5. **Descuento por nivel** 10 / 25 / 50 %, nunca menos de una cuota.

## 7b. Detalles de implementación

- El tope por tanda se guarda en **una sola entrada por tanda** (`PuntosTanda(emisor, id)`: mapa miembro → puntos), no una por persona: así `finalizar` con 12 cumplidos escribe 1 entrada en vez de 12 (quedaba en 54 escrituras, sobre el límite de 50 de mainnet).
- Un hecho que no suma por la cuota mínima o por el tope **igual se anota** en los contadores (el desglose es fiel); el evento dice cuántos puntos dio (`puntos`).
- Quien queda moroso en una ronda donde su garantía cubrió una parte recibe los dos hechos: `CuotaCubierta` (−15) y `Moroso` (−100).
- Todo lo del historial (instancia, emisores, acumulados y topes) vive lo máximo de la red y se renueva en cada escritura (como mucho una vez al día).

### Costo medido (peor caso, 12 miembros, WASM con la VM; límites de mainnet: 100 M instrucciones, 100 lecturas, 50 escrituras)

| Operación | Sin historial (M1) | Con historial |
| --- | --- | --- |
| `unirse` (con descuento) | 3,8 M · 40 L · 10 E | 4,4 M · 43 L · 10 E |
| `pagar_cuota` | 1,2 M · 10 L · 4 E | 2,0 M · 15 L · 6 E |
| `cerrar_ronda` (12 hechos en un lote) | 22,5 M · 49 L · 28 E | 27,8 M · 64 L · 41 E |
| `pagar_deuda` | 6,2 M · 37 L · 16 E | 7,3 M · 42 L · 18 E |
| `finalizar` (12 cumplidos, nativo) | — | 14,1 M · 64 L · 43 E |

`historial.wasm`: 14 533 bytes · `tanda.wasm`: 48 242 bytes (límite 131 072).

## 8. Pruebas previstas

- `contracts/historial`: puntos y nivel por cada hecho; topes (cuota mínima, tope por tanda); negativos que no se borran; emisor no autorizado → error; revocar impide escrituras futuras; eventos publicados; no existen funciones de borrado.
- `contracts/tanda/src/test_historial.rs`: tanda completa actualiza a todos; moroso marcado; con M1, saldar deuda suma; puntaje mínimo (entra / no entra); descuento aplicado + `assert_conservacion()`; la tanda funciona sin historial y con un historial que falla; peor caso con 12 miembros (`cerrar_ronda` y `finalizar`).

## 9. Despliegue y web (estado)

- `scripts/desplegar_testnet.sh` despliega el historial, lo inicializa, **autoriza la tanda como emisor** y llama `configurar_historial`. `SIN_HISTORIAL=1` lo omite. Guarda `HISTORIAL=` en `scripts/.contratos` y `VITE_HISTORIAL_ID` en `web/.env.local`.
- `scripts/demo.sh` imprime al final el puntaje, el nivel y el enlace al historial de cada persona.
- **Probado en testnet** (dom 4 oct, cuentas desechables): despliegue completo + `demo.sh`. Resultado: Carla 80 (3 a tiempo + tanda cumplida), Beto 48 (2 a tiempo + 1 tarde + tanda con atrasos), Ana 5 (1 a tiempo − 2 cubiertas + tanda con atrasos), igual a la fórmula.
- Web: `VITE_HISTORIAL_ID` es **opcional**: si falta, la web le pregunta a la tanda (`get_historial`). Con un contrato de tanda anterior a M2 (el de producción hoy), todo lo del historial se esconde sin errores (hay prueba de navegador para eso).
- Página `#/historial/<dirección>` (y `#/historial` = el mío), enlace "Mi historial" en el menú, insignia de nivel en "Quiénes participan", nota al unirse (requisito y descuento; el botón usa la garantía con descuento), opciones al crear (firma extra `configurar_requisitos` antes de unirse).
- Pendiente (extra): insignias en las tarjetas del lobby y línea de tiempo del historial (necesita indexador).
