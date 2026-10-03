# Guion de la demo (abierta al jurado)

**Idea:** el equipo corre una tanda en vivo mientras se proyecta la web; el jurado mira, y después puede probarla con su propia billetera (Freighter, en testnet). Dura unos **5 minutos**: tres rondas de 1 minuto más lo que tarda la red en confirmar cada paso.

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

## Antes de la demo (una hora antes)

1. **¿Testnet sigue con el contrato?** Stellar reinicia testnet cada tanto. Abre `<tu-web>/#/estado`: debe decir *"Todo listo para la demo"*. Si el contrato no responde, hay que volver a desplegar (ver "Si algo falla").
2. **Faucet** (para que el jurado consiga TUSD): en Vercel deben estar `FAUCET_ISSUER_SECRET`, `VITE_TANDA_ID`, `VITE_TOKEN_ID` y `VITE_NOMBRES`. `#/estado` lo comprueba. Pruébalo con una cuenta nueva de Freighter: activar con Friendbot, aceptar TUSD y pedir TUSD.
3. **Bóveda con fondos:** paga los intereses con su propio saldo. `#/estado` avisa si le falta.
4. **Ensayo completo** (30 minutos antes), tal como será la demo real:
   ```bash
   WEB=https://tu-sitio.vercel.app PAUSAR=1 bash scripts/demo.sh
   ```
   Abre el enlace que imprime (`.../#/demo/<id>`), pulsa ENTER y mira que todo salga. Graba la pantalla: sirve de respaldo.
5. En el proyector, abre la web en pantalla completa (F11) y pon el zoom del navegador en 100% o 110%.

## Durante la demo

1. En la terminal: `WEB=https://tu-sitio.vercel.app PAUSAR=1 bash scripts/demo.sh`
2. El script crea la tanda e imprime el enlace `…/#/demo/<id>`. Ábrelo en el proyector (así queda fijo en esa tanda aunque el jurado cree otras).
3. Pulsa ENTER y cuenta la historia siguiendo la tabla de arriba.

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
| Fondos de la bóveda bajos | `stellar contract invoke --id $TOKEN --source emisor --network testnet -- mint --to $BOVEDA --amount 100000000000` (10 000 TUSD) |
| Todo falló | Muestra la grabación del ensayo |

## Qué decir si preguntan

- **¿Es dinero real?** No. Es testnet con TUSD de prueba.
- **¿Y el rendimiento?** La bóveda es simulada (misma interfaz que tendría un adaptador a Blend, que está planeado). En la demo el tiempo corre más rápido.
- **¿Qué pasa si alguien no paga?** Su garantía cubre su cuota. Si no alcanza, queda en mora y su parte se reparte entre quienes cumplieron.
- **¿Está auditado?** No. Es un prototipo de hackathon.
- **¿Quién puede cerrar las rondas?** Cualquiera: así nadie puede bloquear la tanda.
