# Guía para las personas: cómo poner a trabajar a los agentes

Esta guía es para ti (y tu equipo): cómo lanzar los agentes, cómo se comunican, qué te van a preguntar y cómo llevar todo a producción a tiempo. Los agentes tienen sus propias instrucciones en `.claude/agents/` y siguen `agentes/PROTOCOLO.md`.

## 1. Qué armamos

```
                 Tú (@DocFranji) + tu equipo
                            │  respondes preguntas, apruebas merges, corres despliegues
                            ▼
                    ORQ · orquestador ───────────── tablero: issue #4
                 (coordina, revisa, integra)          (estado, preguntas, acuerdos)
          ┌──────────┬──────────┼──────────┬──────────┐
          ▼          ▼          ▼          ▼          ▼
         M1         M2         M3         M4         M5
     tiempos y   historial   turnos     Blend      SINPE
      deudas    crediticio                        (opcional)
          │          │          │          │          │
          └── cada uno en su rama mision/<id>, con un PR hacia `integracion` ──┘
                            │
                            ▼
                integracion  ──(al final, con tu aprobación)──▶  main = producción
```

- **Cada agente** es una sesión de Claude Code independiente, con su rama, su PR y sus instrucciones.
- **Se comunican** en el tablero (issue #4) y en los PRs. Si su sesión lo permite, también con mensajes directos entre sesiones.
- **Nada llega a producción** sin pasar por `integracion`, por las pruebas y por tu aprobación.

## 2. Antes de lanzarlos (15 minutos)

1. **Fusiona el PR que preparó todo esto** (agentes, protocolo, hook de inicio). Los agentes clonan `main`, y sin esto no ven sus instrucciones.
2. **Vercel:** en el proyecto `rounda`, Settings → Environment Variables. Revisa que `VITE_TANDA_ID`, `VITE_TOKEN_ID` y `VITE_NOMBRES` (si existen) estén **solo en Production**. Así la vista previa de `integracion` usa los contratos nuevos que el orquestador pondrá en el código.
3. **Privy:** agrega a los dominios permitidos `https://rounda-git-integracion-rounda.vercel.app`, para probar el login con Google en la vista previa.
4. **Reparte la supervisión** entre las personas del equipo. Sugerencia:

   | Persona | Supervisa |
   | --- | --- |
   | DocFranji | Orquestador + M1 + M4 |
   | Paul-AGR (hizo el login con Google) | M2 (historial) + M5 (SINPE) |
   | luisfe-24 | M3 (turnos) |

   "Supervisar" es leer la sesión del agente de vez en cuando y responder sus preguntas.

## 3. Cómo lanzar los agentes

### Opción A (recomendada): Claude Code en la web

Una sesión por agente en [claude.ai/code](https://claude.ai/code), sobre el repo `DocFranji/Safe-Chain`.

1. Nueva sesión → repo `DocFranji/Safe-Chain` → rama `main`.
2. Pega el mensaje de arranque de su misión (abajo).
3. La **primera** sesión tarda unos 15–20 minutos en arrancar: el hook de inicio compila la CLI de Stellar. Después el entorno queda guardado y las siguientes arrancan rápido.

**Mensajes de arranque** (copia y pega el que corresponda):

```
Eres el agente ORQ (orquestador) del equipo de Rounda. Lee completos CLAUDE.md, agentes/PROTOCOLO.md
y .claude/agents/orquestador.md, y síguelos. Tu rama es mision/orquestador. El tablero es el issue #4.
Empieza por la sección "Al arrancar" de tus instrucciones.
```

```
Eres el agente M1 (tiempos reales y pago de deudas) del equipo de Rounda. Lee completos CLAUDE.md,
agentes/PROTOCOLO.md y .claude/agents/m1-tiempos-deudas.md, y síguelos. Trabaja SOLO en la rama
mision/m1-tiempos-deudas. Coordínate en el issue #4. Empieza por la fase de diseño y publica tu arranque en el tablero.
```

```
Eres el agente M2 (historial crediticio) del equipo de Rounda. Lee completos CLAUDE.md,
agentes/PROTOCOLO.md y .claude/agents/m2-historial.md, y síguelos. Trabaja SOLO en la rama
mision/m2-historial. Coordínate en el issue #4. Empieza por la fase de diseño y publica tu arranque en el tablero.
```

```
Eres el agente M3 (mecanismos de turnos) del equipo de Rounda. Lee completos CLAUDE.md,
agentes/PROTOCOLO.md y .claude/agents/m3-turnos.md, y síguelos. Trabaja SOLO en la rama
mision/m3-turnos. Coordínate en el issue #4. Empieza por la fase de diseño y publica tu arranque en el tablero.
```

```
Eres el agente M4 (Blend real) del equipo de Rounda. Lee completos CLAUDE.md, agentes/PROTOCOLO.md y
.claude/agents/m4-blend.md, y síguelos. Trabaja SOLO en la rama mision/m4-blend. Coordínate en el
issue #4. Empieza por la fase 0 (auditoría); la integración espera a que M1–M3 estén en integracion.
```

```
Eres el agente M5 (SINPE Móvil) del equipo de Rounda. Lee completos CLAUDE.md, agentes/PROTOCOLO.md y
.claude/agents/m5-sinpe.md, y síguelos. Trabaja SOLO en la rama mision/m5-sinpe. Coordínate en el
issue #4. Empieza por la investigación y publica tu arranque en el tablero.
```

**Orden sugerido:**

1. **Orquestador primero:** crea la rama `integracion`.
2. Luego **M1, M2, M3 y M5 a la vez.**
3. **M4** cuando quieras: su fase 0 no choca con nadie.

### Opción B: que Claude los lance por ti

Desde una sesión de Claude Code en la nube que tenga las herramientas de sesiones remotas (como la que preparó todo esto), puedes pedir: *"lanza las sesiones de los agentes"*. Claude crea una sesión por misión con su rama y su mensaje de arranque, y puede actuar como orquestador desde esa misma sesión: leer el avance de cada una, mandarles mensajes y avisarte.

### Opción C: en tu computadora (Claude Code en la terminal)

Útil para quien prefiere trabajar en local. Cada agente necesita su propia carpeta para no pisarse:

```bash
# desde la carpeta del repo, en WSL
bash scripts/preparar_entorno.sh                      # una vez (instala la CLI de Stellar, tarda)
git fetch origin
git worktree add ../rounda-m1 -b mision/m1-tiempos-deudas origin/main
cd ../rounda-m1 && claude                              # y pega el mensaje de arranque de M1
```

Dentro de una sesión también puedes llamar a un agente como **subagente** ("usa el agente m3-turnos para diseñar el modo subasta"): Claude Code lee `.claude/agents/` automáticamente. Ojo: un subagente trabaja dentro de la sesión que lo llamó y le devuelve el resultado a ella. Para trabajo largo en paralelo es mejor una sesión por agente (opciones A, B o C).

## 4. Cómo se comunican

| Canal | Quién lo usa | Para qué |
| --- | --- | --- |
| **Issue #4 (tablero)** | Todos los agentes y ustedes | Arranque, estado por hito, preguntas, acuerdos de interfaz. Activa las notificaciones de GitHub en tu celular |
| **PR de cada misión** | Agentes y orquestador | Revisión de código y discusión técnica |
| **La sesión de cada agente** | Ustedes | Responder sus preguntas: escríbele directo en su sesión |
| **Mensajes entre sesiones** | Agentes (si tienen la herramienta) y orquestador | Avisos urgentes, siempre con copia en el tablero |

**Cuando un agente te pregunte**, te dará contexto, opciones y su recomendación:

- Si estás de acuerdo, basta con responder **"Va con tu recomendación"**.
- Si la decisión es reversible, el agente sigue avanzando con su recomendación mientras esperas.
- Si es irreversible (dinero, seguridad, la demo), espera tu respuesta: **revisa el tablero cada pocas horas**.

## 5. Calendario (hora de Costa Rica)

| Cuándo | Qué | Tu parte |
| --- | --- | --- |
| Sáb 3, 10:00 | Diseños en el tablero | Leer y responder preguntas de diseño |
| Sáb 3, 16:00 | M1 listo | — |
| Sáb 3, 20:00 | M1 integrado | **Correr el despliegue** (sección 6) |
| Dom 4, 12:00 | M2 y M3 (MVP) listos | Probar la vista previa |
| Dom 4, 16:00 | M2 + M3 integrados | **Despliegue** |
| Dom 4, 20:00 | M4 (si es viable) | **Despliegue** |
| Dom 4, 22:00 | Paso a producción | **Aprobar el PR `integracion` → `main`**, variables de Vercel, Redeploy |
| Lun 5, 09:00 | Congelamiento | Ensayo, video, pitch |
| Lun 5, 16:00 | Entrega | Stellar Passport, categoría General |

Si algo no llega a tiempo, **no entra**: una demo estable gana a una demo rota.

## 6. Despliegues (tú, en WSL)

Cada vez que el contrato cambia, hay que desplegarlo de nuevo en testnet. Lo haces tú porque en tu WSL están las llaves del emisor de TUSD (las que usa el faucet de Vercel). El orquestador te avisa cuándo.

```bash
cd ~/Safe-Chain
git fetch origin && git checkout integracion && git pull
bash scripts/preparar_entorno.sh      # solo si cambió algo de herramientas
bash scripts/desplegar_testnet.sh     # despliega todo e imprime las direcciones nuevas
```

Copia la salida (las direcciones `C...` son públicas, las llaves `S...` **no**) y pégala en la sesión del orquestador, que actualiza el código y te dice qué cambiar en Vercel.

**Al pasar a producción:** después de fusionar `integracion` → `main`, actualiza las variables de Vercel (Production). Luego, en Deployments, haz **Redeploy del commit correcto** y revisa que el commit sea el de la fusión (ya nos pasó redesplegar uno viejo).

## 7. Problemas comunes

| Problema | Qué hacer |
| --- | --- |
| Un agente lleva rato sin avanzar | Abre su sesión: casi siempre espera una respuesta tuya |
| Dos agentes quieren tocar lo mismo | Lo resuelve el orquestador. Si te pregunta, decide quién va primero |
| La sesión se cerró o el contenedor se reinició | El trabajo pusheado está en su rama. Abre una sesión nueva con el mismo mensaje de arranque y agrega: "retoma tu misión: revisa tu rama, tu PR y el tablero" |
| La primera sesión tarda mucho en arrancar | Es la compilación de la CLI de Stellar (15–20 minutos, una sola vez) |
| El login con Google falla en la vista previa | Falta su dominio en los dominios permitidos de Privy |
| Producción no muestra lo nuevo | Redeploy del commit correcto y revisar las variables de Production |
| Se te acaba el uso del plan | Seis sesiones en paralelo consumen bastante. Prioriza: ORQ, M1, M2, M3; M5 y M4 después |

## 8. Lo que los agentes NO harán sin ti

- Hacer push o merge a `main`.
- Correr el despliegue oficial (necesita tus llaves).
- Cambiar variables de Vercel o dominios de Privy.
- Decidir temas de dinero, seguridad o qué entra a la demo.

Tú tienes la última palabra en todo eso.
