#!/usr/bin/env bash
# Despliega la versión CON BLEND: un adaptador conectado al pool real TestnetV2 de Blend
# y una tanda nueva que guarda el colateral en Blend (rendimiento REAL).
# NO toca la tanda de TUSD ya desplegada: las dos conviven.
#
# Activos (variable ACTIVO):
#   xlm  (por defecto) XLM nativo: gratis con Friendbot, sin trustline.
#   usdc               USDC de prueba de Blend: lo regala el faucet de Blend (ver docs/blend.md).
#
# Requiere la CLI de Stellar y una cuenta "admin" con XLM (la crea scripts/desplegar_testnet.sh,
# o: stellar keys generate admin --network testnet --fund).
# Uso (desde la raíz del proyecto):
#   bash scripts/desplegar_blend.sh                 # XLM
#   ACTIVO=usdc bash scripts/desplegar_blend.sh     # USDC de Blend
#   ADMIN=otra_cuenta bash scripts/desplegar_blend.sh
set -euo pipefail
NET="--network testnet"
ACTIVO="${ACTIVO:-xlm}"
ADMIN="${ADMIN:-admin}"

# Direcciones oficiales de Blend en testnet (blend-utils/testnet.contracts.json)
POOL=CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF   # pool TestnetV2
case "$ACTIVO" in
  xlm)  TOKEN=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC; SALIDA=scripts/.contratos_blend ;;   # XLM nativo (SAC)
  usdc) TOKEN=CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU; SALIDA=scripts/.contratos_blend_usdc ;; # USDC:GATALTGT...F5V56
  *) echo "ACTIVO debe ser xlm o usdc"; exit 1 ;;
esac

echo "== 1. Compilar contratos =="
stellar contract build >/dev/null

echo "== 2. Verificar que el pool de Blend responde y acepta el activo =="
stellar contract invoke --id "$POOL" --source "$ADMIN" $NET -- get_reserve --asset "$TOKEN" >/dev/null
echo "   Pool TestnetV2 OK ($ACTIVO)"

echo "== 3. Desplegar el adaptador de Blend (pool + $ACTIVO) =="
# El constructor lee la reserva del pool: si el activo no es una reserva, el despliegue falla.
ADAPTADOR=$(stellar contract deploy --wasm target/wasm32v1-none/release/adaptador_blend.wasm \
  --source "$ADMIN" $NET -- --pool "$POOL" --token "$TOKEN")
echo "   ADAPTADOR=$ADAPTADOR"

echo "== 4. Desplegar una tanda nueva que usa el adaptador como bóveda =="
TANDA_BLEND=$(stellar contract deploy --wasm target/wasm32v1-none/release/tanda.wasm --source "$ADMIN" $NET)
stellar contract invoke --id "$TANDA_BLEND" --source "$ADMIN" $NET -- inicializar \
  --admin "$(stellar keys address "$ADMIN")" --boveda "$ADAPTADOR" >/dev/null
echo "   TANDA_BLEND=$TANDA_BLEND"

cat > "$SALIDA" <<FIN
ACTIVO=$ACTIVO
POOL=$POOL
TOKEN=$TOKEN
ADAPTADOR=$ADAPTADOR
TANDA_BLEND=$TANDA_BLEND
FIN
echo "Listo. Direcciones guardadas en $SALIDA"
echo "Posición del adaptador en Blend: https://stellar.expert/explorer/testnet/contract/$ADAPTADOR"
