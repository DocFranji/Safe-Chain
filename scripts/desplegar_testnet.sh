#!/usr/bin/env bash
# Despliega todo en testnet: token TUSD, bóveda simulada y contrato de la tanda.
# Crea 5 cuentas de prueba (admin, emisor, ana, beto, carla) con XLM de Friendbot.
# Al final guarda las direcciones en scripts/.contratos para que demo.sh las use.
#
# Uso (desde la carpeta raíz del proyecto):   bash scripts/desplegar_testnet.sh
set -euo pipefail
NET="--network testnet"

echo "== 1. Cuentas de prueba (con XLM gratis de Friendbot) =="
for k in admin emisor ana beto carla; do
  stellar keys generate "$k" $NET --fund 2>/dev/null || echo "   ($k ya existía)"
done

echo "== 2. Compilar los contratos a WASM =="
stellar contract build

echo "== 3. Token de prueba TUSD (Stellar Asset Contract) =="
TOKEN=$(stellar contract asset deploy --asset "TUSD:$(stellar keys address emisor)" --source emisor $NET 2>/dev/null \
  || stellar contract asset id --asset "TUSD:$(stellar keys address emisor)" $NET)
echo "   TOKEN=$TOKEN"

echo "== 4. Trustlines: las cuentas normales (G...) deben 'aceptar' TUSD antes de recibirlo =="
for p in ana beto carla; do
  stellar tx new change-trust --source "$p" --line "TUSD:$(stellar keys address emisor)" $NET || true
done

echo "== 5. Repartir 1 000 TUSD a cada uno (TUSD tiene 7 decimales) =="
for p in ana beto carla; do
  stellar contract invoke --id "$TOKEN" --source emisor $NET -- mint --to "$(stellar keys address $p)" --amount 10000000000
done

echo "== 6. Bóveda simulada: 5% anual, acelerada para la demo (ACELERADOR=${ACELERADOR:-52560}) =="
BOVEDA=$(stellar contract deploy --wasm target/wasm32v1-none/release/boveda_simulada.wasm \
  --source admin $NET -- --token "$TOKEN" --apr_bps 500 --acelerador "${ACELERADOR:-52560}")
echo "   BOVEDA=$BOVEDA"
# La bóveda necesita fondos para pagar intereses (los contratos no necesitan trustline).
stellar contract invoke --id "$TOKEN" --source emisor $NET -- mint --to "$BOVEDA" --amount 100000000000

echo "== 7. Contrato de la tanda =="
TANDA=$(stellar contract deploy --wasm target/wasm32v1-none/release/tanda.wasm --source admin $NET)
echo "   TANDA=$TANDA"
stellar contract invoke --id "$TANDA" --source admin $NET -- inicializar \
  --admin "$(stellar keys address admin)" --boveda "$BOVEDA"

cat > scripts/.contratos <<EOF
TOKEN=$TOKEN
BOVEDA=$BOVEDA
TANDA=$TANDA
EOF
echo "Listo. Direcciones guardadas en scripts/.contratos"

# --- Para la web ---------------------------------------------------------------------------
# Si vuelven a desplegar (por ejemplo, porque testnet se reinició), las direcciones cambian. Esto deja la web al día
# sin editar código: los nombres (Ana, Beto, Carla) y los contratos salen de aquí.
NOMBRES="{\"$(stellar keys address ana)\":\"Ana\",\"$(stellar keys address beto)\":\"Beto\",\"$(stellar keys address carla)\":\"Carla\"}"
if [ -d web ]; then
  cat > web/.env.local <<ENV
VITE_TANDA_ID=$TANDA
VITE_TOKEN_ID=$TOKEN
VITE_NOMBRES='$NOMBRES'
ENV
  echo "   web/.env.local actualizado (reinicia 'npm run dev' si estaba corriendo)"
fi
echo
echo "Si la web está en Vercel: Settings -> Environment Variables, pongan estas y vuelvan a desplegar:"
echo "   VITE_TANDA_ID=$TANDA"
echo "   VITE_TOKEN_ID=$TOKEN"
echo "   VITE_NOMBRES=$NOMBRES"
echo "   FAUCET_ISSUER_SECRET=<la llave del emisor: stellar keys show emisor>"
