// Chequeo previo a la demo (#/estado): ¿está todo listo? Cada punto dice qué pasa y qué hacer si falla.
// Las funciones `evaluar...` son puras (se prueban sin red); `ejecutarChequeos` es la parte que consulta la red.
import { FAUCET_URL, SIMBOLO } from '../config'
import { direccionesBovedas, evaluarPrincipal, evaluarRapida, leerBoveda } from './bovedas'
import { leerTotal } from './lectura'
import { activoToken, servidor } from './rpc'

export type Nivel = 'ok' | 'aviso' | 'error'

export type Chequeo = {
  id: string
  titulo: string
  nivel: Nivel
  detalle: string
  /** Qué hacer si no está en verde. */
  solucion?: string
}

type Resultado = Pick<Chequeo, 'nivel' | 'detalle' | 'solucion'>

/**
 * Se le manda al faucet una dirección inválida a propósito: así no entrega nada, pero según cómo
 * responda sabemos si la función existe (400) y si tiene la llave del emisor configurada (503 = no).
 */
export function evaluarFaucet(status: number, cuerpo: unknown): Resultado {
  const json = typeof cuerpo === 'object' && cuerpo !== null
  if (!json) {
    return {
      nivel: 'aviso',
      detalle: 'Este sitio no tiene la función /api/faucet (es lo normal con `npm run dev`).',
      solucion: 'En Vercel (Root Directory = web) sí existe. Para probarla en local usa `vercel dev`.',
    }
  }
  if (status === 503) {
    return {
      nivel: 'error',
      detalle: 'El faucet existe pero no tiene la llave del emisor.',
      solucion: 'En Vercel → Settings → Environment Variables agrega FAUCET_ISSUER_SECRET (stellar keys show emisor) y vuelve a desplegar.',
    }
  }
  if (status === 400 || status === 405 || status === 200) {
    return { nivel: 'ok', detalle: 'El faucet responde y está configurado.' }
  }
  return {
    nivel: 'error',
    detalle: `El faucet respondió con el código ${status}.`,
    solucion: 'Revisa los logs de la función en Vercel.',
  }
}

async function paso(id: string, titulo: string, fn: () => Promise<Resultado>, falla: Omit<Resultado, 'detalle'>): Promise<Chequeo> {
  try {
    return { id, titulo, ...(await fn()) }
  } catch (e) {
    const motivo = e instanceof Error ? e.message.slice(0, 160) : String(e)
    return { id, titulo, ...falla, detalle: `${falla.nivel === 'error' ? 'No respondió' : 'No se pudo comprobar'}: ${motivo}` }
  }
}

const REDESPLEGAR =
  'Si Stellar reinició testnet, hay que volver a desplegar: `bash scripts/desplegar_testnet.sh`, y actualizar VITE_TANDA_ID y VITE_TOKEN_ID (en Vercel y en web/.env.local).'

/** Corre todos los chequeos de red en paralelo. */
export function ejecutarChequeos(): Promise<Chequeo[]> {
  const ahora = Math.floor(Date.now() / 1000)
  // Las dos bóvedas se leen del contrato una sola vez para los dos chequeos.
  let direcciones: ReturnType<typeof direccionesBovedas> | null = null
  const bovedas = () => (direcciones ??= direccionesBovedas())
  return Promise.all([
    paso(
      'rpc',
      'Servidor de Stellar (RPC)',
      async () => {
        const salud = await servidor().getHealth()
        return { nivel: 'ok', detalle: `Responde. Último ledger: ${salud.latestLedger}.` }
      },
      { nivel: 'error', solucion: 'Revisa tu conexión. Si es de Stellar, espera unos minutos o cambia VITE_RPC_URL.' },
    ),
    paso(
      'contrato',
      'Contrato de la tanda',
      async () => {
        const n = await leerTotal()
        return { nivel: 'ok', detalle: n === 1 ? 'Responde. Hay 1 tanda creada.' : `Responde. Hay ${n} tandas creadas.` }
      },
      { nivel: 'error', solucion: REDESPLEGAR },
    ),
    paso(
      'token',
      `Token ${SIMBOLO}`,
      async () => {
        const { codigo, emisor } = await activoToken()
        return { nivel: 'ok', detalle: `${codigo}, emitido por ${emisor.slice(0, 4)}…${emisor.slice(-4)}.` }
      },
      { nivel: 'error', solucion: `Revisa VITE_TOKEN_ID. ${REDESPLEGAR}` },
    ),
    // M1: las dos bóvedas, con lo que de verdad les queda para pagar intereses (ver lib/bovedas.ts).
    paso(
      'boveda',
      'Bóveda del rendimiento (tandas de días, semanas o meses)',
      async () => evaluarPrincipal(await leerBoveda((await bovedas()).principal), ahora),
      { nivel: 'error', solucion: REDESPLEGAR },
    ),
    paso(
      'boveda-rapida',
      'Bóveda rápida (tandas de prueba de minutos)',
      async () => {
        const { principal, rapida } = await bovedas()
        const [datosRapida, datosPrincipal] = await Promise.all([
          rapida === null ? null : leerBoveda(rapida),
          leerBoveda(principal).catch(() => null),
        ])
        return evaluarRapida(datosRapida, datosPrincipal, ahora)
      },
      { nivel: 'aviso', solucion: 'Revisa tu conexión y vuelve a revisar. Si no se arregla: `bash scripts/renovar_boveda_rapida.sh`.' },
    ),
    paso(
      'faucet',
      `Faucet de ${SIMBOLO}`,
      async () => {
        if (!FAUCET_URL) {
          return { nivel: 'aviso', detalle: 'Está desactivado (VITE_FAUCET_URL vacío).', solucion: 'Sin faucet, quien pruebe necesitará que le des TUSD a mano.' }
        }
        const r = await fetch(FAUCET_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: 'chequeo-sin-envio' }),
        })
        const cuerpo: unknown = await r.json().catch(() => null)
        return evaluarFaucet(r.status, cuerpo)
      },
      { nivel: 'aviso', solucion: 'Revisa tu conexión o que la función esté desplegada.' },
    ),
  ])
}
