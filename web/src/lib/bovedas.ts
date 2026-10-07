// Revisión de las bóvedas para #/estado (misión M1).
//
// Hay dos bóvedas de TUSD:
// - la principal, con el interés de la vida real (5 % al año), para tandas de días, semanas o meses;
// - la rápida, acelerada, solo para las tandas de prueba (rondas de hasta 10 minutos).
// Su saldo bruto engaña, porque incluye las garantías depositadas. Por eso calculamos lo que de verdad les
// queda libre para pagar intereses y, si están aceleradas, cuánto rendiría hoy una demo de 5 minutos: el
// interés crece en línea recta desde que se despliegan, así que una bóveda acelerada vieja rinde cada vez menos.
//
// Las funciones `precio...`, `libre...`, `rinde...` y `evaluar...` son puras y repiten la fórmula del
// contrato (contracts/boveda_simulada); las `leer...` consultan la red.
import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk'
import { SIMBOLO, TANDA_ID } from '../config'
import { monto, porcentaje } from './formato'
import type { Nivel } from './estado'
import { saldoToken, servidor, simular } from './rpc'

export type Resultado = { nivel: Nivel; detalle: string; solucion?: string }

const U = 10_000_000n
/** 1,0 con 7 decimales, igual que `ESCALA` en el contrato de la bóveda. */
const ESCALA = 10_000_000n
const SEGUNDOS_POR_ANIO = 31_536_000n
const HORA = 3_600
const DIA = 86_400
const ANIO = 365 * DIA

/** Lo que guarda una bóveda simulada, más su saldo de TUSD. */
export type DatosBoveda = {
  aprBps: number
  /** Cuántas veces más rápido corre el tiempo para los intereses (1 = como en la vida real). */
  acelerador: number
  /** Desde cuándo corre el interés (segundos Unix): el momento en que se desplegó. */
  inicio: number
  /** Participaciones de todos juntos. null en la versión anterior de la bóveda, que no lo sabe decir. */
  totalShares: bigint | null
  /** TUSD de la bóveda: las garantías depositadas más lo que tiene para pagar intereses. */
  saldo: bigint
}

// ---------------------------------------------------------------------------
// Cálculos (puros)
// ---------------------------------------------------------------------------

/** Precio de una participación (7 decimales) sin el tope: crece en línea recta desde `inicio`. */
export function precioLineal(d: DatosBoveda, ahora: number): bigint {
  const transcurrido = BigInt(Math.max(0, Math.floor(ahora - d.inicio)))
  return ESCALA + (ESCALA * BigInt(d.aprBps) * transcurrido * BigInt(d.acelerador)) / (10_000n * SEGUNDOS_POR_ANIO)
}

/** El precio de verdad: el lineal con el tope de solvencia (la bóveda nunca promete más de lo que tiene). */
export function precio(d: DatosBoveda, ahora: number): bigint {
  const lineal = precioLineal(d, ahora)
  if (d.totalShares === null || d.totalShares <= 0n) return lineal
  const tope = (d.saldo * ESCALA) / d.totalShares
  const p = lineal < tope ? lineal : tope
  return p > 1n ? p : 1n
}

/** TUSD que la bóveda todavía no le debe a nadie: lo que le queda para pagar intereses (null si no se sabe). */
export function libreParaIntereses(d: DatosBoveda, ahora: number): bigint | null {
  if (d.totalShares === null) return null
  const debe = (d.totalShares * precio(d, ahora)) / ESCALA
  return d.saldo > debe ? d.saldo - debe : 0n
}

/** Cuánto rendirían `cuanto` TUSD depositados ahora durante `segundos` (por defecto, 100 TUSD en 5 minutos). */
export function rindeDemo(d: DatosBoveda, ahora: number, segundos = 300, cuanto = 100n * U): bigint {
  const sube = (ESCALA * BigInt(d.aprBps) * BigInt(segundos) * BigInt(d.acelerador)) / (10_000n * SEGUNDOS_POR_ANIO)
  const gana = (cuanto * sube) / precio(d, ahora)
  // Nunca más de lo que le queda libre: cuando se acaba, el rendimiento se detiene.
  const libre = libreParaIntereses(d, ahora)
  return libre !== null && libre < gana ? libre : gana
}

/**
 * Cuántos segundos alcanza lo libre para pagar los intereses de lo depositado hoy, al ritmo de hoy.
 * null si no se sabe o si nadie tiene nada depositado.
 */
export function alcanzaPara(d: DatosBoveda, ahora: number): number | null {
  const libre = libreParaIntereses(d, ahora)
  if (libre === null || d.totalShares === null || d.totalShares <= 0n) return null
  // Cada participación gana `apr * acelerador / año` TUSD por segundo (el precio sube en línea recta).
  const porSegundo = (Number(d.totalShares) * d.aprBps * d.acelerador) / (10_000 * Number(SEGUNDOS_POR_ANIO))
  return porSegundo > 0 ? Number(libre) / porSegundo : null
}

/** "menos de una hora", "unas 5 horas", "unos 12 días", "unos 4 meses", "más de un año"... */
export function aproximado(segundos: number): string {
  const horas = Math.round(segundos / HORA)
  if (segundos < HORA) return 'menos de una hora'
  if (segundos < 2 * DIA) return horas === 1 ? 'una hora' : `unas ${horas} horas`
  if (segundos < 60 * DIA) return `unos ${Math.round(segundos / DIA)} días`
  if (segundos < ANIO) return `unos ${Math.round(segundos / (30 * DIA))} meses`
  if (segundos < 2 * ANIO) return 'más de un año'
  if (segundos < 10 * ANIO) return `más de ${Math.floor(segundos / ANIO)} años`
  return 'más de 10 años'
}

/** Edad legible: "20 minutos", "1 hora", "5 horas", "2 días". */
export function edad(segundos: number): string {
  const minutos = Math.max(1, Math.round(segundos / 60))
  if (minutos < 60) return minutos === 1 ? '1 minuto' : `${minutos} minutos`
  const horas = Math.round(segundos / HORA)
  if (segundos < 2 * DIA) return horas === 1 ? '1 hora' : `${horas} horas`
  return `${Math.round(segundos / DIA)} días`
}

// ---------------------------------------------------------------------------
// Evaluación para #/estado (pura)
// ---------------------------------------------------------------------------

/** Una demo de 5 minutos debería rendir al menos esto por cada 100 TUSD (una bóveda rápida nueva rinde 2,50). */
export const RINDE_DEMO_MIN = 1n * U
/** Con menos libre que esto, a la bóveda rápida le quedan intereses para pocas demos. */
export const LIBRE_RAPIDA_MIN = 500n * U
/** La principal debería tener al menos esto libre y, si hay garantías depositadas, un año de sus intereses. */
export const LIBRE_PRINCIPAL_MIN = 100n * U

const recargar = (variable: '$BOVEDA' | '$BOVEDA_RAPIDA') =>
  `source scripts/.contratos && stellar contract invoke --id $TOKEN --source emisor --network testnet -- mint --to ${variable} --amount 100000000000 (10 000 ${SIMBOLO})`

const SE_DETIENE = 'si se acaba, el rendimiento se detiene, pero nadie pierde lo que depositó'

/** "1 minuto equivale a 36,5 días de intereses". */
function textoAcelerador(acelerador: number): string {
  const dias = (acelerador * 60) / DIA
  return `1 minuto equivale a ${dias.toLocaleString('es-CR', { maximumFractionDigits: 1 })} días de intereses`
}

/** Bóveda principal: la de las tandas de días, semanas o meses (y, en la versión anterior, la única). */
export function evaluarPrincipal(d: DatosBoveda, ahora: number): Resultado {
  // Versión anterior del contrato: una sola bóveda, acelerada para la demo.
  if (d.acelerador > 1) return evaluarAcelerada(d, ahora, 'unica')

  const ritmo = `Rinde al ritmo de la vida real (${porcentaje(d.aprBps)} al año).`
  const libre = libreParaIntereses(d, ahora)
  if (libre === null) {
    const detalle = `${ritmo} Tiene ${monto(d.saldo)} ${SIMBOLO}, contando las garantías depositadas.`
    return d.saldo < LIBRE_PRINCIPAL_MIN
      ? { nivel: 'aviso', detalle, solucion: `Recárgala (${SE_DETIENE}): ${recargar('$BOVEDA')}.` }
      : { nivel: 'ok', detalle }
  }
  const tiempo = alcanzaPara(d, ahora)
  const detalle =
    `${ritmo} Tiene ${monto(libre)} ${SIMBOLO} libres para pagar intereses` +
    (tiempo !== null ? `: con las garantías de hoy alcanzan para ${aproximado(tiempo)}.` : '.')
  if (libre >= LIBRE_PRINCIPAL_MIN && (tiempo === null || tiempo >= ANIO)) return { nivel: 'ok', detalle }
  return {
    nivel: 'aviso',
    detalle,
    solucion: `Recárgala para que las tandas sigan rindiendo (${SE_DETIENE}): ${recargar('$BOVEDA')}.`,
  }
}

/**
 * Bóveda rápida: la de las tandas de prueba (rondas de hasta 10 minutos). `rapida` es null si el contrato
 * no tiene una configurada; `principal` sirve para saber si es la versión anterior (una sola bóveda acelerada).
 */
export function evaluarRapida(rapida: DatosBoveda | null, principal: DatosBoveda | null, ahora: number): Resultado {
  if (rapida !== null) return evaluarAcelerada(rapida, ahora, 'rapida')
  if (principal !== null && principal.acelerador > 1) {
    return { nivel: 'ok', detalle: 'No hace falta: este contrato usa una sola bóveda, ya acelerada (versión anterior).' }
  }
  return {
    nivel: 'aviso',
    detalle:
      'No hay bóveda rápida: las tandas de prueba usan la principal, que rinde al ritmo de la vida real (casi nada en una demo de minutos).',
    solucion: 'Para que la demo muestre rendimiento: `bash scripts/renovar_boveda_rapida.sh` (crea una y la configura en la tanda).',
  }
}

function evaluarAcelerada(d: DatosBoveda, ahora: number, cual: 'rapida' | 'unica'): Resultado {
  const rinde = rindeDemo(d, ahora)
  const libre = libreParaIntereses(d, ahora)
  const partes = [
    `Acelerada para la demo: ${textoAcelerador(d.acelerador)}.`,
    rinde > 0n
      ? `Una demo de 5 minutos rinde hoy ~${monto(rinde)} ${SIMBOLO} por cada 100.`
      : 'Una demo de 5 minutos hoy no rendiría nada.',
  ]
  if (libre !== null) partes.push(`Tiene ${monto(libre)} ${SIMBOLO} libres para pagar intereses.`)
  else partes.push(`Tiene ${monto(d.saldo)} ${SIMBOLO}, contando las garantías depositadas.`)

  const nueva =
    cual === 'rapida'
      ? 'cámbiala por una nueva con `bash scripts/renovar_boveda_rapida.sh` (las tandas que ya existen siguen con la suya)'
      : 'despliega los contratos nuevos con `bash scripts/desplegar_testnet.sh`, que separa la bóveda principal (ritmo real) de la rápida (demo)'
  const soluciones: string[] = []
  // Rinde poco por vieja: aunque le sobrara dinero para intereses, rendiría menos que el mínimo.
  const sinTope = { ...d, totalShares: null }
  if (rindeDemo(sinTope, ahora) < RINDE_DEMO_MIN) {
    soluciones.push(
      `Rinde poco porque se desplegó hace ${edad(ahora - d.inicio)}: su interés crece en línea recta, así que cada hora rinde menos por minuto. Antes de grabar la demo, ${nueva}.`,
    )
  }
  const sinFondos = libre !== null ? libre < LIBRE_RAPIDA_MIN : d.saldo < LIBRE_RAPIDA_MIN
  if (sinFondos) {
    soluciones.push(
      `Le queda poco para pagar intereses (${SE_DETIENE}). Recárgala: ${recargar(cual === 'rapida' ? '$BOVEDA_RAPIDA' : '$BOVEDA')}.`,
    )
  }
  const detalle = partes.join(' ')
  return soluciones.length > 0 ? { nivel: 'aviso', detalle, solucion: soluciones.join(' ') } : { nivel: 'ok', detalle }
}

// ---------------------------------------------------------------------------
// Lectura de la red
// ---------------------------------------------------------------------------

/** El almacenamiento de la instancia de un contrato, como `nombre de la clave -> valor` (claves sin datos). */
async function leerInstancia(contrato: string): Promise<Map<string, unknown>> {
  const entrada = await servidor().getContractData(contrato, xdr.ScVal.scvLedgerKeyContractInstance(), rpc.Durability.Persistent)
  // En el SDK 17 el XDR se recorre con propiedades: dato del contrato -> valor -> instancia -> almacenamiento.
  const dato = entrada.val
  const valor = dato.type === 'contractData' ? dato.contractData.val : null
  const almacen = valor?.type === 'scvContractInstance' ? (valor.instance.storage ?? []) : []
  const claves = new Map<string, unknown>()
  for (const e of almacen) {
    const clave = scValToNative(e.key) as unknown
    // Las claves son enums de Rust sin datos: ['Boveda'], ['BovedaRapida'], ['Inicio']...
    if (Array.isArray(clave) && clave.length === 1 && typeof clave[0] === 'string') claves.set(clave[0], scValToNative(e.val))
  }
  return claves
}

/** Direcciones de las bóvedas guardadas en el contrato de la tanda (la rápida es opcional). */
export async function direccionesBovedas(): Promise<{ principal: string; rapida: string | null }> {
  const tanda = await leerInstancia(TANDA_ID)
  const principal = tanda.get('Boveda')
  if (typeof principal !== 'string') throw new Error('No encontramos la bóveda en el contrato.')
  const rapida = tanda.get('BovedaRapida')
  return { principal, rapida: typeof rapida === 'string' ? rapida : null }
}

/** Lee una bóveda simulada: su configuración, su saldo y el total de participaciones. */
export async function leerBoveda(direccion: string): Promise<DatosBoveda> {
  const [datos, saldo, total] = await Promise.all([
    leerInstancia(direccion),
    saldoToken(direccion),
    // La versión anterior de la bóveda no tiene `total_shares`: entonces no se sabe cuánto está libre.
    simular(direccion, 'total_shares').then(
      (v) => BigInt(v as bigint | number | string),
      () => null,
    ),
  ])
  return {
    aprBps: Number(datos.get('AprBps') ?? 0),
    acelerador: Number(datos.get('Acelerador') ?? 1),
    inicio: Number(datos.get('Inicio') ?? 0),
    totalShares: total,
    saldo,
  }
}
