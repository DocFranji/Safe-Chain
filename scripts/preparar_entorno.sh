#!/usr/bin/env bash
# Prepara una máquina (o una sesión de Claude Code en la nube) para trabajar en Rounda:
#   - Rust: target wasm32v1-none y dependencias de los contratos (precompila las pruebas)
#   - CLI de Stellar (`stellar`): con soroban-sdk 28 es la ÚNICA forma de compilar contratos a WASM
#   - Dependencias de la web, del cliente generado y de las pruebas de navegador
#
# Es idempotente: si algo ya está instalado, no lo repite. Se puede correr las veces que haga falta.
# Uso (desde cualquier carpeta):   bash scripts/preparar_entorno.sh
# Variable opcional: SIN_STELLAR_CLI=1 para saltarse la CLI (por ejemplo, si solo vas a tocar la web).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1. Rust: target WASM =="
rustup target add wasm32v1-none >/dev/null
echo "   ok"

echo "== 2. CLI de Stellar =="
if command -v stellar >/dev/null 2>&1; then
  echo "   ya instalada: $(stellar --version | head -1)"
elif [ "${SIN_STELLAR_CLI:-}" = "1" ]; then
  echo "   omitida (SIN_STELLAR_CLI=1)"
else
  # Se compila desde crates.io porque en la nube las descargas de GitHub Releases están bloqueadas.
  # --no-default-features: evita depender de libdbus (llavero del sistema), que no está instalado.
  # Poca optimización y 2 procesos: el crate stellar-xdr es enorme y con más paralelismo se queda sin memoria.
  # Tarda unos 15-20 minutos la primera vez.
  echo "   compilando desde crates.io (15-20 minutos la primera vez)..."
  CARGO_PROFILE_RELEASE_OPT_LEVEL=1 CARGO_PROFILE_RELEASE_LTO=false \
    cargo install --locked stellar-cli --no-default-features -j 2 --target-dir /tmp/stellar-cli-build
  rm -rf /tmp/stellar-cli-build
  echo "   instalada: $(stellar --version | head -1)"
fi

echo "== 3. Contratos: dependencias y pruebas precompiladas =="
cargo test --workspace --no-run --quiet
echo "   ok"

echo "== 4. Web y pruebas de navegador =="
(cd web && npm install --no-audit --no-fund --loglevel=error)
# OJO: no instalar dependencias dentro de web/packages/*: duplicaría el SDK de Stellar
# (scripts/generar_cliente.sh las instala solo para compilar y las borra).
rm -rf web/packages/*/node_modules
(cd web/e2e && npm install --no-audit --no-fund --loglevel=error)
echo "   ok"

echo "Listo. Comandos útiles: cargo test · stellar contract build · bash scripts/generar_cliente.sh · (cd web && npm test)"
