# Guion de la demo (abierta al jurado)

**Idea:** el equipo corre una tanda en vivo mientras se proyecta la web; el jurado mira, y después puede probarla con su propia billetera (una cuenta de Google o Freighter, en testnet). Dura unos **5 minutos**: tres rondas de 1 minuto más lo que tarda la red en confirmar cada paso.

> Solo para testnet. Todo el dinero es de mentira y el contrato no está auditado.

## Cómo funciona la demo

Un script hace de **Ana, Beto y Carla** desde la terminal, así nadie pierde tiempo cambiando de cuenta en Freighter. La web, proyectada en `#/demo/<id>`, no necesita billetera: cuenta en vivo qué pasa, con una barra de garantía por persona y una línea de tiempo con los momentos clave resaltados.

| Qué pasa | Qué se ve en pantalla | Qué decir |
| --- | --- | --- |
| **Crear y unirse** (~0:30) | "Se creó la tanda", Ana (200), Beto (100) y Carla (100) se unen | "Quien cobra primero deja más garantía, porque después de cobrar todavía debe cuotas. Por eso nadie puede cobrar y desaparecer." |
| **Ronda 1** (~1:50) | Todos pagan, "Ana cobró 300 TUSD" | "Todos pagan, y la bolsa es para Ana." |
| **Ronda 2** (~3:10) | Ana **no paga**. Aparece resaltado: *"Ana no pagó: su garantía cubrió 100 TUSD"*. La barra de Ana baja a la mitad | **El momento clave.** "Ana desapareció, pero su garantía pagó por ella. Beto cobra completo y nadie pierde." |
| **Ronda 3** (~4:40) | Beto paga **tarde** (se anota una multa); Carla cobra | "Pagar tarde tiene costo: una multa que se reparte entre quienes cumplieron." |
| **Final** (~5:00) | "Resultados finales": cuánto recibió cada quien, rendimiento y multas | "La garantía generó rendimiento mientras esperaba. Ana terminó sin ganar nada por haber huido." |

Los tiempos marcan cuándo termina cada paso y son aproximados: dependen de la red (cada transacción tarda unos 5 a 6 segundos). Ensáyalo para calibrarlos.

### Variante con deuda (`DEUDA=1`)

Muestra que en Rounda **un moroso puede ponerse al día**. La tanda usa la garantía mínima (cada quien deja una cuota), así la de Ana se acaba antes:

| Qué pasa | Qué se ve en pantalla | Qué decir |
| --- | --- | --- |
| **Ronda 2** | *"Ana no pagó: su garantía cubrió 100 TUSD"* | "Su garantía alcanzó para esta ronda…" |
| **Ronda 3** | *"Ana quedó en mora"* y *"Carla cobró 200 TUSD"* | "…pero ya no le queda garantía: Carla cobró 100 de menos." |
| **Ana vuelve** | Resaltados: *"Ana pagó 100 TUSD y saldó su deuda"* y *"Carla recibió los 100 TUSD que le faltaban"* | **El momento clave.** "La deuda no se pierde: cuando Ana paga, el dinero le llega a quien cobró de menos, y Ana vuelve a estar al día. También lo podría pagar un familiar." |

```bash
DEUDA=1 WEB=https://tu-sitio.vercel.app PAUSAR=1 bash scripts/demo.sh
```

Desde la web, quien está en mora ve el botón **"Pagar mi deuda"** con cuánto debe, a quién le llega y qué recupera.

### Cierre: el historial crediticio (misión M2)

Al terminar, `demo.sh` imprime el puntaje de cada persona y el enlace a su página pública (`#/historial/<dirección>`). En la demo normal: Carla 80 (pagó todo a tiempo), Beto 48 (un pago tarde), Ana 5 (su garantía cubrió dos cuotas).

| Qué se ve | Qué decir |
| --- | --- |
| La página de Carla: puntaje, nivel y "3 cuotas pagadas a tiempo, 1 tanda terminada sin atrasos" | "Cada cuota que pagas a tiempo queda escrita en Stellar para siempre. Tu historial es tuyo, cualquiera puede verificarlo y nadie lo puede borrar." |
| En otra tanda, junto a cada persona, su insignia (Bronce, Plata, Oro) | "Con buen historial entras a tandas exigentes y dejas menos garantía: hasta la mitad con nivel Oro." |
| Al unirse a una tanda con descuento: *"Por tu historial Bronce, tu garantía baja de 500 a 450 TUSD"* | "Esto resuelve la paradoja del crédito: quien cumple necesita menos dinero inmovilizado." |

## Antes de la demo (una hora antes)

1. **¿Testnet sigue con el contrato?** Stellar reinicia testnet cada tanto. Abre `<tu-web>/#/estado`: debe decir *"Todo listo para la demo"*. Si el contrato no responde, hay que volver a desplegar (ver "Si algo falla").
2. **Faucet** (para que el jurado consiga TUSD): en Vercel deben estar `FAUCET_ISSUER_SECRET`, `VITE_TANDA_ID`, `VITE_TOKEN_ID` y `VITE_NOMBRES`. `#/estado` lo comprueba. Pruébalo con una cuenta nueva de Freighter: activar con Friendbot, aceptar TUSD y pedir TUSD.
3. **Bóveda con fondos:** paga los intereses con su propio saldo. `#/estado` avisa si le falta.
4. **Bóveda rápida nueva (1 a 2 horas antes):** la acelerada rinde menos cuanto más vieja es (con un día de edad, unas 8 veces menos). Cámbiala por una nueva con `bash scripts/renovar_boveda_rapida.sh` (en la máquina que tiene la cuenta `emisor`). Las tandas que ya existen no se afectan.
5. **Ensayo completo** (30 minutos antes), tal como será la demo real:
   ```bash
   WEB=https://tu-sitio.vercel.app PAUSAR=1 bash scripts/demo.sh
   ```
   Abre el enlace que imprime (`.../#/demo/<id>`), pulsa ENTER y mira que todo salga. Graba la pantalla: sirve de respaldo.
6. En el proyector, abre la web en pantalla completa (F11) y pon el zoom del navegador en 100% o 110%.

## Durante la demo

1. En la terminal: `WEB=https://tu-sitio.vercel.app PAUSAR=1 bash scripts/demo.sh`
2. El script crea la tanda e imprime el enlace `…/#/demo/<id>`. Ábrelo en el proyector (así queda fijo en esa tanda aunque el jurado cree otras).
3. Pulsa ENTER y cuenta la historia siguiendo la tabla de arriba.

## Demo de turnos (opcional): quién cobra primero lo decide el grupo

Para mostrar los mecanismos de turnos, en otra terminal (unos 4 minutos por modo; imprime el enlace `…/#/tanda/<id>` de cada tanda):

```bash
WEB=https://tu-sitio.vercel.app PAUSAR=1 MODO=subasta bash scripts/demo_turnos.sh   # o sorteo, precio, intercambio, todos
```

| Modo | Qué se ve | Qué decir |
| --- | --- | --- |
| **Precio por turno** | Carla elige el turno 1 y cobra 276; Ana elige el 3 y cobra 324 | "Quien tiene prisa paga, quien espera gana. Lo que pagó Carla lo ganó Ana: el contrato no se queda con nada. Así funciona MoneyFellows, con 8,5 millones de usuarios en Egipto." |
| **Subasta** | Beto ofrece 5 %, Carla 10 % y gana: "cada uno de los demás recibió 15 TUSD en su garantía" | "Cada ronda gana quien más necesita el dinero, y paga a los demás por adelantarse. Son los chit funds de la India, pero sin administrador." |
| **Sorteo** | "El contrato sorteó el orden de cobro" | "Nadie tiene ventaja por llegar primero. El sorteo lo hace la red." |
| **Intercambio** | "Carla y Beto cambiaron de turno": Carla le pagó 10 TUSD | "Si a alguien le surge una emergencia, negocia el turno con otro, sin intermediarios." |

Si preguntan por la garantía en el sorteo o la subasta: "Como el turno no se sabe al unirse, todos dejan una cuota. A quien cobra primero se le aparta de su bolsa el resto de su garantía, y lo recupera al final con rendimiento. Es la misma garantía de siempre, sin pedir todo por adelantado."

## Que el jurado lo pruebe (solo Freighter)

Quien llegue por el enlace de la web verá primero la landing de Rounda; con **Abrir la app** entra al lobby (`#/tandas`) y ahí está la guía **"Pruébalo en 4 pasos"**: instalar Freighter, ponerla en Testnet, conectar y conseguir TUSD. Si ya tienen Freighter, son dos clics.

Para que puedan **unirse** a una tanda real, deja una abierta con un lugar libre (después de la demo, o en otra terminal):

```bash
source scripts/.contratos
T() { stellar contract invoke --id "$TANDA" --network testnet "$@"; }
ID=$(T --source admin -- crear_tanda --creador "$(stellar keys address admin)" --token "$TOKEN" \
  --cuota 1000000000 --n_miembros 3 --periodo_seg 60 --penalidad_bps 1000 --cobertura_bps 10000)
for p in ana beto; do T --source $p -- unirse --id "$ID" --miembro "$(stellar keys address $p)"; done
echo "Tanda abierta para el jurado: $ID  (entran 100 TUSD de garantía)"
```

La persona del jurado entra como tercera, la tanda arranca, y desde la web puede pagar su cuota y cerrar la ronda con el botón. También puede **crear su propia tanda** desde `#/crear`.

## Si algo falla

| Síntoma | Qué hacer |
| --- | --- |
| `#/estado` dice que el contrato no responde | Testnet se reinició. `bash scripts/desplegar_testnet.sh` (unos minutos) escribe `web/.env.local` y **imprime las variables para Vercel**: pégalas allí y vuelve a desplegar |
| Los nombres salen como `GADM…TVPD` en vez de Ana | Falta `VITE_NOMBRES` en Vercel (lo imprime el script de despliegue) |
| El script se corta a la mitad | Corre `T --source admin -- cerrar_ronda --id <id>` (o `finalizar`) a mano, o simplemente vuelve a correr `demo.sh`: crea una tanda nueva y `#/demo` se va sola a la que está en curso |
| Freighter da problemas | La demo proyectada **no usa billetera**: sigue igual. Solo se afecta la parte de que el jurado pruebe |
| La pantalla va lenta | Recarga la página. El RPC público tiene límites de uso; no abras la demo en muchas pestañas |
| Fondos de la bóveda bajos | `stellar contract invoke --id $TOKEN --source emisor --network testnet -- mint --to $BOVEDA --amount 100000000000` (10 000 TUSD; para la rápida, `--to $BOVEDA_RAPIDA`). Si se agotan, la bóveda no falla: solo deja de dar rendimiento |
| Todo falló | Muestra la grabación del ensayo |

## Qué decir si preguntan

- **¿Es dinero real?** No. Es testnet con TUSD de prueba.
- **¿Y el rendimiento?** La bóveda es simulada (misma interfaz que tendría un adaptador a Blend, que está planeado). En la tanda de la demo (rondas de 1 minuto) el tiempo corre más rápido para que se note; una tanda real de semanas o meses rinde 5 % anual, al ritmo de la vida real.
- **¿Funciona para una tanda de verdad, de meses?** Sí: rondas de hasta 3 meses y tandas de hasta un año o más, con fechas de pago fijas. El contrato renueva solo sus datos en la red para que nada se archive a mitad de la tanda.
- **¿Y si alguien queda en mora?** Puede pagar su deuda cuando quiera (o un familiar por él). El dinero le llega a quien cobró de menos y la persona vuelve a estar al día.
- **¿Qué pasa si alguien no paga?** Su garantía cubre su cuota. Si no alcanza, queda en mora y su parte se reparte entre quienes cumplieron.
- **¿Qué es el historial crediticio?** Un contrato aparte que anota cada cuota pagada, atraso y deuda saldada de cada dirección. Empieza en cero, lo negativo no se borra, nadie (ni nosotros) puede editarlo, y solo guarda direcciones, ningún dato personal. Quien cumple sube de nivel y recibe descuento de garantía en las tandas que lo ofrezcan.
- **¿No se puede hacer trampa con billeteras propias?** Una billetera nueva empieza en cero y el cero no da beneficios. Solo suman tandas con cuota de 10 TUSD o más, con máximo 150 puntos por tanda: llegar a Oro exige al menos 4 tandas completas con dinero inmovilizado.
- **¿Está auditado?** No. Es un prototipo de hackathon.
- **¿Quién puede cerrar las rondas?** Cualquiera: así nadie puede bloquear la tanda.
