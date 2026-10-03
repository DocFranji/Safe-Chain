// Uso (con `npm run preview` corriendo en web/): node snap.mjs "#/demo/2" nombre [ancho] [direccion|none] [esperaMs]
import { chromium } from 'playwright-core'
import { ME, nuevoEstado } from './mock.mjs'
import { BASE_URL, nuevaPagina, opcionesNavegador } from './helpers.mjs'
const [hash, nombre, ancho = '1280', dir = 'me', espera = '2500'] = process.argv.slice(2)
const est = nuevoEstado()
const browser = await chromium.launch(opcionesNavegador())
const { page, errores } = await nuevaPagina(browser, { est, conectado: dir !== 'none', direccion: dir === 'me' ? ME : dir, viewport: { width: Number(ancho), height: 900 } })
await page.goto(BASE_URL + hash)
await page.waitForTimeout(Number(espera))
await page.screenshot({ path: new URL('./shots/' + nombre + '.png', import.meta.url).pathname, fullPage: true })
console.log('errores:', errores.length ? errores.join(' | ') : 'ninguno')
await browser.close()
