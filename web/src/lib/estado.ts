// Chequeo previo a la demo (#/estado): ¿está todo listo? Cada punto dice qué pasa y qué hacer si falla.
// Las funciones `evaluar...` son puras (se prueban sin red); `ejecutarChequeos` es la parte que consulta la red.
import { contract, xdr } from '@stellar/stellar-sdk'
import { FAUCET_URL, NETWORK_PASSPHRASE, RPC_URL, SIMBOLO, TANDA_ID } from '../config'
import { clienteLectura } from './contrato'
import { leerTotal } from './lectura'
import { activoToken, direccionBoveda, saldoToken, servidor } from './rpc'

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

// ---------------------------------------------------------------------------
// (M3) ¿La web y el contrato desplegado coinciden?
// Si VITE_TANDA_ID apunta a un contrato de otra versión, la web carga igual, pero lo que cambió falla
// recién al usarlo. Se compara la interfaz del contrato desplegado (su WASM) con la del cliente
// generado que trae la web: funciones con sus argumentos y tipos con sus campos. Los comentarios no
// cuentan, así un cambio de texto no da un falso error.
// ---------------------------------------------------------------------------

/** Una parte de la interfaz: su nombre y una firma sin comentarios (igual firma = igual interfaz). */
export type ParteInterfaz = { nombre: string; firma: string }

const tipo = (t: xdr.ScSpecTypeDef) => t.toXdr('base64')
const texto = (s: { toString(): string }) => s.toString()

/** Firma de una entrada del spec del contrato. Los eventos no se comparan: no cambian las llamadas. */
export function parteDeInterfaz(e: xdr.ScSpecEntry): ParteInterfaz | null {
  switch (e.type) {
    case 'scSpecEntryFunctionV0': {
      const f = e.functionV0
      const args = f.inputs.map((a) => `${texto(a.name)}:${tipo(a.type)}`)
      return { nombre: texto(f.name), firma: `fn(${args.join(',')})->${f.outputs.map(tipo).join(',')}` }
    }
    case 'scSpecEntryUdtStructV0': {
      const u = e.udtStructV0
      return { nombre: texto(u.name), firma: `struct{${u.fields.map((c) => `${texto(c.name)}:${tipo(c.type)}`).join(',')}}` }
    }
    case 'scSpecEntryUdtUnionV0': {
      const u = e.udtUnionV0
      const casos = u.cases.map((c) =>
        c.type === 'scSpecUdtUnionCaseVoidV0'
          ? texto(c.voidCase.name)
          : `${texto(c.tupleCase.name)}(${c.tupleCase.type.map(tipo).join(',')})`,
      )
      return { nombre: texto(u.name), firma: `union{${casos.join(',')}}` }
    }
    case 'scSpecEntryUdtEnumV0': {
      const u = e.udtEnumV0
      return { nombre: texto(u.name), firma: `enum{${u.cases.map((c) => `${texto(c.name)}=${c.value}`).join(',')}}` }
    }
    case 'scSpecEntryUdtErrorEnumV0': {
      const u = e.udtErrorEnumV0
      return { nombre: texto(u.name), firma: `error{${u.cases.map((c) => `${texto(c.name)}=${c.value}`).join(',')}}` }
    }
    default:
      return null
  }
}

export const interfazDe = (entradas: xdr.ScSpecEntry[]): ParteInterfaz[] =>
  entradas.map(parteDeInterfaz).filter((p): p is ParteInterfaz => p !== null)

/** Compara lo que espera la web con lo que tiene el contrato desplegado. */
export function evaluarInterfaz(desplegada: ParteInterfaz[], esperada: ParteInterfaz[]): Resultado {
  const tiene = new Set(desplegada.map((p) => `${p.nombre}|${p.firma}`))
  const distintas = esperada.filter((p) => !tiene.has(`${p.nombre}|${p.firma}`)).map((p) => p.nombre)
  if (distintas.length === 0) {
    return { nivel: 'ok', detalle: `Coinciden: el contrato tiene las ${esperada.length} funciones y tipos que usa esta web.` }
  }
  const lista = distintas.slice(0, 5).join(', ') + (distintas.length > 5 ? ` y ${distintas.length - 5} más` : '')
  return {
    nivel: 'error',
    detalle: `El contrato desplegado es de otra versión: le faltan o le cambiaron ${distintas.length === 1 ? 'una parte' : `${distintas.length} partes`} que usa esta web (${lista}).`,
    solucion:
      'Despliega el contrato que corresponde a esta versión de la web (bash scripts/desplegar_testnet.sh) y actualiza VITE_TANDA_ID, en Vercel y en web/.env.local. Si el contrato es el correcto, la web es de otra versión: vuelve a desplegar la web del mismo commit.',
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
      'interfaz',
      'La web y el contrato coinciden',
      async () => {
        const desplegado = await contract.Client.from({
          contractId: TANDA_ID,
          networkPassphrase: NETWORK_PASSPHRASE,
          rpcUrl: RPC_URL,
          allowHttp: RPC_URL.startsWith('http://'),
        })
        return evaluarInterfaz(interfazDe(desplegado.spec.entries), interfazDe(clienteLectura().spec.entries))
      },
      { nivel: 'aviso', solucion: 'No se pudo leer el contrato desplegado para compararlo con la web. Vuelve a revisar en un rato.' },
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
  ])
}
