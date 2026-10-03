#!/usr/bin/env bash
# Demo de la tanda CON BLEND (~8 min): cuota de 10 XLM, colateral real en el pool TestnetV2.
# Mismo guion que demo.sh: Ana cobra primero y desaparece, Beto paga tarde.
# Requiere: bash scripts/desplegar_blend.sh
set -euo pipefail
source scripts/.contratos_blend
NET="--network testnet"
T() { stellar contract invoke --id "$TANDA_BLEND" $NET "$@"; }
dir() { stellar keys address "$1"; }
saldo() { stellar contract invoke --id "$XLM" $NET --source admin -- balance --id "$(dir $1)"; }
PERIODO=120

for p in ana beto carla; do echo "   saldo inicial $p: $(saldo $p) (stroops de XLM)"; done

echo "== Crear tanda: 3 miembros, cuota 10 XLM, rondas de 2 min, multa 10%, cobertura 100% =="
ID=$(T --source admin -- crear_tanda --creador "$(dir admin)" --token "$XLM" \
  --cuota 100000000 --n_miembros 3 --periodo_seg $PERIODO --penalidad_bps 1000 --cobertura_bps 10000)
echo "   id = $ID"

echo "== Se unen: el colateral (20, 10 y 10 XLM) va directo a Blend =="
for p in ana beto carla; do T --source $p -- unirse --id "$ID" --miembro "$(dir $p)"; done
echo "   bTokens del adaptador en Blend:"
stellar contract invoke --id "$POOL" --source admin $NET -- get_positions --address "$ADAPTADOR"

echo "== Ronda 1: todos pagan; Ana cobra 30 XLM =="
for p in ana beto carla; do T --source $p -- pagar_cuota --id "$ID" --miembro "$(dir $p)"; done
sleep $PERIODO; T --source admin -- cerrar_ronda --id "$ID"

echo "== Ronda 2: Ana desaparece; su colateral SALE DE BLEND y cubre su cuota =="
for p in beto carla; do T --source $p -- pagar_cuota --id "$ID" --miembro "$(dir $p)"; done
sleep $PERIODO; T --source admin -- cerrar_ronda --id "$ID"

echo "== Ronda 3: Carla a tiempo, Beto tarde =="
T --source carla -- pagar_cuota --id "$ID" --miembro "$(dir carla)"
sleep $((PERIODO + 10))
T --source beto -- pagar_cuota --id "$ID" --miembro "$(dir beto)"
T --source admin -- cerrar_ronda --id "$ID"

echo "== Final: se retira todo de Blend con su rendimiento real y se reparte =="
T --source admin -- finalizar --id "$ID"
T --source admin -- get_miembros --id "$ID"
for p in ana beto carla; do echo "   saldo final $p: $(saldo $p)"; done
echo "(Las comisiones de red en XLM también restan un poco: compara contra el rendimiento del evento 'finalizada'.)"
