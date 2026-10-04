#!/usr/bin/env bash
# Despliega todo en testnet: token TUSD, bóvedas simuladas y contrato de la tanda.
# Crea 5 cuentas de prueba (admin, emisor, ana, beto, carla) con XLM de Friendbot.
# Al final guarda las direcciones en scripts/.contratos para que demo.sh las use.
#
# Uso (desde la carpeta raíz del proyecto):   bash scripts/desplegar_testnet.sh
#
# Bóvedas (misión M1, docs/tiempos-y-deudas.md):
#   - principal: rinde 5 % anual al ritmo de la vida real (ACELERADOR=1). La usan las tandas de días,
#     semanas o meses: con el tiempo acelerado, una tanda de meses dejaría a la bóveda sin fondos.
#   - rápida: acelerada (ACELERADOR_RAPIDA=52560: 1 minuto = 36,5 días) solo para tandas de prueba con
#     rondas de 10 minutos o menos, para que el rendimiento se note en la demo. Para no crearla:
#     SIN_BOVEDA_RAPIDA=1. Para cambiarla por una nueva antes de la presentación (la acelerada rinde
#     menos cuanto más vieja es): bash scripts/renovar_boveda_rapida.sh
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

echo "== 6. Bóveda principal: 5% anual al ritmo real (ACELERADOR=${ACELERADOR:-1}) =="
BOVEDA=$(stellar contract deploy --wasm target/wasm32v1-none/release/boveda_simulada.wasm \
  --source admin $NET -- --token "$TOKEN" --apr_bps 500 --acelerador "${ACELERADOR:-1}")
echo "   BOVEDA=$BOVEDA"
# La bóveda necesita fondos para pagar intereses (los contratos no necesitan trustline).
stellar contract invoke --id "$TOKEN" --source emisor $NET -- mint --to "$BOVEDA" --amount 100000000000

BOVEDA_RAPIDA=""
if [ "${SIN_BOVEDA_RAPIDA:-0}" != "1" ]; then
  echo "== 6b. Bóveda rápida para tandas de prueba (ACELERADOR_RAPIDA=${ACELERADOR_RAPIDA:-52560}) =="
  BOVEDA_RAPIDA=$(stellar contract deploy --wasm target/wasm32v1-none/release/boveda_simulada.wasm \
    --source admin $NET -- --token "$TOKEN" --apr_bps 500 --acelerador "${ACELERADOR_RAPIDA:-52560}")
  echo "   BOVEDA_RAPIDA=$BOVEDA_RAPIDA"
  stellar contract invoke --id "$TOKEN" --source emisor $NET -- mint --to "$BOVEDA_RAPIDA" --amount 100000000000
fi

echo "== 7. Contrato de la tanda =="
TANDA=$(stellar contract deploy --wasm target/wasm32v1-none/release/tanda.wasm --source admin $NET)
echo "   TANDA=$TANDA"
stellar contract invoke --id "$TANDA" --source admin $NET -- inicializar \
  --admin "$(stellar keys address admin)" --boveda "$BOVEDA"
if [ -n "$BOVEDA_RAPIDA" ]; then
  # Las tandas con rondas de hasta 10 minutos usan la bóveda rápida (cada tanda guarda la suya al crearse).
  stellar contract invoke --id "$TANDA" --source admin $NET -- configurar_boveda_rapida --boveda "$BOVEDA_RAPIDA"
fi

cat > scripts/.contratos <<EOF
TOKEN=$TOKEN
BOVEDA=$BOVEDA
BOVEDA_RAPIDA=$BOVEDA_RAPIDA
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
