# Salida a producción: `integracion` → `main` con los contratos v3

Para @DocFranji (solo él toca `main` y las variables de **Production** en Vercel). Escrita por el agente
`web-preview` el domingo 4 de octubre de 2026. Fecha prevista: **martes 6 de octubre**, después de probar la vista
previa de `integracion` (`https://rounda-git-integracion-rounda.vercel.app`).

Tiempo: unos 20 minutos, más el recorrido de prueba.

## Antes de empezar

- La vista previa de `integracion` está en verde en `#/estado` y el recorrido corto (paso 4) funcionó ahí.
- Tienes a mano `~/contratos-produccion-v2.txt` (lo guardaste en el paso 2 de `DESPLEGAR-V3.md`) y
  `scripts/.contratos` con los contratos v3.
- Los contratos v3 (públicos, del comentario 5987788851 del tablero):

  | Nombre | Dirección |
  | --- | --- |
  | `TANDA` | `CADFZFJDRFSM4WT6VO3F4IXM2Z4ZKKD3VLOELAMJMUFDCXZ2I2E3BYMC` |
  | `TOKEN` (TUSD, **el mismo de v2**) | `CDM2YCJVE37HUCNOY5E65NOEKTQVQM2WD6CUVHSL5WZFVISPIUIYHAQ5` |
  | `HISTORIAL` | `CBDXYDWLSCFGIEO47I76C6N2T5L5NYYNWACAF2AGM6F5M6NFYJ6JN4HK` |
  | `BOVEDA` | `CDUJCZSUTBS2TTTF7GQA2RVTCAMSM7G3CGKOR7L5HZV2YIQNQVCWMBYM` |
  | `BOVEDA_RAPIDA` | `CCKIREUJCV5LXCPZDIWVO5LHFXYGHHFJ2X7DO7SETMIUS27UHFUK45QI` |
  | `ADAPTADOR_USDC` | `CCHY4HALFLRKP5JZ5UIXTFPTRCUI6NPXDBJCCSSH53KXHANSJ3FISUDE` |

  **Ojo:** `main` va a tener un arreglo de M2 (PR #17, los requisitos de historial ya no se archivan en tandas de
  más de ~150 días) que la tanda v3 desplegada **no** tiene, porque se integró después del despliegue. La interfaz
  es la misma, así que la web funciona igual. Entra en el próximo despliegue de la tanda (recomendado: la segunda
  entrada a producción, viernes 9).

  La web solo necesita `TANDA` (y `TOKEN`, que no cambió): las bóvedas, el historial y el adaptador los lee del
  contrato de la tanda. Desde el PR de `web-preview`, el valor por defecto de `TANDA_ID` en `web/src/config.ts` ya
  es el v3, así que **lo normal es que Production no necesite ninguna variable de contrato**.

## Pasos, en orden

### 1. Fusionar `integracion` → `main` (solo DocFranji)

En GitHub, un PR de `integracion` hacia `main` (o desde WSL):

```bash
cd ~/Safe-Chain
git fetch origin
git checkout main && git pull
git merge --no-ff -m "Producción: M1, M2, M3 y M4 con los contratos v3" origin/integracion
git log --oneline -1          # anota este commit: es el que debe quedar en Production
git push origin main
```

### 2. Variables de **Production** en Vercel

Settings → Environment Variables, filtrando por **Production**. Revisa una por una:

| Variable | Qué hacer en Production |
| --- | --- |
| `VITE_TANDA_ID` | Si existe con el valor viejo (`CDLSK5Z6…`): **quítala** (manda el código, que ya es v3) o ponle `CADFZFJDRFSM4WT6VO3F4IXM2Z4ZKKD3VLOELAMJMUFDCXZ2I2E3BYMC`. Si no existe, no hagas nada. |
| `VITE_TOKEN_ID` | No cambió (`CDM2YCJ…`). Si existe, déjala o quítala, da igual. |
| `VITE_HISTORIAL_ID` | Opcional. Si existe con otro valor, **quítala** (la web le pregunta a la tanda) o ponle `CBDXYDWLSCFGIEO47I76C6N2T5L5NYYNWACAF2AGM6F5M6NFYJ6JN4HK`. |
| `VITE_BOVEDA_SIMULADA` | Si existe en `false`, **quítala**: TUSD sigue usando bóvedas simuladas y la web lo rotula. |
| `VITE_USDC_ID`, `VITE_FAUCET_BLEND_URL` | No hacen falta (los valores por defecto sirven). Si existen vacías, la web esconde USDC: quítalas. |
| `VITE_NOMBRES` | Sigue sirviendo (las cuentas de prueba Ana, Beto y Carla no cambiaron). |
| `VITE_PRIVY_APP_ID` | Sin cambios. |
| `FAUCET_ISSUER_SECRET` | Sin cambios (el emisor de TUSD es el mismo). **Nunca** la copies fuera de Vercel. |

> Completa esta tabla con el inventario real de Vercel que se pidió en el tablero (issue #4) antes del martes.

### 3. Redeploy **del commit de la fusión** en Production

Las variables nuevas solo valen en un despliegue nuevo. Vercel despliega solo al hacer push a `main`, pero si
cambiaste variables **después** de ese despliegue:

1. Deployments → filtra por **Production**.
2. Abre el despliegue cuyo commit es **el de la fusión del paso 1** (compara el hash; ya nos pasó redesplegar uno
   viejo).
3. ⋯ → **Redeploy** (sin "Use existing Build Cache", para que tome las variables nuevas).
4. Espera a que quede **Ready** y revisa que el commit que muestra sea el de la fusión.

### 4. Revisar producción

1. Abre `https://rounda-phi.vercel.app/#/estado`. Todo en verde, en especial:
   - "La web y el contrato coinciden" (si sale rojo, Production todavía apunta a `CDLSK5Z6…`: vuelve al paso 2);
   - las dos bóvedas (principal y rápida) y Blend (USDC);
   - la dirección de la tanda que muestra la página es `CADFZ…BYMC`.
2. Recorrido corto:
   1. Entrar con Freighter y, en otra ventana, con Google.
   2. Pedir TUSD de prueba (botón del faucet).
   3. Crear una tanda de 3 con rondas de 1 minuto.
   4. Unirse con dos cuentas más.
   5. Pagar la cuota y cerrar una ronda.
   6. Ver el historial (puntaje y nivel) de las tres cuentas.
   7. Crear una tanda en USDC (pedir USDC con su botón primero).
3. Si algo falla, anótalo en el tablero para la misión dueña (M1 tiempos y deudas, M2 historial, M3 turnos, M4
   USDC y Blend).

### 5. Cómo volver atrás si algo sale mal

- **Rápido (1 minuto):** Vercel → Deployments → el despliegue anterior de Production → ⋯ → **Instant Rollback**.
  Vuelve la web vieja, que apunta a los contratos v2 (por su valor por defecto o por las variables viejas).
- Si además cambiaste variables de Production en el paso 2, devuélvelas a su valor anterior con las direcciones de
  `~/contratos-produccion-v2.txt` (tanda v2: `CDLSK5Z65A645XS5X6IMJAUOYBLXZFLP7SNM3DB62LFQKFUKNDCKKEGV`).
- `main` se puede dejar como está mientras se arregla: lo que ve el público es el despliegue de Vercel.
- **Ojo:** la instancia del contrato v2 vive hasta el ledger ~5 082 808 (más o menos el miércoles 7). Volver a v2
  después de esa fecha exige renovarla (`stellar contract extend`) o no sirve.

### 6. Antes de grabar el video (y antes del piloto del sábado 10)

```bash
cd ~/Safe-Chain
bash scripts/renovar_boveda_rapida.sh
```

La bóveda rápida rinde menos cuanto más vieja es. El script usa `scripts/.contratos`, que después del despliegue v3
ya apunta a la tanda v3. Las tandas creadas después usan la bóveda nueva; las que ya existen siguen con la suya.
