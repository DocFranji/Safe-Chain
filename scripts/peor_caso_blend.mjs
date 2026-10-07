// Peor caso con Blend real en testnet (misión M4, docs/blend.md §9).
//
// Repite los dos escenarios más pesados de `test_turnos.rs::peor_caso_turnos_12_miembros_en_wasm`
// (los que dan el máximo de escrituras con la bóveda simulada), pero en una tanda en USDC cuya
// garantía vive en Blend. Mide cada cierre y el reparto final con los recursos de la transacción
// real (instrucciones, entradas leídas y escritas y tamaño de los eventos) y los compara con los
// límites de mainnet. La simulación no revisa el tamaño de los eventos: si pasa de 16 KiB, la red
// rechaza la transacción (`resource_limit_exceeded`) aunque la simulación haya salido bien.
//
//   A) "subasta + M1 + M2: cerrar_ronda casi sin pagos": garantía mínima, una oferta por ronda y solo
//      paga el último de la lista; cada cierre saca garantías de Blend y anota deudas e historial.
//   B) "subasta + M2: cerrar_ronda, todos cumplen" y "finalizar, 12 cumplidos": garantía completa,
//      todos pagan siempre y al final se reparten 12 garantías con su rendimiento de Blend.
//
// Uso (después de `bash scripts/desplegar_testnet.sh`, que registra el USDC de Blend en la tanda):
//   node scripts/peor_caso_blend.mjs            # los dos escenarios a la vez (~30 min)
//   ESCENARIOS=A node scripts/peor_caso_blend.mjs
//   MIEMBROS=3 PERIODO=60 node scripts/peor_caso_blend.mjs   # prueba rápida del script
//
// Crea cuentas desechables en memoria (las llaves nunca se imprimen ni se guardan), les da XLM con
// Friendbot y USDC de prueba con el faucet de Blend (scripts/usdc_blend.mjs). Solo testnet.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const requerir = createRequire(new URL('../web/package.json', import.meta.url))
const { Keypair, Networks, contract, rpc } = requerir('@stellar/stellar-sdk')
const { Client } = await import(new URL('../web/packages/tanda/dist/index.js', import.meta.url))

const RPC = process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org'
const PASS = Networks.TESTNET
const contratos = Object.fromEntries(
  fs
    .readFileSync(new URL('./.contratos', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((x) => x.trim())),
)
const { TANDA, USDC } = contratos
if (!TANDA || !USDC) throw new Error('scripts/.contratos no tiene TANDA y USDC: corre antes bash scripts/desplegar_testnet.sh')

const CUOTA = 10_000_000n // 1 USDC: el monto no cambia cuántas entradas se tocan
const PERIODO = Number(process.env.PERIODO ?? 120) // como PERIODO en test.rs (mínimo 60)
const SIN_TURNO = 4_294_967_295
const N = Number(process.env.MIEMBROS ?? 12) // 12 es el peor caso; menos sirve para probar el script
// Límites de mainnet por transacción (los mismos que usan las pruebas de la tanda).
const LIMITES = { instrucciones: 100_000_000, lecturas: 100, escrituras: 50 }

const servidor = new rpc.Server(RPC)
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const corto = (g) => `${g.slice(0, 4)}…${g.slice(-4)}`

function cliente(kp) {
  return new Client({
    contractId: TANDA,
    networkPassphrase: PASS,
    rpcUrl: RPC,
    publicKey: kp.publicKey(),
    ...contract.basicNodeSigner(kp, PASS),
  })
}

/** De a `n` a la vez, en orden. */
async function deA(n, items, f) {
  const res = []
  for (let i = 0; i < items.length; i += n) res.push(...(await Promise.all(items.slice(i, i + n).map(f))))
  return res
}

async function friendbot(kp) {
  for (let intento = 1; ; intento++) {
    const r = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`)
    if (r.ok) return
    if (intento === 5) throw new Error(`Friendbot respondió ${r.status} para ${corto(kp.publicKey())}`)
    await dormir(3000 * intento)
  }
}

/** El faucet de Blend firma con una sola cuenta emisora: de a una cuenta y con reintento (si ya recibió, no hace nada). */
async function usdc(kp) {
  for (let intento = 1; ; intento++) {
    try {
      return await usdcUnaVez(kp)
    } catch (e) {
      if (intento === 4) throw e
      await dormir(8000 * intento)
    }
  }
}

function usdcUnaVez(kp) {
  return new Promise((ok, mal) => {
    const p = spawn(process.execPath, [new URL('./usdc_blend.mjs', import.meta.url).pathname], {
      env: { ...process.env, SECRETO: kp.secret() },
      stdio: ['ignore', 'inherit', 'pipe'],
    })
    let errores = ''
    p.stderr.on('data', (d) => (errores = (errores + d).slice(-4000)))
    p.on('exit', (c) => {
      if (c === 0) return ok()
      const motivo = errores.match(/(status: \d+|Error: .*)/)?.[0] ?? ''
      console.log(`   el faucet de Blend falló para ${corto(kp.publicKey())} (${motivo}); reintento`)
      mal(new Error(`usdc_blend.mjs terminó con ${c}`))
    })
  })
}

/** Firma y envía; reintenta lo que es de la red (y "la ronda no venció" mientras la red se pone al día). */
async function enviar(nombre, construir) {
  for (let intento = 1; ; intento++) {
    let enviada = false
    try {
      const tx = await construir()
      if (rpc.Api.isSimulationError(tx.simulation)) throw new Error(tx.simulation.error)
      const recursos = medir(tx)
      enviada = true
      const r = await tx.signAndSend()
      const hash = r.sendTransactionResponse?.hash
      const estado = r.getTransactionResponse?.status
      if (estado !== 'SUCCESS') {
        const red = await aplicada(hash).catch(() => ({}))
        throw new Error(`la red la rechazó (${estado ?? 'sin respuesta'} ${red.codigo ?? ''}, tx ${hash})`)
      }
      return { hash, resultado: r.result, ...recursos, ...(await aplicada(hash)) }
    } catch (e) {
      const texto = String(e?.message ?? e)
      // Solo se reintenta lo que no llegó a enviarse (o la red no aceptó): así nada se aplica dos veces.
      const reintentable = !enviada && /#9\)|TRY_AGAIN|txBadSeq|timeout|ECONNRESET|fetch failed|503|504/.test(texto)
      if (reintentable && intento < 8) {
        await dormir(5000)
        continue
      }
      throw new Error(`${nombre}: ${texto.slice(0, 400)}`, { cause: e })
    }
  }
}

/**
 * Lo que de verdad usó la transacción al aplicarse (eventos de diagnóstico `core_metrics` del RPC). La
 * simulación no revisa el tamaño de los eventos: la red rechaza más de 16 KiB por transacción.
 */
async function aplicada(hash) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: { hash, xdrFormat: 'json' } }),
  }).then((x) => x.json())
  const m = {}
  for (const e of r.result?.diagnosticEventsJson ?? []) {
    const cuerpo = e.event?.body?.v0
    const t = cuerpo?.topics
    if (t?.[0]?.symbol === 'core_metrics' && cuerpo.data?.u64 !== undefined) m[t[1].symbol] = Number(cuerpo.data.u64)
  }
  const codigo = JSON.stringify(r.result?.resultJson?.result ?? '').match(/"([a-z_]+)"\}*\]?\}*$/)?.[1]
  return { cpuReal: m.cpu_insn, memoria: m.mem_byte, eventos: m.emit_event_byte, codigo }
}

/** Recursos de la transacción armada con la simulación (la huella es exacta). XDR del SDK 17: propiedades. */
function medir(tx) {
  const r = tx.built.toEnvelope().v1.tx.ext.sorobanData.resources
  const { readOnly, readWrite } = r.footprint
  const clasicas = [...readOnly, ...readWrite].filter((k) => k.type !== 'contractData' && k.type !== 'contractCode').length
  return {
    instrucciones: Number(r.instructions),
    lecturas: readOnly.length + readWrite.length,
    escrituras: readWrite.length,
    clasicas,
  }
}

const MAX_BYTES_EVENTOS = 16_384
const medidas = []
function anotar(que, m) {
  const fila = { que, instrucciones: m.instrucciones, cpuReal: m.cpuReal, memoria: m.memoria, lecturas: m.lecturas, escrituras: m.escrituras, eventos: m.eventos, clasicas: m.clasicas, hash: m.hash }
  medidas.push(fila)
  const ok =
    m.instrucciones < LIMITES.instrucciones && m.lecturas <= LIMITES.lecturas && m.escrituras <= LIMITES.escrituras && (m.eventos ?? 0) <= MAX_BYTES_EVENTOS
  console.log(
    `  ${ok ? 'OK  ' : 'PASA'} ${que.padEnd(40)} ${(m.instrucciones / 1e6).toFixed(1).padStart(5)} M · ${String(m.lecturas).padStart(3)} lecturas · ${String(m.escrituras).padStart(2)} escrituras · ${String(m.eventos ?? '?').padStart(5)} B de eventos  (tx ${m.hash})`,
  )
}

async function miembros(c, id) {
  const tx = await c.get_miembros({ id })
  return new Map(tx.result.unwrap().map(([dir, m]) => [dir, m]))
}

async function esperarFinDeRonda(c, id) {
  const t = (await c.get_tanda({ id })).result.unwrap()
  const vence = Number(t.inicio_ronda) + Number(t.periodo_seg)
  while (Date.now() / 1000 < vence + 6) await dormir(2000)
}

async function crearTanda(cr, cobertura) {
  const c = cliente(cr)
  const opciones = {
    modo: { tag: 'Subasta', values: undefined },
    permitir_intercambio: false,
    prima_max_bps: 0,
    descuento_max_bps: 5000,
    primeros_con_historial: 0,
    puntaje_primeros: 0,
    ofertas_selladas: false,
  }
  const r = await enviar('crear_tanda_avanzada', () =>
    c.crear_tanda_avanzada({
      creador: cr.publicKey(),
      token: USDC,
      cuota: CUOTA,
      n_miembros: N,
      periodo_seg: BigInt(PERIODO),
      penalidad_bps: 1000,
      cobertura_bps: cobertura,
      opciones,
    }),
  )
  const id = r.resultado.unwrap()
  const boveda = (await c.get_boveda({ id })).result.unwrap()
  return { id, boveda }
}

async function unirseTodos(id, gente) {
  // En orden: el orden de llegada es el orden de respaldo de la subasta, igual que en la prueba.
  for (const [i, kp] of gente.entries()) {
    await enviar(`unirse ${i + 1}`, () => cliente(kp).unirse({ id, miembro: kp.publicKey() }))
  }
}

/** A) Garantía mínima, casi nadie paga (como el bucle `con_historial = true` de la prueba de M3). */
async function escenarioA(cr, gente) {
  const { id, boveda } = await crearTanda(cr, 0)
  console.log(`A) tanda ${id} en USDC, bóveda ${corto(boveda)}`)
  await unirseTodos(id, gente)
  const c = cliente(cr)
  for (let r = 0; r < N - 1; r++) {
    const ms = await miembros(c, id)
    const quien = [...gente].reverse().find((kp) => {
      const m = ms.get(kp.publicKey())
      return m.posicion === SIN_TURNO && !m.moroso
    })
    if (quien) await enviar(`A ofertar ${r}`, () => cliente(quien).ofertar({ id, miembro: quien.publicKey(), descuento_bps: 100 * (r + 1) }))
    const ultimo = gente[N - 1]
    await enviar(`A pagar ${r}`, () => cliente(ultimo).pagar_cuota({ id, miembro: ultimo.publicKey() }))
    await esperarFinDeRonda(c, id)
    anotar(`A cerrar_ronda ${r + 1} (casi sin pagos)`, await enviar(`A cerrar ${r}`, () => c.cerrar_ronda({ id })))
  }
  const ultimo = gente[N - 1]
  await enviar('A pagar última', () => cliente(ultimo).pagar_cuota({ id, miembro: ultimo.publicKey() }))
  await esperarFinDeRonda(c, id)
  anotar(`A cerrar_ronda ${N}`, await enviar('A cerrar última', () => c.cerrar_ronda({ id })))
  anotar('A finalizar', await enviar('A finalizar', () => c.finalizar({ id })))
  return id
}

/** B) Garantía completa, todos cumplen siempre; al final se reparten 12 garantías. */
async function escenarioB(cr, gente) {
  const { id, boveda } = await crearTanda(cr, 10_000)
  console.log(`B) tanda ${id} en USDC, bóveda ${corto(boveda)}`)
  await unirseTodos(id, gente)
  const c = cliente(cr)
  for (let r = 0; r < N; r++) {
    if (r < N - 1) {
      const ms = await miembros(c, id)
      const quien = gente.find((kp) => ms.get(kp.publicKey()).posicion === SIN_TURNO)
      if (quien) await enviar(`B ofertar ${r}`, () => cliente(quien).ofertar({ id, miembro: quien.publicKey(), descuento_bps: 500 }))
    }
    await Promise.all(gente.map((kp, i) => enviar(`B pagar ${r}/${i}`, () => cliente(kp).pagar_cuota({ id, miembro: kp.publicKey() }))))
    await esperarFinDeRonda(c, id)
    anotar(`B cerrar_ronda ${r + 1} (todos cumplen)`, await enviar(`B cerrar ${r}`, () => c.cerrar_ronda({ id })))
  }
  anotar(`B finalizar (${N} cumplidos)`, await enviar('B finalizar', () => c.finalizar({ id })))
  return id
}

// ---------------------------------------------------------------------------------------------------
const escenarios = (process.env.ESCENARIOS ?? 'AB').toUpperCase()
const grupos = [...escenarios].map(() => ({ cr: Keypair.random(), gente: Array.from({ length: N }, () => Keypair.random()) }))
const todas = grupos.flatMap((g) => [g.cr, ...g.gente])
console.log(`Tanda ${corto(TANDA)} · USDC ${corto(USDC)} · ${todas.length} cuentas desechables`)
console.log('== XLM de Friendbot ==')
await deA(6, todas, friendbot)
console.log('== USDC de prueba de Blend ==')
await deA(1, grupos.flatMap((g) => g.gente), usdc)

console.log(`== Escenarios (cada ronda dura ${PERIODO} s) ==`)
// Los escenarios corren a la vez, con 20 s entre sus inicios para que no creen la tanda al mismo tiempo.
const ids = await Promise.all(
  [...escenarios].map(async (e, i) => {
    await dormir(20_000 * i)
    return (e === 'A' ? escenarioA : escenarioB)(grupos[i].cr, grupos[i].gente)
  }),
)

const peor = medidas.reduce(
  (p, m) => ({
    instrucciones: Math.max(p.instrucciones, m.instrucciones),
    lecturas: Math.max(p.lecturas, m.lecturas),
    escrituras: Math.max(p.escrituras, m.escrituras),
    eventos: Math.max(p.eventos, m.eventos ?? 0),
  }),
  { instrucciones: 0, lecturas: 0, escrituras: 0, eventos: 0 },
)
console.log(
  `Máximo: ${(peor.instrucciones / 1e6).toFixed(1)} M instrucciones · ${peor.lecturas} lecturas · ${peor.escrituras} escrituras · ${peor.eventos} bytes de eventos`,
)
console.log(`Límites de mainnet: 100 M · 100 lecturas · 50 escrituras · 16 384 bytes de eventos. Tandas: ${ids.join(', ')}`)
if (process.env.SALIDA) fs.writeFileSync(process.env.SALIDA, JSON.stringify({ tanda: TANDA, ids, medidas, peor }, null, 2))
const pasa =
  peor.instrucciones >= LIMITES.instrucciones ||
  peor.lecturas > LIMITES.lecturas ||
  peor.escrituras > LIMITES.escrituras ||
  peor.eventos > MAX_BYTES_EVENTOS
process.exit(pasa ? 1 : 0)
