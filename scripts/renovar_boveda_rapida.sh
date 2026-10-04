#!/usr/bin/env bash
# Cambia la bóveda rápida (la acelerada de las tandas de prueba) por una recién desplegada.
#
# Por qué: el precio de la bóveda simulada crece en línea recta desde que se despliega, así que una bóveda
# acelerada "vieja" rinde cada vez menos en una demo de 5 minutos (con 1 día de edad, unas 8 veces menos).
# Córrelo poco antes de la presentación: las tandas de prueba que se creen después usan la nueva y las que
# ya existen siguen con la suya (cada tanda guarda su bóveda al crearse). No toca la bóveda principal.
#
# Requiere haber corrido antes scripts/desplegar_testnet.sh en esta máquina (usa las cuentas `admin` y
# `emisor`, porque hay que fondear la bóveda nueva con TUSD de prueba).
# Uso (desde la carpeta raíz del proyecto):   bash scripts/renovar_boveda_rapida.sh
#   ACELERADOR_RAPIDA  por defecto 52560 (1 minuto = 36,5 días de intereses)
set -euo pipefail

if [ ! -f scripts/.contratos ]; then
  echo "Falta scripts/.contratos: corre primero  bash scripts/desplegar_testnet.sh" >&2
  exit 1
fi
source scripts/.contratos
NET="--network testnet"

[ -f target/wasm32v1-none/release/boveda_simulada.wasm ] || stellar contract build

echo "== Bóveda rápida nueva (ACELERADOR_RAPIDA=${ACELERADOR_RAPIDA:-52560}) =="
NUEVA=$(stellar contract deploy --wasm target/wasm32v1-none/release/boveda_simulada.wasm \
  --source admin $NET -- --token "$TOKEN" --apr_bps 500 --acelerador "${ACELERADOR_RAPIDA:-52560}")
echo "   BOVEDA_RAPIDA=$NUEVA"
stellar contract invoke --id "$TOKEN" --source emisor $NET -- mint --to "$NUEVA" --amount 100000000000
# (La CLI recibe los argumentos opcionales como JSON: por eso la dirección va entre comillas.)
stellar contract invoke --id "$TANDA" --source admin $NET -- configurar_boveda_rapida --boveda "\"$NUEVA\""

# Guardar la nueva dirección (la anterior queda en el historial de la terminal; sus tandas siguen bien).
if grep -q '^BOVEDA_RAPIDA=' scripts/.contratos; then
  sed -i.bak "s|^BOVEDA_RAPIDA=.*|BOVEDA_RAPIDA=$NUEVA|" scripts/.contratos && rm -f scripts/.contratos.bak
else
  echo "BOVEDA_RAPIDA=$NUEVA" >> scripts/.contratos
fi
echo "Listo: las tandas de prueba nuevas usan la bóveda $NUEVA. La web no necesita cambios."
