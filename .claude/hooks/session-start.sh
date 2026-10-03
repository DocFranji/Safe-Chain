#!/bin/bash
# Hook de inicio de sesión: deja lista una sesión de Claude Code en la nube para trabajar en Rounda
# (target WASM, CLI de Stellar, dependencias de contratos, web y pruebas de navegador).
# Solo corre en la nube; en tu computadora usa directamente: bash scripts/preparar_entorno.sh
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"
bash scripts/preparar_entorno.sh
