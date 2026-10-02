#!/usr/bin/env bash
# Corre el guion de la demo en testnet desde la terminal (~8 minutos).
# Sirve para grabar el video si la interfaz falla, y para probar todo de punta a punta.
# Requiere haber corrido antes:  bash scripts/desplegar_testnet.sh
set -euo pipefail
source scripts/.contratos
NET="--network testnet"
T() { stellar contract invoke --id "$TANDA" $NET "$@"; }
saldo() { stellar contract invoke --id "$TOKEN" $NET --source admin -- balance --id "$(stellar keys address $1)"; }
PERIODO=120

echo "== Crear tanda: 3 miembros, cuota 100 TUSD, rondas de 2 min, multa 10%, cobertura 100% =="
ID=$(T --source admin -- crear_tanda --creador "$(stellar keys address admin)" --token "$TOKEN" \
  --cuota 1000000000 --n_miembros 3 --periodo_seg $PERIODO --penalidad_bps 1000 --cobertura_bps 10000)
echo "   id = $ID"

echo "== Se unen Ana (turno 1, colateral 200), Beto y Carla (colateral 100) =="
for p in ana beto carla; do T --source $p -- unirse --id "$ID" --miembro "$(stellar keys address $p)"; done

echo "== Ronda 1: todos pagan; Ana cobra 300 =="
for p in ana beto carla; do T --source $p -- pagar_cuota --id "$ID" --miembro "$(stellar keys address $p)"; done
sleep $PERIODO; T --source admin -- cerrar_ronda --id "$ID"

echo "== Ronda 2: Ana desaparece. Su colateral cubre su cuota; Beto cobra 300 completos =="
for p in beto carla; do T --source $p -- pagar_cuota --id "$ID" --miembro "$(stellar keys address $p)"; done
sleep $PERIODO; T --source admin -- cerrar_ronda --id "$ID"

echo "== Ronda 3: Carla paga a tiempo; Beto paga TARDE; Carla cobra 300 =="
T --source carla -- pagar_cuota --id "$ID" --miembro "$(stellar keys address carla)"
sleep $((PERIODO + 10))
T --source beto -- pagar_cuota --id "$ID" --miembro "$(stellar keys address beto)"
T --source admin -- cerrar_ronda --id "$ID"

echo "== Final: devolver colateral + rendimiento, repartir multas =="
T --source admin -- finalizar --id "$ID"
T --source admin -- get_miembros --id "$ID"
for p in ana beto carla; do echo "   saldo $p: $(saldo $p)  (empezó con 10000000000)"; done
