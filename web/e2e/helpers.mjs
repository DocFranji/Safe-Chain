import fs from 'node:fs'
import { ME, respuestaRpc, cuentaHorizon, scriptFreighter } from './mock.mjs'

/** URL de la web a probar (vite preview). Cambiar con BASE=http://localhost:5173/ */
export const BASE_URL = process.env.BASE ?? 'http://localhost:4173/'

/**
 * Chromium a usar. En las sesiones de Claude Code en la nube ya viene instalado en /opt/pw-browsers.
 * En tu PC: instala uno (npx playwright install chromium) o indica la ruta con CHROMIUM_PATH.
 */
export function opcionesNavegador() {
  const candidatos = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium']
  const ruta = candidatos.find((r) => r && fs.existsSync(r))
  return ruta ? { executablePath: ruta, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] }
}

export async function nuevaPagina(browser, { direccion = ME, conectado = true, est, viewport = { width: 1280, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'es-CR' })
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errores.push('console: ' + m.text())
  })
  if (conectado) await page.addInitScript(scriptFreighter(direccion))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await page.route('**/soroban-testnet.stellar.org/**', async (r) => {
    const cuerpo = JSON.parse(r.request().postData() ?? '{}')
    let res
    try {
      res = respuestaRpc(est, cuerpo)
    } catch (e) {
      console.log('   [mock RPC error]', cuerpo.method, e.message)
      res = { jsonrpc: '2.0', id: cuerpo.id, error: { code: -32000, message: String(e.message) } }
    }
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(res, (_, v) => (typeof v === 'bigint' ? v.toString() : v)) })
  })
  await page.route('**/horizon-testnet.stellar.org/**', async (r) => {
    const m = r.request().url().match(/accounts\/(G[A-Z0-9]{55})/)
    const cuenta = m ? cuentaHorizon(est, m[1]) : null
    if (!cuenta) return r.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 404, title: 'Resource Missing' }) })
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(cuenta) })
  })
  await page.route('**/friendbot.stellar.org/**', async (r) => {
    const m = r.request().url().match(/addr=(G[A-Z0-9]{55})/)
    if (m) est.cuentas[m[1]] = { existe: true, trustline: false, saldo: 0n }
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' })
  })
  await page.route('**/api/faucet', async (r) => {
    const { address } = JSON.parse(r.request().postData() ?? '{}')
    if (est.faucetStatus === 503) return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'El faucet no está configurado todavía.' }) })
    if (!/^G[A-Z0-9]{55}$/.test(address ?? '')) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'La dirección de la billetera no es válida.' }) })
    if (est.cuentas[address]) est.cuentas[address].saldo += 1000n * 10_000_000n
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, monto: 1000 }) })
  })
  // M4: faucet de USDC de Blend (web/api/faucet-blend.ts). Responde lo que diga `est.faucetBlend`.
  await page.route('**/api/faucet-blend', async (r) => {
    const { status, cuerpo } = est.faucetBlend
    await r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })
  })
  return { page, ctx, errores }
}
