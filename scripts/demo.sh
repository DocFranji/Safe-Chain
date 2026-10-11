#!/usr/bin/env bash
# Corre el guion de la demo en testnet desde la terminal (~5 minutos: rondas de 1 minuto más lo que tarda la red).
# Hace de Ana, Beto y Carla: mientras tanto se proyecta la web en  #/demo/<id>  (el script imprime el enlace).
# Sirve también para grabar el video si la interfaz falla, y para probar todo de punta a punta.
#
# Requiere haber corrido antes:  bash scripts/desplegar_testnet.sh
#
# Variables opcionales (ejemplo:  WEB=https://tanda.vercel.app PAUSAR=1 bash scripts/demo.sh):
#   WEB       dirección de la web, para imprimir el enlace completo de la demo (por defecto, la de `npm run dev`)
#   PAUSAR=1  espera un ENTER antes de empezar, para abrir primero la pantalla proyectada
#   PERIODO   segundos que dura cada ronda (por defecto 60, el mínimo que acepta el contrato)
#   DEUDA=1   variante con deuda (misión M1): garantía mínima (una cuota), que no alcanza para las 2 cuotas que
#             le quedan a Ana: desde la ronda 2 queda en mora y su garantía no se usa (v5). Beto y Carla cobran
#             100 de menos; al final Ana vuelve, paga sus 200 y ellos reciben lo que les faltaba
set -euo pipefail

if [ ! -f scripts/.contratos ]; then
  echo "Falta scripts/.contratos: corre primero  bash scripts/desplegar_testnet.sh  (desde la carpeta raíz del proyecto)." >&2
  exit 1
fi
source scripts/.contratos
NET="--network testnet"
T() { stellar contract invoke --id "$TANDA" $NET "$@"; }
saldo() { stellar contract invoke --id "$TOKEN" $NET --source admin -- balance --id "$(stellar keys address "$1")"; }
PERIODO="${PERIODO:-60}"
WEB="${WEB:-http://localhost:5173}"

if [ "$PERIODO" -lt 60 ]; then
  echo "PERIODO=$PERIODO es muy corto: el contrato exige al menos 60 segundos por ronda." >&2
  exit 1
fi

# Cierra la ronda actual. Si la red todavía no la ve vencida (puede ir unos segundos atrasada), reintenta.
cerrar() {
  local intento
  for intento in 1 2 3 4 5; do
    if T --source admin -- cerrar_ronda --id "$ID"; then
      return 0
    fi
    echo "   (la red aún no ve vencida la ronda; reintento en 5 s... $intento/5)"
    sleep 5
  done
  echo "No se pudo cerrar la ronda después de 5 intentos." >&2
  return 1
}

DEUDA="${DEUDA:-0}"
COBERTURA=10000
[ "$DEUDA" = "1" ] && COBERTURA=0 # garantía mínima (una cuota): no alcanza para las 2 cuotas que le quedan a Ana

echo "== Crear tanda: 3 miembros, cuota 100 TUSD, rondas de $PERIODO s, multa 10%, cobertura $((COBERTURA / 100))% =="
ID=$(T --source admin -- crear_tanda --creador "$(stellar keys address admin)" --token "$TOKEN" \
  --cuota 1000000000 --n_miembros 3 --periodo_seg "$PERIODO" --penalidad_bps 1000 --cobertura_bps "$COBERTURA")
echo "   id = $ID"
echo
echo ">> Proyecta la demo en vivo en:  $WEB/#/demo/$ID"
echo
if [ "${PAUSAR:-0}" = "1" ]; then
  read -r -p "   Pulsa ENTER cuando la pantalla esté lista para empezar... " _
fi

if [ "$DEUDA" = "1" ]; then
  echo "== Se unen Ana, Beto y Carla (colateral 100 cada uno: garantía mínima) =="
else
  echo "== Se unen Ana (turno 1, colateral 200), Beto y Carla (colateral 100) =="
fi
for p in ana beto carla; do T --source "$p" -- unirse --id "$ID" --miembro "$(stellar keys address "$p")"; done

echo "== Ronda 1: todos pagan; Ana cobra 300 =="
for p in ana beto carla; do T --source "$p" -- pagar_cuota --id "$ID" --miembro "$(stellar keys address "$p")"; done
sleep "$PERIODO"; cerrar

if [ "$DEUDA" = "1" ]; then
  echo "== Ronda 2: Ana desaparece. Su garantía (100) no alcanza para las 2 cuotas que le quedan: no se usa y queda en mora (debe 100). Beto cobra 200 =="
else
  echo "== Ronda 2: Ana desaparece. Su colateral cubre su cuota; Beto cobra 300 completos =="
fi
for p in beto carla; do T --source "$p" -- pagar_cuota --id "$ID" --miembro "$(stellar keys address "$p")"; done
sleep "$PERIODO"; cerrar

if [ "$DEUDA" = "1" ]; then
  echo "== Ronda 3: Ana sigue sin pagar (ahora debe 200). Carla cobra 200 =="
  for p in beto carla; do T --source "$p" -- pagar_cuota --id "$ID" --miembro "$(stellar keys address "$p")"; done
  sleep "$PERIODO"; cerrar

  echo "== Ana vuelve y paga su deuda de 200: Beto y Carla reciben los 100 TUSD que les faltaban, y ella recupera su garantía =="
  T --source ana -- pagar_deuda --id "$ID" --miembro "$(stellar keys address ana)" \
    --pagador "$(stellar keys address ana)" --monto 2000000000
else
  echo "== Ronda 3: Carla paga a tiempo; Beto paga TARDE; Carla cobra 300 =="
  T --source carla -- pagar_cuota --id "$ID" --miembro "$(stellar keys address carla)"
  sleep $((PERIODO + 10))
  T --source beto -- pagar_cuota --id "$ID" --miembro "$(stellar keys address beto)"
  cerrar
fi

echo "== Final: devolver colateral + rendimiento, repartir multas =="
T --source admin -- finalizar --id "$ID"
T --source admin -- get_miembros --id "$ID"
for p in ana beto carla; do echo "   saldo $p: $(saldo "$p")  (empezó con 10000000000)"; done

# Historial crediticio (misión M2): cada cuota quedó escrita en el contrato de historial.
if [ -n "${HISTORIAL:-}" ]; then
  echo "== Historial crediticio: lo que cada uno se ganó (o perdió) en esta tanda =="
  for p in ana beto carla; do
    dir="$(stellar keys address "$p")"
    nivel=$(stellar contract invoke --id "$HISTORIAL" $NET --source admin -- nivel --dir "$dir")
    case "$nivel" in 0) nivel=Nuevo ;; 1) nivel=Bronce ;; 2) nivel=Plata ;; 3) nivel=Oro ;; esac
    echo "   $p: puntaje $(stellar contract invoke --id "$HISTORIAL" $NET --source admin -- puntaje --dir "$dir"), nivel $nivel"
    echo "      página pública: $WEB/#/historial/$dir"
  done
fi
