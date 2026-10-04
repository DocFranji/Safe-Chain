// Chequeo previo a la demo (#/estado): ¿está todo listo? Cada punto dice qué pasa y qué hacer si falla.
// Las funciones `evaluar...` son puras (se prueban sin red); `ejecutarChequeos` es la parte que consulta la red.
import { FAUCET_URL, SIMBOLO } from '../config'
import { leerTotal } from './lectura'
import { activoToken, direccionBoveda, saldoToken, servidor } from './rpc'
import { chequeoBlend } from './blend'

export type Nivel = 'ok' | 'aviso' | 'error'

export type Chequeo = {
  id: string
  titulo: string
  nivel: Nivel
  detalle: string
  /** Qué hacer si no está en verde. */
  solucion?: string
}

const U = 10_000_000n
/** La bóveda paga los intereses con su propio saldo: si se queda corta, los retiros fallan. */
export const BOVEDA_AVISO = 2_000n * U
export const BOVEDA_CRITICO = 500n * U

type Resultado = Pick<Chequeo, 'nivel' | 'detalle' | 'solucion'>

export function evaluarBoveda(saldo: bigint, formato: (v: bigint) => string = (v) => String(v / U)): Resultado {
  const texto = `La bóveda tiene ${formato(saldo)} ${SIMBOLO} para pagar intereses.`
  if (saldo < BOVEDA_CRITICO) {
    return {
      nivel: 'error',
      detalle: texto,
      solucion: `Es muy poco: los retiros podrían fallar. Enviarle más ${SIMBOLO}: stellar contract invoke --id $TOKEN --source emisor --network testnet -- mint --to $BOVEDA --amount 100000000000 (10 000 ${SIMBOLO}).`,
    }
  }
  if (saldo < BOVEDA_AVISO) {
    return {
      nivel: 'aviso',
      detalle: texto,
      solucion: `Alcanza para una demo corta, pero conviene recargarla (mint de ${SIMBOLO} a la bóveda con la cuenta emisora).`,
    }
  }
  return { nivel: 'ok', detalle: texto }
}

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
export function ejecutarChequeos(formatoMonto: (v: bigint) => string): Promise<Chequeo[]> {
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
    paso(
      'boveda',
      'Bóveda del rendimiento',
      async () => evaluarBoveda(await saldoToken(await direccionBoveda()), formatoMonto),
      { nivel: 'error', solucion: REDESPLEGAR },
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
    // M4: tandas en USDC con rendimiento real en Blend (liquidez libre del pool).
    paso('blend', 'Blend (tandas en USDC)', chequeoBlend, {
      nivel: 'aviso',
      solucion: 'Si Blend no responde, las tandas en USDC no se pueden crear ni cerrar por ahora; las de TUSD funcionan igual.',
    }),
  ])
}
