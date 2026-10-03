#!/usr/bin/env bash
# Regenera los clientes TypeScript de los contratos (web/packages/<contrato>) a partir del WASM
# compilado en local. Córrelo cada vez que cambie la interfaz de un contrato (funciones, tipos,
# errores o eventos). NUNCA edites web/packages/* a mano, y si git marca conflictos ahí,
# no los resuelvas a mano: corre este script.
#
# Uso (desde cualquier carpeta):   bash scripts/generar_cliente.sh [contrato ...]
#   Sin argumentos regenera todos los de CONTRATOS (abajo).
# Requiere la CLI de Stellar para compilar el WASM y `npm ci` en web/ para el generador
# (bash scripts/preparar_entorno.sh instala ambos).
set -euo pipefail
cd "$(dirname "$0")/.."

# Contratos que usa la web. Si agregas uno (por ejemplo `historial`), súmalo aquí.
CONTRATOS=(tanda)
if [ "$#" -gt 0 ]; then CONTRATOS=("$@"); fi

echo "== Compilando contratos a WASM =="
stellar contract build

for c in "${CONTRATOS[@]}"; do
  destino="web/packages/$c"
  wasm="target/wasm32v1-none/release/$c.wasm"
  echo "== Cliente de '$c' -> $destino =="
  [ -f "$wasm" ] || { echo "No existe $wasm (¿el crate se llama '$c'?)" >&2; exit 1; }

  # El .gitignore del paquete está modificado a propósito: dist/ SÍ se sube, porque Vercel
  # instala la web sin compilar este paquete. El generador lo sobrescribiría: lo guardamos.
  respaldo=""
  if [ -f "$destino/.gitignore" ]; then respaldo=$(mktemp); cp "$destino/.gitignore" "$respaldo"; fi

  # Usamos el generador del SDK de JavaScript (el mismo con el que se creó el paquete original),
  # NO `stellar contract bindings typescript`: el de la CLI 28 fija @stellar/stellar-sdk ^16 y
  # la web usa la 17. Mezclar versiones duplica el SDK y rompe tipos compartidos.
  (cd web && npx stellar-js generate --wasm "../$wasm" --output-dir "packages/$c" --contract-name "$c" --overwrite)

  if [ -n "$respaldo" ]; then
    cp "$respaldo" "$destino/.gitignore"; rm -f "$respaldo"
  else
    # Paquete nuevo: que dist/ se suba (ver comentario arriba).
    sed -i '/^dist\/\?$/d' "$destino/.gitignore" 2>/dev/null || true
  fi

  # node_modules solo hace falta para compilar (tsc). Se BORRA después: si se queda, la web y las
  # pruebas cargan una segunda copia de @stellar/stellar-sdk desde aquí, distinta de la de web/,
  # y los objetos de una copia no los entiende la otra (en Vercel esta carpeta no existe).
  (cd "$destino" && npm install --no-audit --no-fund --loglevel=error && npm run build && rm -rf node_modules)
  echo "   tamaño del WASM: $(wc -c < "$wasm") bytes"
done

echo "Listo. Revisa el diff de web/packages/ y corre: (cd web && npm run lint && npm test && npm run build)"
