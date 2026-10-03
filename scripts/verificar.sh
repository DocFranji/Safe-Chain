#!/usr/bin/env bash
# Verificación completa en un solo comando: la Definición de Terminado de agentes/PROTOCOLO.md (§8 y §9).
# El orquestador la corre antes de integrar cada misión; cualquier misión puede correrla antes de pedir revisión.
#
# Uso (desde cualquier carpeta):
#   bash scripts/verificar.sh              # todo: contratos, WASM, cliente generado, web y navegador
#   bash scripts/verificar.sh contratos    # solo contratos: fmt, clippy y cargo test (lo más rápido)
#   bash scripts/verificar.sh web          # solo web y navegador
#   SIN_E2E=1 bash scripts/verificar.sh    # todo menos las pruebas de navegador
#   SIN_CLIENTE=1 bash scripts/verificar.sh  # no comprueba que web/packages esté al día (ahorra ~1 minuto)
#   SIN_WASM=1 bash scripts/verificar.sh   # sin la CLI de Stellar: no compila a WASM ni revisa el cliente
#                                          # (así corre en GitHub Actions: .github/workflows/verificar.yml)
#
# Al final imprime un resumen (OK / FALLA por paso) y termina con código 1 si algo falló.
# Requiere lo que instala scripts/preparar_entorno.sh (CLI de Stellar, dependencias de web y e2e).
set -uo pipefail
cd "$(dirname "$0")/.."

QUE=${1:-todo}
LOG=$(mktemp -d)
PUERTO=${PUERTO:-4173}
resumen=()
fallo=0

paso() {
  local nombre=$1
  shift
  echo
  echo "== $nombre =="
  if "$@"; then
    resumen+=("OK     $nombre")
  else
    resumen+=("FALLA  $nombre")
    fallo=1
  fi
}

sin_secretos() {
  # Llaves secretas de Stellar: 56 caracteres que empiezan con S. Nunca deben estar en el repo.
  if git grep -nwE 'S[A-Z2-7]{55}' -- . ':!*.lock' ':!*package-lock.json'; then
    echo "Hay algo con forma de llave secreta (S...) en el repo. Bórrala y cámbiala."
    return 1
  fi
}

wasm() {
  if ! command -v stellar >/dev/null 2>&1; then
    echo "Falta la CLI de Stellar. Instálala con: bash scripts/preparar_entorno.sh"
    return 1
  fi
  stellar contract build >"$LOG/build.txt" 2>&1 || {
    tail -40 "$LOG/build.txt"
    return 1
  }
  for w in target/wasm32v1-none/release/*.wasm; do
    printf '   %-32s %8d bytes\n' "$(basename "$w")" "$(wc -c <"$w")"
  done
}

cliente_al_dia() {
  # Regenera los clientes y comprueba que no cambie nada. Si cambia, alguien olvidó correr
  # scripts/generar_cliente.sh después de cambiar la interfaz de un contrato.
  bash scripts/generar_cliente.sh >"$LOG/cliente.txt" 2>&1 || {
    tail -30 "$LOG/cliente.txt"
    return 1
  }
  if [ -n "$(git status --porcelain -- web/packages)" ]; then
    echo "El cliente generado no está al día. Corre: bash scripts/generar_cliente.sh y sube web/packages/"
    git status --short -- web/packages | head -20
    return 1
  fi
}

dependencias_web() {
  (cd web && npm ci --no-audit --no-fund --loglevel=error) || return 1
  # Igual que preparar_entorno.sh: nada de node_modules dentro de web/packages/* (duplicaría el SDK).
  rm -rf web/packages/*/node_modules
}

navegador() {
  (cd web/e2e && npm ci --no-audit --no-fund --loglevel=error) || return 1
  # La web compilada (dist/) se sirve en segundo plano y se apaga al terminar.
  setsid bash -c "cd web && exec npx vite preview --port $PUERTO --strictPort" >"$LOG/preview.txt" 2>&1 &
  local pid=$!
  local listo=0
  for _ in $(seq 1 30); do
    if curl -sf "http://localhost:$PUERTO/" >/dev/null 2>&1; then
      listo=1
      break
    fi
    sleep 1
  done
  local r=1
  if [ "$listo" = 1 ]; then
    (cd web/e2e && BASE="http://localhost:$PUERTO/" npm test 2>&1 | tee "$LOG/e2e.txt")
    r=$?
    grep -E '^FAIL' "$LOG/e2e.txt" || true
  else
    echo "No arrancó vite preview en el puerto $PUERTO:"
    cat "$LOG/preview.txt"
  fi
  kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  return "$r"
}

if [ "$QUE" = "todo" ] || [ "$QUE" = "contratos" ]; then
  paso "Sin llaves secretas en el repo" sin_secretos
  paso "cargo fmt --check" cargo fmt --all -- --check
  paso "cargo clippy (sin advertencias)" cargo clippy --all-targets --quiet -- -D warnings
  paso "cargo test" cargo test --quiet
fi

if [ "$QUE" = "todo" ] && [ "${SIN_WASM:-}" != "1" ]; then
  paso "stellar contract build (tamaño del WASM)" wasm
  if [ "${SIN_CLIENTE:-}" != "1" ]; then
    paso "Cliente generado al día (web/packages)" cliente_al_dia
  fi
fi

if [ "$QUE" = "todo" ] || [ "$QUE" = "web" ]; then
  paso "web: npm ci" dependencias_web
  paso "web: lint" bash -c 'cd web && npm run lint'
  paso "web: pruebas" bash -c 'cd web && npm test'
  paso "web: build" bash -c 'cd web && npm run build'
  if [ "${SIN_E2E:-}" != "1" ]; then
    paso "Navegador (web/e2e)" navegador
  fi
fi

echo
echo "================ Resumen ($(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)) ================"
for r in "${resumen[@]}"; do echo "$r"; done
rm -rf "$LOG"
if [ "$fallo" = 1 ]; then
  echo "Resultado: FALLA"
  exit 1
fi
echo "Resultado: todo en verde"
