# Traspaso del orquestador (ORQ) a la cuenta de Paul

Escrito por el ORQ anterior (cuenta de DocFranji) el domingo 4 de octubre de 2026, 21:00 CR. **Donde este archivo
contradiga a `.claude/agents/orquestador.md`, manda este archivo** (aquel se escribió cuando la entrega era el 5 de
octubre).

## Mensaje de arranque (pegar en una sesión nueva de la cuenta de Paul)

```
Eres el agente ORQ (orquestador) del equipo de Rounda, y retomas el trabajo de un ORQ anterior que estaba en otra
cuenta. Trabaja sobre la rama integracion del repo DocFranji/Safe-Chain. Lee completos CLAUDE.md,
agentes/PROTOCOLO.md, .claude/agents/orquestador.md y agentes/traspaso/ORQ.md (este último manda si algo choca).
Tu rama es mision/orquestador. El tablero es el issue #4. Empieza por la sección "Al arrancar" de
agentes/traspaso/ORQ.md.
```

## Al arrancar

1. Lee los archivos del mensaje de arranque y `agentes/traspaso/DESPLEGAR-V3.md`.
2. `git fetch origin` y revisa que `origin/integracion` esté en `80b0414` o más adelante (`git log --oneline -5 origin/integracion`).
3. Lee el tablero desde el comentario 5985379940 (el último del ORQ anterior). Para gastar poco, pide el total de
   comentarios con `issue_read get` y lee solo los nuevos con `get_comments`, usando `perPage` y `page` (van en
   orden ascendente).
4. Publica en el tablero que el ORQ continúa desde la cuenta de Paul. Pide a @DocFranji que borre la rutina del ORQ
   anterior ("ORQ Rounda: ronda del tablero (cada 3 h)") si todavía existe.
5. Crea tu propia ronda cada 3 horas: `create_trigger` con
   `cron_expression: "CRON_TZ=America/Costa_Rica 44 7,10,13,16,19,22 * * *"`, sin rondas de noche. Bórrala después del lunes 12 a las 16:00.

## Dónde estamos (domingo 4, 21:00 CR)

- **Entrega:** lunes 12 de octubre a las 16:00 CR. Se sube un video de máximo 3 minutos que explica el proyecto y
  muestra una demo (no hay demo en vivo). Producción importa porque el jurado puede entrar a probarla.
- **`integracion` = `80b0414` tiene TODO:** M1, M2, M3, M4 y ORQ. Todas las misiones terminaron lo aprobado y están
  en espera.
- **`main` (producción, https://rounda-phi.vercel.app) no cambió** desde el sábado: sigue en la versión anterior
  del contrato (`TANDA_ID` por defecto `CDLSK5Z6…` en `web/src/config.ts`).
- **Ningún contrato nuevo desplegado todavía.** El despliegue v3 (todo junto, con Blend) lo hace @DocFranji desde
  WSL: `agentes/traspaso/DESPLEGAR-V3.md`.

| PR | Misión | Qué entró |
| --- | --- | --- |
| #7, #13 | ORQ | `scripts/verificar.sh` y CI; pruebas de invariantes al azar (`test_invariantes.rs`), arreglo de `finalizar`, `docs/seguridad.md` |
| #9, #11, #14 | M1 | Tandas largas con calendario anclado, `pagar_deuda`, dos bóvedas, `#/estado` de bóvedas, "cóbrala", calendario `.ics` |
| #6 | M2 | Contrato `historial`, ganchos, puntaje, niveles, descuento y puntaje mínimo |
| #10, #12, #15 | M3 | 5 modos de turnos, intercambio, ofertas selladas, turnos que piden historial, chequeo de interfaz en `#/estado` |
| #8 | M4 | Bóveda por token, USDC con rendimiento real de Blend, indicador de liquidez, cierre con un solo retiro |

**Verificación de `80b0414`:**
- 109 pruebas de la tanda, 23 del adaptador y 19 del historial;
- 160 pruebas web y **312/312 en el navegador**;
- peor caso en WASM con 12 personas: **23,8 M · 74 lecturas · 43 escrituras** (mainnet: 100 M · 100 · 50);
- con Blend real en testnet: 30,8 M · 83 · 43 · 12 204 B de eventos (límite: 16 384 B).

## Lo que falta, en orden

| Cuándo | Qué | Quién |
| --- | --- | --- |
| Lun 5 | Despliegue v3 en testnet (`DESPLEGAR-V3.md`). Pide las líneas `VITE_*` | DocFranji |
| Lun 5 | Lanzar el agente `web-preview` (`.claude/agents/web-preview.md`): la vista previa de `integracion` usa los contratos v3 y producción queda igual | Paul lo lanza; ORQ revisa e integra su PR |
| Lun 5 | Pruebas en la vista previa (crear, pagar a tiempo y tarde, deuda, cada modo de turnos, USDC) | Equipo |
| Mar 6 | **Primera entrada a producción:** `integracion` → `main` y variables de Production, con la lista de salida que deja `web-preview` | DocFranji (solo él toca `main`) |
| Mié 7 – Jue 8 | Libres (M4 entró antes de lo previsto): pulir, arreglar lo que salga, preparar el guion del video | Equipo |
| Vie 9 | Segunda entrada a producción, con los arreglos | DocFranji |
| Sáb 10 | Piloto con 5 a 10 personas en producción y primera toma del video (antes, `bash scripts/renovar_boveda_rapida.sh`) | Equipo |
| Dom 11, 12:00 | Congelamiento: solo arreglos. Video final, README y pitch | Equipo |
| Lun 12, 16:00 | Entrega | Equipo |

**Tareas chicas del ORQ (cuando haya margen de uso):**
- Sumar `contract_events_size_bytes <= 16_384` a las pruebas de peor caso (`test_deudas.rs`, `test_historial.rs`,
  `test_turnos.rs`). Lo propuso M4: el límite de eventos ya trabó una tanda en USDC, y con TUSD el peor caso estaba
  al 86 % antes del arreglo. Toca archivos de M1, M2 y M3: avísalo en el tablero.
- Anotar el hallazgo de M4 (16 KiB de eventos) en la tabla de hallazgos de `docs/seguridad.md`.
- Pedir a M2 que renueve `ClaveM2::Requisitos(id)` con la tanda (hallazgo de baja gravedad en `docs/seguridad.md`).

## Decisiones pendientes de las personas

Llévaselas a @DocFranji con opciones y una recomendación. Cuando decida, publícalo como "DECIDIDO por @DocFranji".

1. **Uso de la cuenta hasta el martes 6 a la 01:00 CR.** La cuenta de DocFranji tiene un aviso de límite semanal.
   Recomendación: todo el trabajo nuevo desde la cuenta de Paul (por eso este traspaso).
2. **Despliegue v3:** cuándo, y si va con Blend. Recomendación: lunes 5 por la mañana, con Blend.
3. **Primera entrada a producción el martes 6.** Recomendación: sí, después de probar la vista previa.
4. **Línea de tiempo de largo plazo del historial (M2).** Pide un indexador o guardar hechos en el contrato.
   Recomendación: dejarla para después.
5. **Piloto del sábado 10:** quién invita, a quién y con qué guion.
6. **Video:** quién escribe el guion y quién graba.
7. **M5 (SINPE):** solo si Paul la lanza y la supervisa desde su cuenta.
8. **Cerrador automático diario (Cron de Vercel):** DECIDIDO "de momento no". No lo prepares.

## Reglas que siguen vigentes

- **Permiso para integrar en `integracion`:** lo dio @DocFranji en el tablero (comentario 5974927422). Integra con
  `git merge --no-ff`, sin force-push. **Nunca** hagas push a `main`, despliegues oficiales ni cambios en
  las variables de Production de Vercel: eso es de DocFranji.
- **Nunca** subas ni pidas secretos (`S...`, `FAUCET_ISSUER_SECRET`, App Secret de Privy), ni en el repo, ni en el
  tablero, ni en el chat. Las direcciones `C...` y `G...` son públicas.
- Solo testnet. Español en todo. El código generado (`web/packages/*`) no se edita a mano: `bash scripts/generar_cliente.sh`.
- **Medidas de uso:** ronda cada 3 horas; nada de sondeos; suscribirte solo a tus propios PRs; máximo 2 agentes
  activos a la vez por cuenta. Los agentes que terminan quedan en espera hasta que los despiertes.

## Cómo integra el ORQ (lo que funcionó)

1. Lee el PR y el código que mueve dinero (`lib.rs`, `deudas.rs`, `turnos*.rs`, `almacenamiento.rs`, el adaptador).
2. Ensayo local:
   ```bash
   git checkout -B ensayo/x origin/integracion
   git merge --no-ff origin/<rama>
   PUERTO=4185 bash scripts/verificar.sh
   ```
   Si hay contratos, después corre `PEOR_CASO_WASM=1 cargo test -p tanda peor_caso -- --nocapture --test-threads=1`.
3. Si está verde, integra con un mensaje claro:
   ```bash
   git checkout -B integracion origin/integracion
   git merge --no-ff -m "Integra Mx: … (PR #n)" origin/<rama>
   git diff --stat ensayo/x integracion   # vacío = el mismo árbol que verificaste
   git push origin integracion
   ```
4. Publica en el tablero qué verificaste: pruebas, navegador y peor caso.

**Lo que ya nos pasó:**
- `web/.gitignore` ignoraba los `dist` de los clientes: ahora `verificar.sh` lo revisa.
- Dos PRs que suman escenarios chocan en `web/e2e/run.mjs` (la línea de importaciones del mock): se unen las dos listas.
- Cuando dos PRs agregan chequeos a `#/estado`, la prueba que cuenta "puntos revisados" cambia (hoy son 10).
- Las sesiones en la nube no pueden abrir `*.vercel.app` (el proxy lo bloquea): una persona revisa la vista previa.
- `desplegar_testnet.sh` escribe `web/.env.local`, y `verificar.sh` lo aparta mientras verifica.
- Las pruebas de invariantes corren 8 escenarios por defecto y 32 en CI. Para buscar errores: `INVARIANTES_SEMILLAS=400 cargo test -p tanda --release invariantes_al_azar`.
- La instancia del contrato de producción (`CDLSK5Z6…`) vive hasta el ledger 5 082 808, más o menos el miércoles 7.
  Si la salida a producción se atrasa más allá de eso, hay que renovarla o desplegar.

## Si hace falta retomar una misión terminada (por ejemplo, un error en la vista previa)

M1 y M4 estaban en la cuenta de DocFranji y terminaron; M2 y M3 ya están en la de Paul. Si hay que arreglar algo de
M1 o M4, Paul abre una sesión nueva con:

```
Eres el agente M1 (o M4) del equipo de Rounda y retomas tu misión en otra cuenta para arreglar un error.
Lee completos CLAUDE.md, agentes/PROTOCOLO.md, .claude/agents/m1-tiempos-deudas.md (o m4-blend.md) y
agentes/traspaso/ORQ.md. Trabaja SOLO en tu rama de misión; antes trae integracion. Lee en el issue #4 el
reporte del error y arréglalo con su prueba, verificar.sh en verde y un PR hacia integracion.
```
