# Protocolo del equipo de agentes de Rounda

Este documento es **obligatorio** para todos los agentes (y útil para las personas). Explica cómo trabajamos en paralelo sobre el mismo repo sin pisarnos, cómo nos comunicamos y cuándo algo está terminado.

> Objetivo común: **ganar Find Your Way (Costa Rica)**. La entrega cierra el **lunes 5 de octubre de 2026 a las 4:00 p.m. (hora de Costa Rica, UTC−6)**. La demo que ya funciona en producción es sagrada: nada de lo que hagamos puede romperla antes de esa hora.

---

## 1. Quiénes somos

| ID | Agente | Rama | Qué hace | Depende de |
| --- | --- | --- | --- | --- |
| ORQ | `orquestador` | `mision/orquestador` | Coordina, revisa, integra en `integracion`, despliega con ayuda humana | Todos |
| M1 | `m1-tiempos-deudas` | `mision/m1-tiempos-deudas` | Tandas de semanas o meses (hasta un año) y pago de deudas de morosos | — |
| M2 | `m2-historial` | `mision/m2-historial` | Historial crediticio público e inmutable, con beneficios | M1 (gancho de deuda) |
| M3 | `m3-turnos` | `mision/m3-turnos` | Modos de turnos: precio por turno, subasta, sorteo, intercambio | M1 |
| M4 | `m4-blend` | `mision/m4-blend` | Rendimiento real con Blend (revisa la rama `blend-adaptador`) | M1–M3 (va al final) |
| M5 | `m5-sinpe` | `mision/m5-sinpe` | Investigación + prototipo: participar con SINPE Móvil sin ver cripto | — |

Las instrucciones de cada uno están en `.claude/agents/<agente>.md`.

**Tablero de coordinación:** [issue #4 en GitHub](https://github.com/DocFranji/Safe-Chain/issues/4) (`🧭 Tablero de agentes`).

---

## 2. Reglas de oro

1. **Trabaja solo en tu rama** (`mision/<tu-mision>`). Nunca hagas push a `main` ni a `integracion`. Solo el orquestador (con permiso humano) integra.
2. **La demo de producción no se toca.** `main` está desplegado en Vercel y apunta a un contrato ya desplegado en testnet. Un cambio de contrato en `main` sin redesplegar rompe la web.
3. **Respeta las zonas de propiedad** (sección 5). Si necesitas tocar algo de otra misión, pídelo en el tablero antes.
4. **Pregunta pronto, no tarde.** Las decisiones de producto y las irreversibles se consultan con las personas (sección 4.3). Para lo reversible, propone una opción por defecto y sigue avanzando.
5. **Nada se da por terminado sin pruebas.** Cada cambio que mueve dinero lleva una prueba de conservación (`assert_conservacion`). Ver la sección 8.
6. **Nunca subas secretos** (llaves `S...`, `FAUCET_ISSUER_SECRET`, App Secret de Privy, tokens de bots). Ni en código, ni en issues, ni en el chat.
7. **Testnet siempre.** Nada en mainnet ni con dinero real.
8. **El código generado no se edita a mano** (`web/packages/*`). Se regenera con `scripts/generar_cliente.sh`.
9. **Sé honesto en los informes.** Si algo no lo probaste, dilo. Si algo falló, dilo con el error.
10. **Pequeño y verificado gana a grande y roto.** Entrega por fases: primero el MVP de tu misión, luego lo demás.

---

## 3. Ramas y pull requests

- Tu rama sale de `main` actualizado: `git fetch origin main && git checkout -b mision/<id> origin/main` (si ya existe, úsala).
- Abre un **PR en borrador hacia `integracion`** apenas tengas el primer commit, para que los demás vean tu avance. Si `integracion` aún no existe, ábrelo hacia `main` y el orquestador lo cambia de base.
- Commits pequeños y descriptivos, en español, como el historial del repo.
- Cuando cumplas la Definición de Terminado (sección 8), pasa el PR a **listo para revisión** y avisa en el tablero.
- Para traer cambios de otros: `git fetch origin integracion && git merge origin/integracion`. **No hagas rebase ni force-push** sobre una rama que otros puedan estar leyendo.
- **Conflictos en código generado** (`web/packages/tanda/**`): no los resuelvas a mano. Acepta cualquiera de los dos lados y vuelve a correr `bash scripts/generar_cliente.sh`.

---

## 4. Comunicación

### 4.1 Canales

| Canal | Para qué | Cómo |
| --- | --- | --- |
| **Tablero (issue #4)** | Estado, preguntas entre agentes, acuerdos de interfaz, preguntas a humanos | Comentarios en el issue (herramientas `mcp__github__*` en la nube, o `gh issue comment 4` en local) |
| **Tu PR** | Discusión técnica de tu cambio, revisión | Comentarios en el PR |
| **Mensaje directo entre sesiones** (opcional) | Algo urgente para otra sesión | Si tienes la herramienta `send_message` (claude-code-remote), úsala con el `session_id` que cada agente publica en el tablero. **Siempre deja copia en el tablero.** |
| **Tu propia sesión** | Preguntas que solo una persona puede contestar | La persona que te supervisa lee tu sesión |

### 4.2 Al arrancar (obligatorio)

1. Lee `CLAUDE.md`, este protocolo y tu archivo en `.claude/agents/`.
2. Averigua el ID de tu sesión si estás en la nube (herramienta `get_session` sin argumentos de claude-code-remote; si no la tienes, omítelo).
3. Publica en el tablero un comentario con la **plantilla de arranque** (sección 12).
4. Revisa el tablero: puede haber acuerdos o preguntas que te afectan.

### 4.3 Preguntas a las personas

- Pregunta en tu sesión **y** en el tablero (menciona a @DocFranji).
- Formato: contexto en 1–2 líneas, opciones (A/B/C) con pros y contras, **tu recomendación**, y qué harás mientras tanto.
- Si la decisión es **reversible**, sigue con tu recomendación mientras esperas y dilo. Si es **irreversible** (cambia dinero, seguridad o la demo), espera la respuesta.
- Agrupa preguntas: mejor una pregunta con tres puntos que tres preguntas sueltas.

### 4.4 Mensajes entre agentes

- Empieza con el destinatario y el tema: `@M3 Interfaz OpcionesTanda: ...`.
- Si pides algo, di para cuándo lo necesitas y qué harás si no llega.
- Quien recibe responde en el tablero aunque sea con "visto, lo hago hoy a las 3 p.m.".
- Revisa el tablero **al empezar cada fase** y **antes de abrir o actualizar tu PR**.

---

## 5. Zonas de propiedad

El contrato `contracts/tanda` ya está dividido en módulos para que podamos trabajar en paralelo. Cada archivo tiene dueño:

| Archivo / carpeta | Dueño | Reglas |
| --- | --- | --- |
| `contracts/tanda/src/lib.rs` (flujo principal) | Compartido | Cambios mínimos y avisados en el tablero. M3 puede cambiar `unirse` y `cerrar_ronda` para los turnos, y extraer la lógica de `crear_tanda` a una función interna compartida con `crear_tanda_avanzada`, sin cambiar su firma. M1 puede tocar las validaciones de `crear_tanda` y el calendario en `cerrar_ronda`. |
| `contracts/tanda/src/almacenamiento.rs` (TTL) | **M1** | |
| `contracts/tanda/src/deudas.rs` | **M1** | Ya existe vacío y declarado: agrega tu `#[contractimpl]` con `pagar_deuda` |
| `contracts/tanda/src/requisitos.rs` | **M2** | Ya existe vacío y declarado (configuración del historial y requisitos) |
| `contracts/tanda/src/turnos_acciones.rs` | **M3** | Ya existe vacío y declarado (`crear_tanda_avanzada`, `unirse_en_turno`, ofertas, intercambios) |
| `contracts/tanda/src/ganchos.rs` | **M2** | M1 puede **agregar** un gancho nuevo vacío (`al_pagar_deuda`); M2 lo llena |
| `contracts/tanda/src/turnos.rs` y `turnos_*.rs` | **M3** | |
| `contracts/tanda/src/tipos.rs`, `eventos.rs` | Compartido | **Solo agregar** al final, en un bloque con comentario `// --- M<n>: ... ---`. No reordenar ni renombrar lo existente |
| `contracts/tanda/src/consultas.rs` | Compartido | Solo agregar funciones |
| `contracts/tanda/src/test.rs` | Compartido | No lo cambies. Tus pruebas van en tu archivo, que ya existe y está declarado: `test_tiempos.rs` y `test_deudas.rs` (M1), `test_historial.rs` (M2), `test_turnos.rs` (M3), `test_blend.rs` (M4) |
| `contracts/historial/` (nuevo) | **M2** | |
| `contracts/boveda_simulada/` | **M1** (acelerador, TTL) | M4 puede leerla como referencia |
| `contracts/adaptador_blend/` (rama `blend-adaptador`) | **M4** | |
| `scripts/desplegar_testnet.sh`, `scripts/demo.sh` | Compartido | Cada misión actualiza las llamadas que cambie y lo avisa |
| `web/packages/*` | Generado | Nunca a mano: `bash scripts/generar_cliente.sh` |
| `web/src/pages/CrearTanda.tsx` | Compartido | M1: bloque de duración. M3: inserta **un** componente `OpcionesTurnos` |
| `web/src/components/PanelRonda.tsx` | Compartido | M1: inserta `PagarDeuda`. M3: inserta `AccionesTurnos`. Lógica en tu propio componente |
| `web/src/lib/historia.ts` (narración de eventos) | Compartido | Solo agregar casos para tus eventos nuevos |
| `web/src/config.ts`, `web/src/lib/rutas.ts` | Compartido | Solo agregar |
| `web/e2e/` (pruebas de navegador) | Compartido | Agrega escenarios. Si cambias el contrato, actualiza `mock.mjs` |
| `servicios/`, `docs/sinpe/` | **M5** | |
| `docs/<mision>.md` | Cada misión | Diseño y decisiones |

---

## 6. Acuerdos de interfaz (lo que unas misiones esperan de otras)

Estos acuerdos evitan sorpresas al integrar. Si necesitas cambiar uno, propónlo en el tablero y espera el **ACORDADO** de los afectados.

### 6.1 Códigos de error del contrato `tanda` (rangos reservados)

| Rango | Dueño |
| --- | --- |
| 1–13 | Existentes (no tocar) |
| 14–19 | M1 |
| 20–29 | M2 |
| 30–49 | M3 |
| 50–59 | M4 |

Cada error nuevo necesita su mensaje en español en `web/src/lib/contrato.ts` (`MENSAJES`).

### 6.2 Ganchos (`ganchos.rs`)

El flujo principal ya llama a estas funciones vacías. M2 las llena. **Nadie más cambia sus firmas sin acuerdo.**

| Gancho | Cuándo |
| --- | --- |
| `puede_unirse(env, t, id, miembro) -> Result<(), Error>` | Antes de cobrar el colateral al unirse |
| `ajustar_colateral(env, t, miembro, colateral) -> i128` | Al calcular el colateral de quien se une |
| `al_unirse`, `al_pagar`, `al_cubrir`, `al_quedar_moroso`, `al_cobrar`, `al_terminar` | Después de cada evento equivalente |
| `al_pagar_deuda(env, t, id, miembro, monto, deuda_restante)` | **M1 lo agrega** (vacío) al crear `pagar_deuda` |

Regla: un gancho **nunca** debe hacer fallar la operación principal por un problema del historial (usar llamadas `try_*` e ignorar el error).

### 6.3 Turnos (`turnos.rs`)

`posicion_al_unirse`, `beneficiario_de_ronda` y `colateral_para` son las puertas que M3 cambia. Otros módulos no deben suponer que "posición = orden de llegada".

### 6.4 Opciones al crear una tanda

- **Nadie cambia la firma de `crear_tanda`.** Así no se rompen las pruebas existentes, `scripts/demo.sh`, la web ni el trabajo de las otras misiones.
- **M3** agrega una función nueva `crear_tanda_avanzada(..., opciones: OpcionesTanda)` (struct en `tipos.rs`). `crear_tanda` equivale a las opciones por defecto (orden de llegada). Las opciones se guardan en una clave propia (`DataKey::Opciones(id)`), no dentro del struct `Tanda`.
- **M2** pone sus requisitos de historial en una función aparte (`configurar_requisitos(id, ...)`, solo el creador y solo mientras la tanda está `Abierta` y vacía). Cuando M3 esté integrado, M2 puede proponer mover su campo a `OpcionesTanda`.
- Quien agregue funciones que use la demo actualiza `scripts/demo.sh` (o crea un script propio), `web/e2e/mock.mjs`, la web y `DEMO.md`.

### 6.5 Historial (contrato `historial`)

M2 publica su interfaz en `docs/historial.md` y en el tablero **antes** de implementarla. Mínimo esperado por los demás:

- `puntaje(direccion) -> u32` y `nivel(direccion) -> Nivel` (lectura, sin firma).
- `beneficio_colateral_bps(direccion) -> u32` (descuento de colateral; lo usa `ganchos::ajustar_colateral`).
- Escrituras solo desde contratos de tanda autorizados.

### 6.6 Eventos nuevos

Cada evento nuevo va en `eventos.rs` (bloque de tu misión) y su frase en español en `web/src/lib/historia.ts`. Avisa en el tablero el nombre del tópico (por ejemplo `deuda_pag`) para que nadie repita uno. **Los tópicos de Soroban tienen máximo 32 caracteres** (y los `Symbol` cortos, 9).

### 6.7 Configuración de la web

Variables nuevas en `web/src/config.ts` y `web/.env.example`, con valor por defecto que funcione. Lista acordada:

- `VITE_HISTORIAL_ID` (M2)
- `VITE_SIMBOLO`, `VITE_TOKEN_NATIVO` (M4, si se usa XLM)

---

## 7. Orden de integración y calendario (hora de Costa Rica)

La integración ocurre en la rama **`integracion`**, no en `main`. `integracion` tiene su propio despliegue de prueba en Vercel y apunta a contratos nuevos en testnet. Solo al final, `integracion` pasa a `main` (producción).

| Cuándo | Qué |
| --- | --- |
| Sáb 3 oct, 10:00 | Diseños publicados en el tablero (M1, M2, M3, auditoría de M4, plan de M5). Interfaces ACORDADAS |
| Sáb 3 oct, 16:00 | **M1** listo para revisión |
| Sáb 3 oct, 20:00 | M1 en `integracion` y desplegado en testnet (contrato v2) |
| Dom 4 oct, 12:00 | **M2** y **M3 (MVP)** listos para revisión |
| Dom 4 oct, 16:00 | M2 + M3 en `integracion`, redespliegue, pruebas completas |
| Dom 4 oct, 20:00 | **M4** en `integracion` (si es viable) |
| Dom 4 oct, 22:00 | `integracion` → `main`; producción actualizada y probada |
| Lun 5 oct, 09:00 | **CONGELAMIENTO**: solo arreglos de errores, ensayo de demo, video y pitch |
| Lun 5 oct, 16:00 | Entrega en Stellar Passport |

M5 no cambia contratos: puede entrar por su cuenta cuando su PR esté listo.

Si una misión no llega a tiempo, **se integra solo su parte terminada** o se queda fuera. Una funcionalidad a medias nunca entra a la demo.

---

## 8. Definición de Terminado (DoD)

Tu PR está listo para revisión cuando:

- [ ] **Contratos:** `cargo fmt --all -- --check`, `cargo clippy --all-targets` sin advertencias, `cargo test` en verde.
- [ ] **Pruebas nuevas** de todo lo que agregaste, incluidos los casos de error. Si mueve dinero: `assert_conservacion()` al final.
- [ ] **Peor caso:** si agregaste bucles o llamadas entre contratos, una prueba con 12 miembros (el máximo) que no exceda el presupuesto de cómputo.
- [ ] `stellar contract build` compila. Anota el tamaño del `.wasm` en el PR.
- [ ] **Cliente regenerado:** `bash scripts/generar_cliente.sh` (si cambiaste la interfaz del contrato).
- [ ] **Web:** en `web/`, `npm run lint`, `npm test` y `npm run build` en verde.
- [ ] **Navegador:** `npm run preview` + `cd web/e2e && npm test` en verde (actualiza `mock.mjs` y agrega escenarios para lo tuyo). Revisa también a 390 px de ancho.
- [ ] **Scripts y docs** actualizados (`scripts/*.sh`, `README.md`, `DEMO.md`, `docs/<mision>.md`).
- [ ] **PR** con la plantilla (sección 12): qué hace, cómo se probó, qué **no** se probó, riesgos.
- [ ] Aviso en el tablero.

---

## 9. Comandos de verificación

```bash
# Contratos (desde la raíz)
cargo fmt --all -- --check
cargo clippy --all-targets
cargo test
stellar contract build                 # genera target/wasm32v1-none/release/*.wasm

# Cliente TypeScript del contrato (después de cambiar su interfaz)
bash scripts/generar_cliente.sh

# Web
cd web && npm ci && npm run lint && npm test && npm run build

# Navegador (en otra terminal: cd web && npm run preview)
cd web/e2e && npm ci && npm test       # escenarios con RPC y Freighter simulados
node snap.mjs "#/tanda/2" foto 390     # captura en web/e2e/shots/foto.png
```

Notas del entorno en la nube: `soroban-sdk` 28 **solo compila contratos a WASM con `stellar contract build`** (no con `cargo build --target`). `cargo test` sí funciona sin la CLI. Si la CLI no está instalada, corre `bash scripts/preparar_entorno.sh`.

---

## 10. Despliegues

- **Pruebas en testnet desde la nube:** puedes desplegar contratos de prueba con tus propias identidades (`stellar keys generate <nombre> --network testnet --fund`). Son desechables: no los uses como oficiales.
- **Despliegue oficial (integracion y main):** lo hace una persona (@DocFranji) en su WSL con `bash scripts/desplegar_testnet.sh`, porque ahí viven las llaves del emisor de TUSD que usa el faucet. El orquestador prepara el script y las instrucciones; la persona lo corre y actualiza las variables en Vercel.
- **Mantén `scripts/desplegar_testnet.sh` al día** si tu misión agrega contratos (M2: historial; M4: adaptador).

---

## 11. Seguridad

- Ningún secreto en el repo, issues, PRs ni chat. Si ves uno, avisa en el tablero sin copiarlo.
- Revisa permisos (`require_auth`) en cada función nueva: ¿quién puede llamarla?, ¿qué pasa si la llama otro?
- Cuidado con redondeos: el contrato nunca debe regalar ni perder centavos (pruebas de conservación).
- En la web, nunca firmes nada que la persona no haya visto: explica montos antes de pedir la firma.

---

## 12. Plantillas

**Arranque (comentario en el tablero):**
```
**[M<n> · <nombre>] Arranque**
Sesión: <session_id o "local"> · Rama: mision/<id> · PR: #<n> (borrador)
Entendí mi misión así: <2 líneas>
Plan por fases: 1) ... 2) ... 3) ...
Interfaces que propongo o necesito: ...
Preguntas iniciales: ...
```

**Estado (en cada hito):**
```
**[M<n>] Estado** · <fecha y hora CR>
Hecho: ...
Siguiente: ...
Bloqueos / preguntas: ...
Necesito de @M<x>: ... (para <cuándo>)
```

**Pregunta a personas:**
```
**[M<n>] Pregunta para @DocFranji** · <tema>
Contexto: ...
Opciones: A) ... B) ... C) ...
Recomiendo: B, porque ...
Mientras tanto: sigo con B (reversible) / espero (irreversible).
```

**Propuesta de interfaz:**
```
**[M<n>] Propuesta de interfaz** · <nombre>
Firma / estructura: ...
Quién la usa: @M<x>, @M<y>
Responder con ACORDADO o con cambios antes de <hora>.
```

**Descripción del PR:**
```
## Qué hace
## Cómo se probó (comandos y resultados)
## Qué NO se probó
## Cambios de interfaz (contrato, web, scripts)
## Riesgos y cómo desplegarlo
```
