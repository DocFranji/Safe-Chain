// RPC de Stellar + Horizon + Friendbot + faucet + Freighter SIMULADOS, para probar la web sin red.
// Codifica las respuestas con el mismo Spec del contrato que usa el cliente real.
import { Client } from '../packages/tanda/dist/index.js'
import { Client as ClienteHistorial } from '../packages/historial/dist/index.js'
import * as SDK from '../node_modules/@stellar/stellar-sdk/lib/esm/index.js'

const { xdr, StrKey, nativeToScVal, TransactionBuilder, Address, scValToNative, SorobanDataBuilder } = SDK

export const PASS = 'Test SDF Network ; September 2015'
export const TANDA_ID = 'CDLSK5Z65A645XS5X6IMJAUOYBLXZFLP7SNM3DB62LFQKFUKNDCKKEGV'
export const TOKEN_ID = 'CDM2YCJVE37HUCNOY5E65NOEKTQVQM2WD6CUVHSL5WZFVISPIUIYHAQ5'
export const BOVEDA_ID = StrKey.encodeContract(Buffer.alloc(32, 7))
/** M1: bóveda "real" (sin acelerar) para tandas de días, semanas o meses. La de arriba es la rápida. */
export const BOVEDA_REAL = StrKey.encodeContract(Buffer.alloc(32, 8))
/** M2: contrato de historial crediticio (la tanda simulada lo devuelve en `get_historial`). */
export const HISTORIAL_ID = StrKey.encodeContract(Buffer.alloc(32, 9))
export const ANA = 'GADMQOSHB74SMBATS6IF67ZKS2KJPQC4FOM6NDGGWADEUT253XCATVPD'
export const BETO = 'GBPDH2E2EX5D7DO76YRIX477LPJWNPB7MJZRTEDJWBKZMS5KTLLRU2LO'
export const CARLA = 'GDPIB76VVYNDJINI6BRYGVOKTPOTERZABL43OB7DIOCLTXSKEUMJWNUN'
export const ME = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 5))
export const EMISOR = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 6))
export const U = 10_000_000n

const cliente = new Client({ contractId: TANDA_ID, networkPassphrase: PASS, rpcUrl: 'https://mock.test' })
const spec = cliente.spec
const specHistorial = new ClienteHistorial({ contractId: HISTORIAL_ID, networkPassphrase: PASS, rpcUrl: 'https://mock.test' }).spec

const ahora = () => Math.floor(Date.now() / 1000)
const miembro = (posicion, o = {}) => ({
  atrasos: 0, cobro: false, colateral: 100n * U, colateral_inicial: 100n * U, deuda: 0n, moroso: false, multas_pendientes: 0n, posicion, ...o,
})
const tanda = (o = {}) => ({
  cobertura_bps: 10000, creador: ME, cuota: 100n * U, estado: { tag: 'Abierta', values: undefined }, fondo_premios: 0n,
  inicio_ronda: 0n, n_miembros: 3, penalidad_bps: 1000, periodo_seg: 120n, retenido: 0n, ronda_actual: 0, shares_boveda: 0n, token: TOKEN_ID, ...o,
})
const est = (tag) => ({ tag, values: undefined })

export function nuevoEstado() {
  return {
    tandas: {
      1: {
        tanda: tanda({ creador: ANA, estado: est('Finalizada'), ronda_actual: 3, fondo_premios: 10n * U, inicio_ronda: BigInt(ahora() - 900) }),
        miembros: [
          [ANA, miembro(0, { colateral: 0n, colateral_inicial: 200n * U, atrasos: 2, cobro: true })],
          [BETO, miembro(1, { colateral: 0n, atrasos: 1, cobro: true, multas_pendientes: 0n })],
          [CARLA, miembro(2, { colateral: 0n, cobro: true })],
        ],
        pagaron: [],
        liquidados: [[ANA, 0n], [BETO, 945_000_000n], [CARLA, 1_140_000_000n]],
        finalizada: { rendimiento: 85_000_000n, fondo_premios: 10n * U, retenido: 0n, sin_repartir: 0n },
      },
      2: {
        tanda: tanda({ creador: BETO, estado: est('Activa'), ronda_actual: 1, inicio_ronda: BigInt(ahora() - 45), shares_boveda: 400n * U }),
        miembros: [
          [ANA, miembro(0, { colateral: 200n * U, colateral_inicial: 200n * U, cobro: true })],
          [BETO, miembro(1)],
          [CARLA, miembro(2)],
        ],
        pagaron: [BETO],
      },
      3: {
        tanda: tanda({ creador: ME, shares_boveda: 200n * U }),
        miembros: [[ANA, miembro(0, { colateral: 200n * U, colateral_inicial: 200n * U })]],
        pagaron: [],
      },
      4: { tanda: tanda({ creador: CARLA, estado: est('Cancelada') }), miembros: [], pagaron: [] },
      5: {
        tanda: tanda({ creador: BETO, n_miembros: 5, cobertura_bps: 5000, periodo_seg: 604800n, cuota: 50n * U }),
        miembros: [[BETO, miembro(0, { colateral: 100n * U, colateral_inicial: 100n * U })], [CARLA, miembro(1, { colateral: 75n * U, colateral_inicial: 75n * U })]],
        pagaron: [],
      },
    },
    cuentas: {
      [ME]: { existe: true, trustline: true, saldo: 1000n * U },
      [BOVEDA_ID]: { existe: true, trustline: true, saldo: 10000n * U },
      [BOVEDA_REAL]: { existe: true, trustline: true, saldo: 5000n * U },
    },
    // M1: lo que guarda la instancia del contrato de la tanda (la bóveda rápida es opcional) y la de
    // cada bóveda (para #/estado). La rápida se desplegó hace 10 minutos; la principal, hace un mes.
    instanciaTanda: { Boveda: BOVEDA_REAL, BovedaRapida: BOVEDA_ID },
    bovedas: {
      [BOVEDA_ID]: { acelerador: 52_560, inicio: ahora() - 600, total: 600n * U },
      [BOVEDA_REAL]: { acelerador: 1, inicio: ahora() - 30 * 86_400, total: 1000n * U },
    },
    contratoCaido: false,
    // M2: historial de cada dirección (lo que no está, vale cero). `historialActivo: false` simula un
    // contrato de tanda anterior a M2 (sin `get_historial`).
    historialActivo: true,
    historiales: {
      [ANA]: historial({ cuotas_a_tiempo: 30, tandas_cumplidas: 3, cobros: 3, puntos_positivos: 330 }),
      [BETO]: historial({ cuotas_a_tiempo: 11, cuotas_tarde: 1, tandas_con_atrasos: 1, cobros: 1, puntos_positivos: 138 }),
      [CARLA]: historial({ cuotas_a_tiempo: 4, cuotas_cubiertas: 1, veces_moroso: 1, deudas_saldadas: 1, puntos_positivos: 100, puntos_negativos: 115 }),
      [ME]: historial({ cuotas_a_tiempo: 6, tandas_cumplidas: 1, cobros: 1, puntos_positivos: 110 }),
    },
    faucetStatus: null,
    eventosPedidos: 0,
    llamadas: [],
  }
}

// --- M3: turnos -------------------------------------------------------------
/** `Miembro.posicion` de quien todavía no tiene turno (u32::MAX en el contrato). */
export const SIN_TURNO = 4_294_967_295
const opcionesTurnos = (tag, o = {}) => ({
  modo: { tag, values: undefined }, permitir_intercambio: false, prima_max_bps: 0, descuento_max_bps: 0,
  primeros_con_historial: 0, puntaje_primeros: 0, ofertas_selladas: false, ...o,
})
const estadoTurnos = (opciones, o = {}) => ({
  opciones, mejor_postor: null, mejor_oferta_bps: 0, respaldo: [], propuestas: [], fondo_primas: 0n, sellos: [], fin_sellado: 0n, ...o,
})

/**
 * Las 5 tandas de siempre más una de cada modo de turnos (M3), en otro estado para no cambiar
 * los escenarios de siempre: 7 sorteo abierta, 8 precio por turno abierta, 9 subasta en curso
 * (ME aún sin turno, Beto ofertó 5 %), 10 elegir + intercambio en curso (Carla le propone a ME).
 * (La 6 queda libre para otras misiones: M1 la usa para su tanda con deudas.)
 */
export function nuevoEstadoTurnos() {
  const e = nuevoEstado()
  // La 6 es una tanda de siempre (cancelada) para que los ids queden seguidos (el lobby pide 1..total).
  e.tandas[6] = { tanda: tanda({ creador: CARLA, estado: est('Cancelada') }), miembros: [], pagaron: [] }
  e.tandas[7] = {
    tanda: tanda({ creador: ANA, shares_boveda: 100n * U }),
    miembros: [[ANA, miembro(SIN_TURNO)]],
    pagaron: [],
    turnos: estadoTurnos(opcionesTurnos('Sorteo')),
  }
  e.tandas[8] = {
    tanda: tanda({ creador: ANA, shares_boveda: 100n * U }),
    miembros: [[ANA, miembro(1)]],
    pagaron: [],
    turnos: estadoTurnos(opcionesTurnos('PrecioPorTurno', { prima_max_bps: 800 })),
  }
  e.tandas[9] = {
    tanda: tanda({ creador: BETO, estado: est('Activa'), inicio_ronda: BigInt(ahora() - 30), shares_boveda: 300n * U }),
    miembros: [[ME, miembro(SIN_TURNO)], [BETO, miembro(SIN_TURNO)], [CARLA, miembro(SIN_TURNO)]],
    pagaron: [BETO],
    turnos: estadoTurnos(opcionesTurnos('Subasta', { descuento_max_bps: 3000 }), {
      mejor_postor: BETO, mejor_oferta_bps: 500, respaldo: [CARLA, ME, BETO],
    }),
  }
  e.tandas[10] = {
    tanda: tanda({ creador: CARLA, estado: est('Activa'), inicio_ronda: BigInt(ahora() - 30), shares_boveda: 400n * U }),
    miembros: [[ANA, miembro(0, { colateral: 200n * U, colateral_inicial: 200n * U })], [ME, miembro(1)], [CARLA, miembro(2)]],
    pagaron: [],
    turnos: estadoTurnos(opcionesTurnos('Eleccion', { permitir_intercambio: true }), {
      propuestas: [{ de: CARLA, con: ME, compensacion: 10n * U }],
    }),
  }
  return e
}

/**
 * M3: la subasta de la tanda 9 con ofertas selladas. `sellar`: falta medio minuto para revelar y Beto
 * ya selló. `revelar`: ya se revela; Beto reveló 5 % y "yo" y Carla sellamos sin revelar todavía.
 */
export function conSubastaSellada(e, fase) {
  const t = e.tandas[9]
  t.turnos.opciones = { ...t.turnos.opciones, ofertas_selladas: true }
  if (fase === 'sellar') {
    Object.assign(t.turnos, { fin_sellado: BigInt(ahora() + 30), sellos: [BETO], mejor_postor: null, mejor_oferta_bps: 0 })
  } else {
    Object.assign(t.turnos, { fin_sellado: BigInt(ahora() - 10), sellos: [ME, CARLA], mejor_postor: BETO, mejor_oferta_bps: 500 })
  }
  return e
}

/** M2 + M3: los primeros `k` turnos de la tanda `id` piden `puntaje` de historial. */
export function conPrimerosConHistorial(e, id, k, puntaje) {
  e.tandas[id].turnos.opciones = { ...e.tandas[id].turnos.opciones, primeros_con_historial: k, puntaje_primeros: puntaje }
  return e
}

function primaPara(t, primaBps, pos) {
  const n = BigInt(t.n_miembros)
  return (t.cuota * n * BigInt(primaBps) * (n - 1n - 2n * BigInt(pos))) / ((n - 1n) * 10000n)
}

const addr = (a) => nativeToScVal(a, { type: 'address' })

/**
 * M1: agrega la tanda 6, MENSUAL y en curso (ronda 3 de 4, le toca a Carla). "Yo" (turno 4) quedé en mora:
 * debo 100 TUSD de la ronda 2, que se le deben a Beto. Carla ya saldó su deuda. Usa la bóveda real.
 * No está en `nuevoEstado()` para no cambiar los escenarios que cuentan tandas.
 */
export function conTandaMorosa(e) {
  const mes = 2_592_000
  e.tandas[6] = {
    boveda: BOVEDA_REAL,
    tanda: tanda({
      creador: BETO, estado: est('Activa'), n_miembros: 4, ronda_actual: 2, cobertura_bps: 0, periodo_seg: BigInt(mes),
      inicio_ronda: BigInt(ahora() - 5 * 86_400), shares_boveda: 200n * U,
    }),
    miembros: [
      [ANA, miembro(0, { cobro: true })],
      [BETO, miembro(1, { cobro: true })],
      [CARLA, miembro(2, { colateral: 0n, atrasos: 2, multas_pendientes: 10n * U })],
      [ME, miembro(3, { colateral: 0n, atrasos: 2, moroso: true, deuda: 100n * U, multas_pendientes: 10n * U })],
    ],
    pagaron: [ANA],
    deudas: [
      [CARLA, { faltantes: [], bolsa_retenida: 0n, pagado: 50n * U }],
      [ME, { faltantes: [{ ronda: 1, acreedor: BETO, monto: 100n * U }], bolsa_retenida: 0n, pagado: 0n }],
    ],
  }
  return e
}

/**
 * M1: agrega la tanda 6, en curso y con la ronda 2 vencida: me toca cobrar a mí ("Tu bolsa está lista:
 * cóbrala"). Ana y yo pagamos; Beto no, y su garantía (40 TUSD) no le alcanza: la bolsa sale con 60 menos.
 * Usa el id 6 (el lobby lee las tandas 1..total), así que no se combina con `conTandaMorosa`.
 */
export function conMiBolsaLista(e) {
  e.tandas[6] = {
    tanda: tanda({
      creador: ANA, estado: est('Activa'), ronda_actual: 1, periodo_seg: 120n, inicio_ronda: BigInt(ahora() - 300), shares_boveda: 240n * U,
    }),
    miembros: [
      [ANA, miembro(0, { cobro: true })],
      [ME, miembro(1)],
      [BETO, miembro(2, { colateral: 40n * U })],
    ],
    pagaron: [ANA, ME],
  }
  e.historias = { ...e.historias, 6: [] } // la historia de la tanda 6 del mock es la de `conTandaMorosa`
  return e
}
/** M2: un historial con todo en cero salvo lo que se indique. */
export function historial(o = {}) {
  const base = {
    cuotas_a_tiempo: 0, cuotas_tarde: 0, cuotas_cubiertas: 0, veces_moroso: 0, deudas_saldadas: 0, tandas_cumplidas: 0,
    tandas_con_atrasos: 0, cobros: 0, monto_pagado: 0n, puntos_positivos: 0, puntos_negativos: 0, primera_actividad: 0n, ultima_actividad: 0n,
  }
  const h = { ...base, ...o }
  if (h.puntos_positivos || h.puntos_negativos) {
    h.monto_pagado ||= BigInt(h.cuotas_a_tiempo + h.cuotas_tarde) * 100n * U
    h.primera_actividad ||= BigInt(ahora() - 90 * 86_400)
    h.ultima_actividad ||= BigInt(ahora() - 86_400)
  }
  return h
}

/**
 * M2: agrega la tanda 7, abierta y vacía, de 6 personas, que pide historial Bronce (100 puntos) y da
 * descuento. "Yo" (Bronce, 110 puntos) entraría en el turno 1: garantía normal 500, con descuento 450.
 */
export function conTandaExigente(e) {
  e.tandas[7] = {
    tanda: tanda({ creador: BETO, n_miembros: 6 }),
    miembros: [],
    pagaron: [],
    requisitos: { puntaje_minimo: 100, descuento: true },
  }
  return e
}

const puntaje = (h) => Math.max(0, h.puntos_positivos - h.puntos_negativos)
const nivelDe = (p) => (p >= 600 ? 3 : p >= 300 ? 2 : p >= 100 ? 1 : 0)
const beneficioDe = (h) => (h.veces_moroso > h.deudas_saldadas ? 0 : [0, 1000, 2500, 5000][nivelDe(puntaje(h))])

const i128 = (n) => nativeToScVal(BigInt(n), { type: 'i128' })
const u32 = (n) => nativeToScVal(n, { type: 'u32' })
const u64 = (n) => nativeToScVal(BigInt(n), { type: 'u64' })

function colateralPara(t, pos) {
  const restantes = BigInt(t.n_miembros - 1 - pos)
  const base = (t.cuota * restantes * BigInt(t.cobertura_bps)) / 10000n
  return base > t.cuota ? base : t.cuota
}

function erroresContrato(codigo) {
  return { error: `HostError: Error(Contract, #${codigo})\n\nEvent log (newest first):\n   0: [Diagnostic Event] ...`, latestLedger: 1000 }
}

function valorSim(est, contrato, fn, args) {
  const nativos = args.map((a) => scValToNative(a))
  if (contrato === TANDA_ID && est.contratoCaido) return { error: { error: 'HostError: Error(Storage, MissingValue)', latestLedger: 1000 } }
  if (contrato === TANDA_ID) {
    if (fn === 'total_tandas') return u32(Object.keys(est.tandas).length)
    // --- M2 (sin id de tanda) ---
    if (fn === 'get_historial') {
      if (!est.historialActivo) return { error: { error: 'HostError: Error(WasmVm, MissingValue)', latestLedger: 1000 } }
      return addr(HISTORIAL_ID)
    }
    const id = nativos[0]
    const t = est.tandas[id]
    if (!t) return { error: erroresContrato(2) }
    if (fn === 'get_tanda') return spec.nativeToUdt(t.tanda, 'Tanda')
    if (fn === 'get_miembros') {
      return xdr.ScVal.scvVec(t.miembros.map(([a, m]) => xdr.ScVal.scvVec([addr(a), spec.nativeToUdt(m, 'Miembro')])))
    }
    if (fn === 'get_ronda') {
      return xdr.ScVal.scvVec([u32(t.tanda.ronda_actual), u64(t.tanda.inicio_ronda + t.tanda.periodo_seg), xdr.ScVal.scvVec(t.pagaron.map(addr))])
    }
    const turnos = t.turnos ?? estadoTurnos(opcionesTurnos('Llegada'))
    const modo = turnos.opciones.modo.tag
    // Garantía del próximo en unirse según el modo (como `turnos::colateral_base_siguiente`).
    const baseSiguiente = () => {
      if (modo === 'Sorteo' || modo === 'Subasta') return t.tanda.cuota
      const tomados = t.miembros.map(([, m]) => m.posicion)
      const libre = [...Array(t.tanda.n_miembros).keys()].find((i) => !tomados.includes(i))
      return colateralPara(t.tanda, modo === 'Llegada' ? t.miembros.length : libre)
    }
    // M2: descuento por historial si la tanda lo da (como `ganchos::ajustar_colateral`).
    const conDescuento = (quien, normal) => {
      if (!t.requisitos?.descuento) return normal
      const h = est.historiales[quien] ?? historial()
      const rebajada = normal - (normal * BigInt(beneficioDe(h))) / 10000n
      const piso = t.tanda.cuota < normal ? t.tanda.cuota : normal
      return rebajada > piso ? rebajada : piso
    }
    if (fn === 'colateral_siguiente') {
      if (t.miembros.length >= t.tanda.n_miembros) return { error: erroresContrato(6) }
      return i128(baseSiguiente())
    }
    // M3
    if (fn === 'get_estado_turnos') return spec.nativeToUdt(turnos, 'EstadoTurnos')
    if (fn === 'get_opciones') return spec.nativeToUdt(turnos.opciones, 'OpcionesTanda')
    if (fn === 'cotizar_turno') {
      const pos = Number(nativos[2])
      if (pos >= t.tanda.n_miembros) return { error: erroresContrato(32) }
      const col = modo === 'Sorteo' || modo === 'Subasta' ? t.tanda.cuota : colateralPara(t.tanda, pos)
      const prima = modo === 'PrecioPorTurno' ? primaPara(t.tanda, turnos.opciones.prima_max_bps, pos) : 0n
      return xdr.ScVal.scvVec([i128(conDescuento(nativos[1], col)), i128(prima)])
    }
    // --- M1 ---
    if (fn === 'get_boveda') return addr(t.boveda ?? BOVEDA_ID)
    if (fn === 'get_deudas') {
      return xdr.ScVal.scvVec((t.deudas ?? []).map(([a, d]) => xdr.ScVal.scvVec([addr(a), spec.nativeToUdt(d, 'Deuda')])))
    }
    // --- M2 ---
    if (fn === 'get_requisitos') return spec.nativeToUdt(t.requisitos ?? { puntaje_minimo: 0, descuento: false }, 'Requisitos')
    if (fn === 'colateral_para_miembro') {
      if (t.miembros.length >= t.tanda.n_miembros) return { error: erroresContrato(6) }
      return i128(conDescuento(nativos[1], baseSiguiente()))
    }
    if (fn === 'get_deuda') {
      const d = (t.deudas ?? []).find(([a]) => a === nativos[1])?.[1] ?? { faltantes: [], bolsa_retenida: 0n, pagado: 0n }
      return spec.nativeToUdt(d, 'Deuda')
    }
  }
  if (contrato === HISTORIAL_ID) {
    const h = est.historiales[nativos[0]] ?? historial()
    if (fn === 'historial') return specHistorial.nativeToUdt(h, 'Historial')
    if (fn === 'puntaje') return u32(puntaje(h))
    if (fn === 'beneficio_colateral_bps') return u32(beneficioDe(h))
  }
  if (contrato === TOKEN_ID) {
    if (fn === 'balance') return i128(est.cuentas[nativos[0]]?.saldo ?? 0n)
    if (fn === 'name') return nativeToScVal(`TUSD:${EMISOR}`, { type: 'string' })
  }
  if ((contrato === BOVEDA_ID || contrato === BOVEDA_REAL) && fn === 'valor') return i128((BigInt(nativos[0]) * 103n) / 100n)
  if (contrato === BOVEDA_ID && fn === 'acelerador') return u32(52_560)
  if (est.bovedas[contrato] && fn === 'total_shares') return i128(est.bovedas[contrato].total)
  if (contrato === BOVEDA_REAL && fn === 'acelerador') return u32(1)
  return { error: { error: `mock: no sé responder ${contrato}.${fn}`, latestLedger: 1000 } }
}

function simular(est, b64) {
  const tx = TransactionBuilder.fromXDR(b64, PASS)
  const op = tx.operations[0]
  const inv = op.func.invokeContract ?? op.func.value
  const contrato = Address.fromScAddress(inv.contractAddress).toString()
  const fn = String(inv.functionName)
  est.llamadas.push(`${contrato.slice(0, 4)}.${fn}`)
  const r = valorSim(est, contrato, fn, inv.args)
  if (r && r.error) return r.error
  return {
    latestLedger: 1000,
    results: [{ auth: [], xdr: r.toXDR('base64') }],
    transactionData: new SorobanDataBuilder().build().toXDR('base64'),
    minResourceFee: '100',
    cost: { cpuInsns: '0', memBytes: '0' },
  }
}

const SYM = (x) => xdr.ScVal.scvSymbol(x)
const TIPOS = {
  creada: { creador: ['symbol', 'address'], cuota: ['symbol', 'i128'], n_miembros: ['symbol', 'u32'] },
  unido: { miembro: ['symbol', 'address'], posicion: ['symbol', 'u32'], colateral: ['symbol', 'i128'] },
  iniciada: { inicio_ronda: ['symbol', 'u64'] },
  pago: { miembro: ['symbol', 'address'], ronda: ['symbol', 'u32'], tarde: ['symbol', 'bool'] },
  cubierto: { miembro: ['symbol', 'address'], ronda: ['symbol', 'u32'], monto: ['symbol', 'i128'] },
  moroso: { miembro: ['symbol', 'address'], deuda: ['symbol', 'i128'] },
  ronda: { ronda: ['symbol', 'u32'], beneficiario: ['symbol', 'address'], monto_pagado: ['symbol', 'i128'] },
  liquidado: { miembro: ['symbol', 'address'], monto: ['symbol', 'i128'] },
  finalizada: { rendimiento: ['symbol', 'i128'], fondo_premios: ['symbol', 'i128'], retenido: ['symbol', 'i128'], sin_repartir: ['symbol', 'i128'] },
  cancelada: {},
  oferta: { miembro: ['symbol', 'address'], ronda: ['symbol', 'u32'], descuento_bps: ['symbol', 'u32'], descuento: ['symbol', 'i128'] },
  inter_prop: { de: ['symbol', 'address'], con: ['symbol', 'address'], compensacion: ['symbol', 'i128'] },
  // M1
  deuda_pag: { miembro: ['symbol', 'address'], pagador: ['symbol', 'address'], monto: ['symbol', 'i128'], deuda_restante: ['symbol', 'i128'] },
  abono: { deudor: ['symbol', 'address'], acreedor: ['symbol', 'address'], ronda: ['symbol', 'u32'], monto: ['symbol', 'i128'], retenida: ['symbol', 'bool'] },
}

// Historias por tanda: [evento, datos]
const HISTORIAS = {
  1: [
    ['creada', { creador: ANA, cuota: 100n * U, n_miembros: 3 }],
    ['unido', { miembro: ANA, posicion: 0, colateral: 200n * U }],
    ['unido', { miembro: BETO, posicion: 1, colateral: 100n * U }],
    ['unido', { miembro: CARLA, posicion: 2, colateral: 100n * U }],
    ['iniciada', { inicio_ronda: 1n }],
    ['pago', { miembro: ANA, ronda: 0, tarde: false }],
    ['pago', { miembro: BETO, ronda: 0, tarde: false }],
    ['pago', { miembro: CARLA, ronda: 0, tarde: false }],
    ['ronda', { ronda: 0, beneficiario: ANA, monto_pagado: 300n * U }],
    ['pago', { miembro: BETO, ronda: 1, tarde: false }],
    ['pago', { miembro: CARLA, ronda: 1, tarde: false }],
    ['cubierto', { miembro: ANA, ronda: 1, monto: 100n * U }],
    ['ronda', { ronda: 1, beneficiario: BETO, monto_pagado: 300n * U }],
    ['pago', { miembro: CARLA, ronda: 2, tarde: false }],
    ['pago', { miembro: BETO, ronda: 2, tarde: true }],
    ['cubierto', { miembro: ANA, ronda: 2, monto: 100n * U }],
    ['ronda', { ronda: 2, beneficiario: CARLA, monto_pagado: 300n * U }],
    ['liquidado', { miembro: ANA, monto: 0n }],
    ['liquidado', { miembro: BETO, monto: 945_000_000n }],
    ['liquidado', { miembro: CARLA, monto: 1_140_000_000n }],
    ['finalizada', { rendimiento: 85_000_000n, fondo_premios: 10n * U, retenido: 0n, sin_repartir: 0n }],
  ],
  2: [
    ['creada', { creador: BETO, cuota: 100n * U, n_miembros: 3 }],
    ['unido', { miembro: ANA, posicion: 0, colateral: 200n * U }],
    ['unido', { miembro: BETO, posicion: 1, colateral: 100n * U }],
    ['unido', { miembro: CARLA, posicion: 2, colateral: 100n * U }],
    ['iniciada', { inicio_ronda: 1n }],
    ['pago', { miembro: ANA, ronda: 0, tarde: false }],
    ['pago', { miembro: BETO, ronda: 0, tarde: false }],
    ['pago', { miembro: CARLA, ronda: 0, tarde: false }],
    ['ronda', { ronda: 0, beneficiario: ANA, monto_pagado: 300n * U }],
    ['pago', { miembro: BETO, ronda: 1, tarde: false }],
  ],
  3: [
    ['creada', { creador: ME, cuota: 100n * U, n_miembros: 3 }],
    ['unido', { miembro: ANA, posicion: 0, colateral: 200n * U }],
  ],
  4: [
    ['creada', { creador: CARLA, cuota: 100n * U, n_miembros: 3 }],
    ['cancelada', {}],
  ],
  9: [
    ['creada', { creador: BETO, cuota: 100n * U, n_miembros: 3 }],
    ['unido', { miembro: ME, posicion: SIN_TURNO, colateral: 100n * U }],
    ['unido', { miembro: BETO, posicion: SIN_TURNO, colateral: 100n * U }],
    ['unido', { miembro: CARLA, posicion: SIN_TURNO, colateral: 100n * U }],
    ['iniciada', { inicio_ronda: 1n }],
    ['pago', { miembro: BETO, ronda: 0, tarde: false }],
    ['oferta', { miembro: BETO, ronda: 0, descuento_bps: 500, descuento: 15n * U }],
  ],
  10: [
    ['creada', { creador: CARLA, cuota: 100n * U, n_miembros: 3 }],
    ['inter_prop', { de: CARLA, con: ME, compensacion: 10n * U }],
  ],
  // M1: tanda mensual donde "yo" quedé en mora y Carla ya saldó su deuda (ver conTandaMorosa).
  6: [
    ['creada', { creador: BETO, cuota: 100n * U, n_miembros: 4 }],
    ['moroso', { miembro: CARLA, deuda: 50n * U }],
    ['moroso', { miembro: ME, deuda: 100n * U }],
    ['ronda', { ronda: 1, beneficiario: BETO, monto_pagado: 250n * U }],
    ['deuda_pag', { miembro: CARLA, pagador: CARLA, monto: 50n * U, deuda_restante: 0n }],
    ['abono', { deudor: CARLA, acreedor: BETO, ronda: 1, monto: 50n * U, retenida: false }],
  ],
}

function eventosDe(idTanda, est) {
  const base = Math.floor(Date.now() / 1000) - 600
  // Un escenario puede cambiar la historia de una tanda con `est.historias[id]`.
  return (est?.historias?.[idTanda] ?? HISTORIAS[idTanda] ?? []).map(([nombre, datos], i) => ({
    id: `${String(1000 + i).padStart(10, '0')}-0000000001`,
    type: 'contract',
    ledger: 900 + i,
    ledgerClosedAt: new Date((base + i * 12) * 1000).toISOString(),
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: 'ab'.repeat(32),
    contractId: TANDA_ID,
    topic: [SYM(nombre), u32(idTanda)].map((x) => x.toXDR('base64')),
    value: nativeToScVal(datos, { type: TIPOS[nombre] }).toXDR('base64'),
  }))
}

/** El id de la tanda que se pide: viene en el segundo topic del filtro (["*", id]). */
function idDelFiltro(params) {
  const topic = params?.filters?.[0]?.topics?.[0]
  return Number(scValToNative(xdr.ScVal.fromXDR(topic[1], 'base64')))
}

export function respuestaRpc(est, cuerpo) {
  const { method, params, id } = cuerpo
  const ok = (result) => ({ jsonrpc: '2.0', id, result })
  switch (method) {
    case 'getHealth':
      return ok({ status: 'healthy', latestLedger: 1000, oldestLedger: 1, ledgerRetentionWindow: 999 })
    case 'simulateTransaction':
      return ok(simular(est, params.transaction))
    case 'getEvents':
      est.eventosPedidos++
      return ok({
        events: eventosDe(idDelFiltro(params), est), latestLedger: 1000, oldestLedger: 1, latestLedgerCloseTime: '1', oldestLedgerCloseTime: '1', cursor: 'x',
      })
    case 'getLatestLedger':
      return ok({ id: 'a', protocolVersion: 25, sequence: 1000 })
    case 'getLedgerEntries': {
      const lk = xdr.LedgerKey.fromXDR(params.keys[0], 'base64')
      // (M3) El código del contrato (lo baja `contract.Client.from` en #/estado): un WASM con su spec.
      if (lk.type === 'contractCode') {
        const codigo = xdr.LedgerEntryData.contractCode(
          new xdr.ContractCodeEntry({ ext: xdr.ContractCodeEntryExt.v0(), hash: HASH_WASM, code: wasmConSpec(est) }),
        )
        return ok({ entries: [{ key: params.keys[0], xdr: codigo.toXDR('base64'), lastModifiedLedgerSeq: 900, liveUntilLedgerSeq: 100000 }], latestLedger: 1000 })
      }
      // Instancia de un contrato: la de la tanda guarda sus bóvedas (DataKey::Boveda y, desde M1,
      // ClaveM1::BovedaRapida); la de cada bóveda, su configuración (M1, para #/estado).
      // (Cualquier otra clave recibe la instancia de la tanda, como antes.)
      const contrato = lk.type === 'contractData' ? Address.fromScAddress(lk.contractData.contract).toString() : TANDA_ID
      const clave = (nombre) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(nombre)])
      let storage = []
      if (contrato === TANDA_ID) {
        storage = Object.entries(est.instanciaTanda).map(([k, v]) => new xdr.ScMapEntry({ key: clave(k), val: new Address(v).toScVal() }))
      } else if (est.bovedas[contrato]) {
        const b = est.bovedas[contrato]
        storage = [
          new xdr.ScMapEntry({ key: clave('Token'), val: new Address(TOKEN_ID).toScVal() }),
          new xdr.ScMapEntry({ key: clave('AprBps'), val: u32(500) }),
          new xdr.ScMapEntry({ key: clave('Acelerador'), val: u32(b.acelerador) }),
          new xdr.ScMapEntry({ key: clave('Inicio'), val: u64(b.inicio) }),
          new xdr.ScMapEntry({ key: clave('TotalShares'), val: i128(b.total) }),
        ]
      } else {
        return ok({ entries: [], latestLedger: 1000 })
      }
      // (M3) La tanda corre un WASM (su código lo pide #/estado con HASH_WASM); las bóvedas, como antes.
      const executable = contrato === TANDA_ID ? xdr.ContractExecutable.contractExecutableWasm(HASH_WASM) : xdr.ContractExecutable.contractExecutableStellarAsset()
      const instancia = new xdr.ScContractInstance({ executable, storage })
      const dato = xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({
        ext: xdr.ExtensionPoint.v0(),
        contract: new Address(contrato).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent,
        val: xdr.ScVal.scvContractInstance(instancia),
      }))
      return ok({ entries: [{ key: params.keys[0], xdr: dato.toXDR('base64'), lastModifiedLedgerSeq: 900, liveUntilLedgerSeq: 100000 }], latestLedger: 1000 })
    }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `mock: método no soportado ${method}` } }
  }
}

// --- M3: el WASM del contrato, para comparar la web con el contrato desplegado (#/estado) ---------
const HASH_WASM = Buffer.alloc(32, 0xab)
const leb128 = (n) => {
  const b = []
  do {
    let x = n & 0x7f
    n >>>= 7
    if (n) x |= 0x80
    b.push(x)
  } while (n)
  return Buffer.from(b)
}
/**
 * WASM mínimo con solo la sección `contractspecv0` (la interfaz del contrato), armada con el mismo spec
 * del cliente generado. `est.interfazSin`: nombres de funciones o tipos que le faltan (contrato viejo).
 */
function wasmConSpec(est) {
  const quitar = new Set(est.interfazSin ?? [])
  const entradas = spec.entries.filter((e) => {
    const v = e.value
    return !quitar.has(v && v.name ? v.name.toString() : '')
  })
  const nombre = Buffer.from('contractspecv0')
  const datos = Buffer.concat([leb128(nombre.length), nombre, ...entradas.map((e) => Buffer.from(e.toXdr()))])
  return Buffer.concat([Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x00]), leb128(datos.length), datos])
}

export function cuentaHorizon(est, g) {
  const c = est.cuentas[g]
  if (!c || !c.existe) return null
  const balances = [{ asset_type: 'native', balance: '10000.0000000', buying_liabilities: '0.0000000', selling_liabilities: '0.0000000' }]
  if (c.trustline) {
    balances.unshift({
      asset_type: 'credit_alphanum4', asset_code: 'TUSD', asset_issuer: EMISOR, balance: (Number(c.saldo) / 1e7).toFixed(7), limit: '922337203685.4775807',
      buying_liabilities: '0.0000000', selling_liabilities: '0.0000000', is_authorized: true, is_authorized_to_maintain_liabilities: true,
    })
  }
  return {
    _links: {}, id: g, account_id: g, sequence: '12345', subentry_count: 1, last_modified_ledger: 1, balances,
    signers: [{ weight: 1, key: g, type: 'ed25519_public_key' }], data: {}, num_sponsoring: 0, num_sponsored: 0, paging_token: g,
    thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    flags: { auth_required: false, auth_revocable: false, auth_immutable: false, auth_clawback_enabled: false },
  }
}

/** Código que corre DENTRO de la página: hace de extensión Freighter. */
export function scriptFreighter(direccion) {
  return `
    window.freighter = true;
    window.addEventListener('message', (ev) => {
      const d = ev.data;
      if (ev.source !== window || !d || d.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST') return;
      const net = { network: 'TESTNET', networkUrl: 'https://horizon-testnet.stellar.org', networkPassphrase: '${PASS}', sorobanRpcUrl: 'https://soroban-testnet.stellar.org' };
      const base = { source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE', messagedId: d.messageId };
      let payload = {};
      switch (d.type) {
        case 'REQUEST_CONNECTION_STATUS': payload = { isConnected: true }; break;
        case 'REQUEST_ALLOWED_STATUS': payload = { isAllowed: true }; break;
        case 'SET_ALLOWED_STATUS': payload = { isAllowed: true }; break;
        case 'REQUEST_ACCESS':
        case 'REQUEST_PUBLIC_KEY': payload = { publicKey: '${direccion}' }; break;
        case 'REQUEST_NETWORK': payload = { network: net.network, networkPassphrase: net.networkPassphrase }; break;
        case 'REQUEST_NETWORK_DETAILS': payload = { networkDetails: net }; break;
        default: payload = { apiError: { code: -1, message: 'mock: no soportado ' + d.type } };
      }
      window.postMessage({ ...base, ...payload }, window.location.origin);
    });
  `
}
