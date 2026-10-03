#!/usr/bin/env bash
# Despliega la versión CON BLEND: un adaptador conectado al pool real TestnetV2 de Blend
# y una tanda nueva que usa XLM (gratis con Friendbot) y guarda el colateral en Blend.
# NO toca la tanda de TUSD ya desplegada: las dos conviven.
#
# Requiere haber corrido antes scripts/desplegar_testnet.sh (cuentas admin, ana, beto, carla).
# Uso (desde la raíz del proyecto):   bash scripts/desplegar_blend.sh
set -euo pipefail
NET="--network testnet"

# Direcciones oficiales de Blend en testnet (blend-utils/testnet.contracts.json)
POOL=CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF   # pool TestnetV2
XLM=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC    # XLM nativo (SAC)

echo "== 1. Compilar contratos =="
stellar contract build

echo "== 2. Verificar que el pool de Blend responde =="
stellar contract invoke --id "$POOL" --source admin $NET -- get_reserve --asset "$XLM" >/dev/null
echo "   Pool TestnetV2 OK"

echo "== 3. Desplegar el adaptador de Blend (pool + XLM) =="
ADAPTADOR=$(stellar contract deploy --wasm target/wasm32v1-none/release/adaptador_blend.wasm \
  --source admin $NET -- --pool "$POOL" --token "$XLM")
echo "   ADAPTADOR=$ADAPTADOR"

echo "== 4. Desplegar una tanda nueva que usa el adaptador como bóveda =="
TANDA_BLEND=$(stellar contract deploy --wasm target/wasm32v1-none/release/tanda.wasm --source admin $NET)
stellar contract invoke --id "$TANDA_BLEND" --source admin $NET -- inicializar \
  --admin "$(stellar keys address admin)" --boveda "$ADAPTADOR"
echo "   TANDA_BLEND=$TANDA_BLEND"

cat > scripts/.contratos_blend <<FIN
POOL=$POOL
XLM=$XLM
ADAPTADOR=$ADAPTADOR
TANDA_BLEND=$TANDA_BLEND
FIN
echo "Listo. Direcciones guardadas en scripts/.contratos_blend"
