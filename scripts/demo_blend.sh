#!/usr/bin/env bash
# Demo de la tanda CON BLEND (~8 min): colateral real en el pool TestnetV2 de Blend.
# Mismo guion que demo.sh: Ana cobra primero y desaparece, Beto paga tarde.
#
# Variables (todas opcionales):
#   ACTIVO=xlm|usdc         activo de la tanda (por defecto xlm; usdc = USDC de prueba de Blend)
#   ADMIN=admin             cuenta que crea la tanda y cierra las rondas
#   MIEMBROS="ana beto carla"   las tres cuentas que participan (necesitan saldo del activo)
#   CUOTA=100000000         cuota en unidades de 7 decimales (10 XLM o 10 USDC)
#   PERIODO=120             segundos por ronda
#   PRINCIPAL=1             usa el contrato PRINCIPAL (scripts/desplegar_testnet.sh): una tanda en USDC en el
#                           mismo contrato que las de TUSD, con la bóveda de Blend registrada por token (M4).
# Requiere: ACTIVO=<el mismo> bash scripts/desplegar_blend.sh   (o, con PRINCIPAL=1, desplegar_testnet.sh)
# Para USDC, cada miembro necesita USDC de prueba: el guion se los pide al faucet de Blend si les falta.
set -euo pipefail
ACTIVO="${ACTIVO:-xlm}"
if [ "${PRINCIPAL:-0}" = "1" ]; then
  source scripts/.contratos
  [ -n "${ADAPTADOR_USDC:-}" ] || { echo "El contrato principal no tiene bóveda de Blend (¿SIN_BLEND=1?)"; exit 1; }
  ACTIVO=usdc; SIMBOLO=USDC
  TANDA_BLEND=$TANDA; TOKEN=$USDC; ADAPTADOR=$ADAPTADOR_USDC; POOL=$POOL_BLEND
else
  case "$ACTIVO" in
    xlm)  ARCHIVO=scripts/.contratos_blend; SIMBOLO=XLM ;;
    usdc) ARCHIVO=scripts/.contratos_blend_usdc; SIMBOLO=USDC ;;
    *) echo "ACTIVO debe ser xlm o usdc"; exit 1 ;;
  esac
  source "$ARCHIVO"
  TOKEN="${TOKEN:-${XLM:-}}" # compatibilidad con archivos de la versión anterior
fi
ADMIN="${ADMIN:-admin}"
read -r ANA BETO CARLA <<<"${MIEMBROS:-ana beto carla}"
CUOTA="${CUOTA:-100000000}"
PERIODO="${PERIODO:-120}"
NET="--network testnet"
T() { stellar contract invoke --id "$TANDA_BLEND" $NET "$@"; }
dir() { stellar keys address "$1"; }
saldo() { stellar contract invoke --id "$TOKEN" $NET --source "$ADMIN" -- balance --id "$(dir "$1")" | tr -d '"'; }
fmt() { python3 -c "import sys; print(f'{int(sys.argv[1]) / 10**7:,.7f}')" "$1"; }
# Rendimiento real hasta ahora: valor de las participaciones de la tanda en Blend - colateral anotado.
rendimiento() {
  local shares colateral valor
  shares=$(T --source "$ADMIN" -- get_tanda --id "$ID" | jq -r '.shares_boveda')
  colateral=$(T --source "$ADMIN" -- get_miembros --id "$ID" | jq '[.[][1].colateral | tonumber] | add')
  if [ "$shares" -le 0 ]; then echo "   (no queda colateral en Blend)"; return; fi
  valor=$(stellar contract invoke --id "$ADAPTADOR" $NET --source "$ADMIN" -- valor --shares "$shares" | tr -d '"')
  echo "   Colateral en Blend: $(fmt "$colateral") $SIMBOLO · vale hoy $(fmt "$valor") $SIMBOLO · rendimiento real: +$(fmt $((valor - colateral))) $SIMBOLO"
}

if [ "$ACTIVO" = usdc ]; then
  for p in $ANA $BETO $CARLA; do SECRETO="$(stellar keys show "$p")" node scripts/usdc_blend.mjs; done
fi
for p in $ANA $BETO $CARLA; do echo "   saldo inicial $p: $(fmt "$(saldo "$p")") $SIMBOLO"; done

echo "== Crear tanda: 3 miembros, cuota $(fmt "$CUOTA") $SIMBOLO, rondas de $PERIODO s, multa 10%, cobertura 100% =="
ID=$(T --source "$ADMIN" -- crear_tanda --creador "$(dir "$ADMIN")" --token "$TOKEN" \
  --cuota "$CUOTA" --n_miembros 3 --periodo_seg "$PERIODO" --penalidad_bps 1000 --cobertura_bps 10000)
echo "   id = $ID"

echo "== Se unen: el colateral (2, 1 y 1 cuotas) va directo a Blend =="
for p in $ANA $BETO $CARLA; do T --source "$p" -- unirse --id "$ID" --miembro "$(dir "$p")"; done
echo "   bTokens del adaptador en Blend:"
stellar contract invoke --id "$POOL" --source "$ADMIN" $NET -- get_positions --address "$ADAPTADOR"

echo "== Ronda 1: todos pagan; $ANA cobra la bolsa =="
for p in $ANA $BETO $CARLA; do T --source "$p" -- pagar_cuota --id "$ID" --miembro "$(dir "$p")"; done
sleep "$PERIODO"; T --source "$ADMIN" -- cerrar_ronda --id "$ID"
rendimiento

echo "== Ronda 2: $ANA desaparece; su colateral SALE DE BLEND y cubre su cuota =="
for p in $BETO $CARLA; do T --source "$p" -- pagar_cuota --id "$ID" --miembro "$(dir "$p")"; done
sleep "$PERIODO"; T --source "$ADMIN" -- cerrar_ronda --id "$ID"
rendimiento

echo "== Ronda 3: $CARLA a tiempo, $BETO tarde =="
T --source "$CARLA" -- pagar_cuota --id "$ID" --miembro "$(dir "$CARLA")"
sleep $((PERIODO + 10))
T --source "$BETO" -- pagar_cuota --id "$ID" --miembro "$(dir "$BETO")"
T --source "$ADMIN" -- cerrar_ronda --id "$ID"
rendimiento

echo "== Final: se retira todo de Blend con su rendimiento real y se reparte =="
T --source "$ADMIN" -- finalizar --id "$ID"
T --source "$ADMIN" -- get_miembros --id "$ID"
for p in $ANA $BETO $CARLA; do echo "   saldo final $p: $(fmt "$(saldo "$p")") $SIMBOLO"; done
echo "Rendimiento total: mira el evento 'finalizada' (campo rendimiento) en"
echo "   https://stellar.expert/explorer/testnet/contract/$TANDA_BLEND"
[ "$ACTIVO" = xlm ] && echo "(Con XLM, las comisiones de red también restan un poco del saldo de cada cuenta.)"
true
