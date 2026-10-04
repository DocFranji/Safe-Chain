// RPC de Stellar + Horizon + Friendbot + faucet + Freighter SIMULADOS, para probar la web sin red.
// Codifica las respuestas con el mismo Spec del contrato que usa el cliente real.
import { Client } from '../packages/tanda/dist/index.js'
import * as SDK from '../node_modules/@stellar/stellar-sdk/lib/esm/index.js'

const { xdr, StrKey, nativeToScVal, TransactionBuilder, Address, scValToNative, SorobanDataBuilder } = SDK

export const PASS = 'Test SDF Network ; September 2015'
export const TANDA_ID = 'CDLSK5Z65A645XS5X6IMJAUOYBLXZFLP7SNM3DB62LFQKFUKNDCKKEGV'
export const TOKEN_ID = 'CDM2YCJVE37HUCNOY5E65NOEKTQVQM2WD6CUVHSL5WZFVISPIUIYHAQ5'
export const BOVEDA_ID = StrKey.encodeContract(Buffer.alloc(32, 7))
/** M1: bóveda "real" (sin acelerar) para tandas de días, semanas o meses. La de arriba es la rápida. */
export const BOVEDA_REAL = StrKey.encodeContract(Buffer.alloc(32, 8))
export const ANA = 'GADMQOSHB74SMBATS6IF67ZKS2KJPQC4FOM6NDGGWADEUT253XCATVPD'
export const BETO = 'GBPDH2E2EX5D7DO76YRIX477LPJWNPB7MJZRTEDJWBKZMS5KTLLRU2LO'
export const CARLA = 'GDPIB76VVYNDJINI6BRYGVOKTPOTERZABL43OB7DIOCLTXSKEUMJWNUN'
export const ME = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 5))
export const EMISOR = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 6))
export const U = 10_000_000n

const cliente = new Client({ contractId: TANDA_ID, networkPassphrase: PASS, rpcUrl: 'https://mock.test' })
const spec = cliente.spec

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
    cuentas: { [ME]: { existe: true, trustline: true, saldo: 1000n * U }, [BOVEDA_ID]: { existe: true, trustline: true, saldo: 10000n * U } },
    contratoCaido: false,
    faucetStatus: null,
    eventosPedidos: 0,
    llamadas: [],
  }
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
    if (fn === 'colateral_siguiente') {
      if (t.miembros.length >= t.tanda.n_miembros) return { error: erroresContrato(6) }
      return i128(colateralPara(t.tanda, t.miembros.length))
    }
    // --- M1 ---
    if (fn === 'get_boveda') return addr(t.boveda ?? BOVEDA_ID)
    if (fn === 'get_deudas') {
      return xdr.ScVal.scvVec((t.deudas ?? []).map(([a, d]) => xdr.ScVal.scvVec([addr(a), spec.nativeToUdt(d, 'Deuda')])))
    }
    if (fn === 'get_deuda') {
      const d = (t.deudas ?? []).find(([a]) => a === nativos[1])?.[1] ?? { faltantes: [], bolsa_retenida: 0n, pagado: 0n }
      return spec.nativeToUdt(d, 'Deuda')
    }
  }
  if (contrato === TOKEN_ID) {
    if (fn === 'balance') return i128(est.cuentas[nativos[0]]?.saldo ?? 0n)
    if (fn === 'name') return nativeToScVal(`TUSD:${EMISOR}`, { type: 'string' })
  }
  if ((contrato === BOVEDA_ID || contrato === BOVEDA_REAL) && fn === 'valor') return i128((BigInt(nativos[0]) * 103n) / 100n)
  if (contrato === BOVEDA_ID && fn === 'acelerador') return u32(52_560)
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

function eventosDe(idTanda) {
  const base = Math.floor(Date.now() / 1000) - 600
  return (HISTORIAS[idTanda] ?? []).map(([nombre, datos], i) => ({
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
        events: eventosDe(idDelFiltro(params)), latestLedger: 1000, oldestLedger: 1, latestLedgerCloseTime: '1', oldestLedgerCloseTime: '1', cursor: 'x',
      })
    case 'getLatestLedger':
      return ok({ id: 'a', protocolVersion: 25, sequence: 1000 })
    case 'getLedgerEntries': {
      // Instancia del contrato de la tanda: su almacenamiento guarda DataKey::Boveda -> dirección de la bóveda.
      const instancia = new xdr.ScContractInstance({
        executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
        storage: [new xdr.ScMapEntry({ key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Boveda')]), val: new Address(BOVEDA_ID).toScVal() })],
      })
      const dato = xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({
        ext: xdr.ExtensionPoint.v0(),
        contract: new Address(TANDA_ID).toScAddress(),
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
