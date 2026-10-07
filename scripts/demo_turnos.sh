#!/usr/bin/env bash
# Muestra los mecanismos de turnos (misión M3) en testnet desde la terminal, con Ana, Beto y Carla
# en tandas de 3 personas (cuota 100 TUSD, garantía 100 %). Cada modo tarda ~4 minutos (3 rondas).
# Mientras corre, la web muestra cada tanda en  #/tanda/<id>  (el script imprime el enlace).
#
# Requiere haber corrido antes:  bash scripts/desplegar_testnet.sh   (con un contrato que incluya M3)
#
# Uso (desde la carpeta raíz del proyecto):
#   MODO=sorteo bash scripts/demo_turnos.sh       # el contrato sortea el orden al llenarse
#   MODO=precio bash scripts/demo_turnos.sh       # precio por turno: quien tiene prisa paga, quien espera gana
#   MODO=subasta bash scripts/demo_turnos.sh      # cada ronda gana quien acepte recibir menos
#   MODO=intercambio bash scripts/demo_turnos.sh  # elegir turno y cambiarlo con compensación
#   MODO=sellada bash scripts/demo_turnos.sh      # subasta con ofertas selladas: se sellan y luego se revelan
#   MODO=todos bash scripts/demo_turnos.sh        # los cinco, uno detrás de otro (por defecto)
# Variables opcionales: PERIODO (segundos por ronda, mínimo 60), WEB (para el enlace), PAUSAR=1.
set -euo pipefail

if [ ! -f scripts/.contratos ]; then
  echo "Falta scripts/.contratos: corre primero  bash scripts/desplegar_testnet.sh  (desde la carpeta raíz del proyecto)." >&2
  exit 1
fi
source scripts/.contratos
NET="--network testnet"
T() { stellar contract invoke --id "$TANDA" $NET "$@"; }
dir() { stellar keys address "$1"; }
saldo() { stellar contract invoke --id "$TOKEN" $NET --source admin -- balance --id "$(dir "$1")"; }
MODO="${MODO:-todos}"
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

# Opciones de turnos en el JSON que entiende la CLI.
opciones() { # modo intercambio prima_bps descuento_bps [ofertas_selladas] (sin historial mínimo)
  printf '{"modo":"%s","permitir_intercambio":%s,"prima_max_bps":%s,"descuento_max_bps":%s,"primeros_con_historial":0,"puntaje_primeros":0,"ofertas_selladas":%s}' \
    "$1" "$2" "$3" "$4" "${5:-false}"
}

# Subasta sellada: sello = sha256(descuento_bps en 4 bytes big-endian ‖ sal de 32 bytes), como el
# contrato y la web. Aquí la sal son 32 bytes iguales a $2 (en la web es al azar).
sello() { # descuento_bps byte_de_la_sal
  local bps=$1 b=$2 i bytes
  bytes=$(printf '\\x%02x\\x%02x\\x%02x\\x%02x' $(((bps >> 24) & 255)) $(((bps >> 16) & 255)) $(((bps >> 8) & 255)) $((bps & 255)))
  for i in $(seq 32); do bytes+=$(printf '\\x%02x' "$b"); done
  printf "$bytes" | sha256sum | cut -c1-64
}
sal() { local i h=""; for i in $(seq 32); do h+=$(printf '%02x' "$1"); done; echo "$h"; }
# Espera a que pase el momento $1 (segundos unix) más unos segundos de margen para la red.
esperar_hasta() { while [ "$(date +%s)" -lt $(($1 + 5)) ]; do sleep 2; done; }
dato() { T --source admin -- get_estado_turnos --id "$ID" | grep -o "\"$1\":[0-9]*" | cut -d: -f2; }

crear() { # opciones (JSON)
  ID=$(T --source admin -- crear_tanda_avanzada --creador "$(dir admin)" --token "$TOKEN" \
    --cuota 1000000000 --n_miembros 3 --periodo_seg "$PERIODO" --penalidad_bps 1000 --cobertura_bps 10000 \
    --opciones "$1")
  echo "   id = $ID   ·   en la web:  $WEB/#/tanda/$ID"
  if [ "${PAUSAR:-0}" = "1" ]; then
    read -r -p "   Pulsa ENTER cuando la pantalla esté lista para seguir... " _
  fi
}

pagan() { for p in "$@"; do T --source "$p" -- pagar_cuota --id "$ID" --miembro "$(dir "$p")"; done; }
ronda() { pagan ana beto carla; sleep "$PERIODO"; cerrar; }

turnos() { # nombres en el orden en que se unieron
  local posiciones nombres=("$@") i=0 pos
  posiciones=$(T --source admin -- get_miembros --id "$ID" | grep -o '"posicion":[0-9]*' | cut -d: -f2)
  for pos in $posiciones; do
    if [ "$pos" = "4294967295" ]; then
      echo "   ${nombres[$i]}: todavía sin turno"
    else
      echo "   ${nombres[$i]}: cobra en la ronda $((pos + 1))"
    fi
    i=$((i + 1))
  done
}

saldos() {
  for p in ana beto carla; do echo "   saldo $p: $(saldo "$p")"; done
}

final() {
  T --source admin -- finalizar --id "$ID"
  echo "   saldos después de repartir (cada uno dejó y recuperó su garantía):"
  saldos
}

demo_sorteo() {
  echo "== SORTEO: el contrato sortea el orden cuando entra la última persona =="
  crear "$(opciones Sorteo false 0 0)"
  echo "-- Se unen Ana, Beto y Carla: cada uno deja UNA cuota (100) de garantía, sin turno todavía"
  for p in ana beto carla; do T --source "$p" -- unirse --id "$ID" --miembro "$(dir "$p")"; done
  echo "-- El contrato sorteó el orden:"
  turnos ana beto carla
  echo "-- 3 rondas: todos pagan. A quien cobra primero se le apartan 100 de su bolsa como garantía (recibe 200)"
  for _ in 1 2 3; do ronda; done
  final
}

demo_precio() {
  echo "== PRECIO POR TURNO (8 %): quien tiene prisa paga, quien espera gana =="
  crear "$(opciones PrecioPorTurno false 800 0)"
  echo "-- Carla elige el turno 1 (paga 24), Beto el 2 (gratis), Ana el 3 (gana 24)"
  T --source carla -- unirse_en_turno --id "$ID" --miembro "$(dir carla)" --posicion 0
  T --source beto -- unirse_en_turno --id "$ID" --miembro "$(dir beto)" --posicion 1
  T --source ana -- unirse_en_turno --id "$ID" --miembro "$(dir ana)" --posicion 2
  echo "-- 3 rondas: Carla cobra 276, Beto 300, Ana 324"
  for _ in 1 2 3; do ronda; done
  final
  echo "   (Carla terminó con 24 menos y Ana con 24 más: el contrato no se quedó con nada)"
}

demo_subasta() {
  echo "== SUBASTA (máx. 30 %): cada ronda gana quien acepte recibir menos =="
  crear "$(opciones Subasta false 0 3000)"
  for p in ana beto carla; do T --source "$p" -- unirse --id "$ID" --miembro "$(dir "$p")"; done
  echo "-- Orden de respaldo (si nadie oferta):"
  T --source admin -- get_estado_turnos --id "$ID"
  echo "-- Ronda 1: Beto ofrece 5 %, Carla ofrece 10 % y gana: recibe 270, se apartan 100 de garantía,"
  echo "   y Ana y Beto reciben 15 cada uno en su garantía"
  T --source beto -- ofertar --id "$ID" --miembro "$(dir beto)" --descuento_bps 500
  T --source carla -- ofertar --id "$ID" --miembro "$(dir carla)" --descuento_bps 1000
  ronda
  echo "-- Ronda 2: nadie oferta: cobra el siguiente del orden de respaldo"
  ronda
  echo "-- Ronda 3 (última): cobra quien falta, sin subasta"
  ronda
  turnos ana beto carla
  final
}

demo_sellada() {
  echo "== SUBASTA SELLADA (máx. 30 %): nadie ve las ofertas de los demás hasta que se revelan =="
  crear "$(opciones Subasta false 0 3000 true)"
  for p in ana beto carla; do T --source "$p" -- unirse --id "$ID" --miembro "$(dir "$p")"; done
  echo "-- Primera mitad de la ronda 1: Beto sella 5 % y Carla sella 10 %. En la red solo quedan los sellos."
  T --source beto -- ofertar_sellada --id "$ID" --miembro "$(dir beto)" --sello "$(sello 500 11)"
  T --source carla -- ofertar_sellada --id "$ID" --miembro "$(dir carla)" --sello "$(sello 1000 22)"
  T --source admin -- get_estado_turnos --id "$ID"
  pagan ana beto carla
  echo "-- Esperamos la segunda mitad para revelar..."
  esperar_hasta "$(dato fin_sellado)"
  echo "-- Revelan: Carla gana con 10 % (recibe 270, se apartan 100 de garantía; Ana y Beto reciben 15)"
  T --source beto -- revelar_oferta --id "$ID" --miembro "$(dir beto)" --descuento_bps 500 --sal "$(sal 11)"
  T --source carla -- revelar_oferta --id "$ID" --miembro "$(dir carla)" --descuento_bps 1000 --sal "$(sal 22)"
  T --source admin -- get_estado_turnos --id "$ID"
  sleep $((PERIODO / 2))
  cerrar
  echo "-- Rondas 2 y 3: nadie oferta: cobra el orden de respaldo"
  ronda
  ronda
  turnos ana beto carla
  final
}

demo_intercambio() {
  echo "== ELEGIR E INTERCAMBIAR: turnos por llegada y cambio con compensación =="
  crear "$(opciones Eleccion true 0 0)"
  for p in ana beto carla; do T --source "$p" -- unirse --id "$ID" --miembro "$(dir "$p")"; done
  echo "-- Carla (turno 3) le ofrece 10 TUSD a Beto (turno 2) por cambiar; Beto acepta"
  T --source carla -- proponer_intercambio --id "$ID" --de "$(dir carla)" --con "$(dir beto)" --compensacion 100000000
  T --source beto -- aceptar_intercambio --id "$ID" --con "$(dir beto)" --de "$(dir carla)"
  turnos ana beto carla
  for _ in 1 2 3; do ronda; done
  final
  echo "   (Carla pagó 10 por cobrar antes; Beto los ganó por esperar)"
}

echo "Saldos al empezar:"
saldos
case "$MODO" in
  sorteo) demo_sorteo ;;
  precio) demo_precio ;;
  subasta) demo_subasta ;;
  intercambio) demo_intercambio ;;
  sellada) demo_sellada ;;
  todos) demo_sorteo; demo_precio; demo_subasta; demo_intercambio; demo_sellada ;;
  *) echo "MODO desconocido: $MODO (usa sorteo, precio, subasta, intercambio, sellada o todos)" >&2; exit 1 ;;
esac
echo "Listo."
