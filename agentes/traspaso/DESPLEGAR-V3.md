# Desplegar la versión 3 en testnet sin tocar `main`

Para @DocFranji, desde WSL, donde están las llaves del emisor de TUSD. Despliega contratos **nuevos** en testnet desde
la rama `integracion`. **No fusiona nada a `main`**: producción (https://rounda-phi.vercel.app) sigue con sus
contratos de siempre hasta la salida del martes.

Tiempo: unos 15 minutos (más si `preparar_entorno.sh` tiene que instalar algo).

## Pasos

1. **Trae la última versión de `integracion`:**
   ```bash
   cd ~/Safe-Chain
   git fetch origin
   git checkout integracion
   git pull
   git log --oneline -1   # debe decir 80b0414 o un commit más nuevo
   git status             # sin cambios propios pendientes
   ```
2. **Guarda las direcciones de producción** por si hay que volver atrás:
   ```bash
   cp scripts/.contratos ~/contratos-produccion-v2.txt 2>/dev/null || echo "no había .contratos"
   ```
3. **Pon al día las herramientas.** Instala lo que falte: el target de WASM, la CLI de Stellar 28 y las dependencias
   de `web/`, que el paso de Blend necesita.
   ```bash
   bash scripts/preparar_entorno.sh
   ```
4. **Despliega** y guarda la salida:
   ```bash
   bash scripts/desplegar_testnet.sh 2>&1 | tee ~/despliegue-v3.log
   ```
   - Es normal ver "(admin ya existía)", etc.: reusa tus cuentas de prueba y el **mismo emisor de TUSD**.
   - Por eso `TOKEN` debería salir igual que en producción (`CDM2YCJ…`), y el faucet de Vercel sigue sirviendo con la
     misma `FAUCET_ISSUER_SECRET`.
   - Despliega dos bóvedas nuevas (la principal y la rápida, cada una con 10 000 TUSD para intereses), la tanda, el
     historial y el adaptador de Blend (paso 9). Al final reparte USDC de prueba a Ana, Beto y Carla.
   - **Si el paso 9 (Blend) falla** (por ejemplo, si el pool de Blend no responde): vuelve a correr todo con
     `SIN_BLEND=1 bash scripts/desplegar_testnet.sh` y avísalo. La web esconde USDC si no hay bóveda registrada.
5. **Revisa el resultado:**
   ```bash
   cat scripts/.contratos
   ```
   Tienen que estar `TOKEN`, `BOVEDA`, `BOVEDA_RAPIDA`, `TANDA`, `HISTORIAL` y `ADAPTADOR_USDC`, todas `C...`.
6. **(Opcional, 5 minutos) Ensayo de punta a punta**, con rondas de 1 minuto y las cuentas de prueba:
   ```bash
   PERIODO=60 bash scripts/demo.sh 2>&1 | tee ~/demo-v3.log
   ```
   Al final debe mostrar el rendimiento repartido y el puntaje del historial de cada persona.
7. **Pasa las direcciones públicas** al orquestador o al agente `web-preview`, en el tablero (issue #4) o en su
   sesión: las líneas que el script imprime al final, `VITE_TANDA_ID`, `VITE_TOKEN_ID`, `VITE_HISTORIAL_ID` y
   `VITE_NOMBRES`.
   - **No pegues** la línea de `FAUCET_ISSUER_SECRET` ni ninguna llave `S...`.
   - Si `TOKEN` salió distinto de `CDM2YCJ…`, dilo: el faucet de la vista previa necesitará la llave de ese emisor,
     y esa llave la pones tú directamente en Vercel.
8. **No hagas nada más en Vercel ni en `main` todavía.** La vista previa la conecta el agente `web-preview`, con
   variables solo de Preview o con los valores por defecto de `integracion`. Producción se cambia el martes con la lista
   de salida.

## Qué cambia y qué no

| Lugar | Después de estos pasos |
| --- | --- |
| Testnet | Contratos v3 nuevos y vacíos (sin tandas). Los contratos de producción siguen intactos |
| `main` y producción | Sin cambios |
| `integracion` | Sin cambios de código: el script solo escribe `scripts/.contratos` y `web/.env.local`, que no se suben |
| Tu `npm run dev` local | Ya apunta a v3 (por `web/.env.local`) |
