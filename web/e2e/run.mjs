import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { ME, ANA, CARLA, TANDA_ID, nuevoEstado, nuevoEstadoTurnos, conTandaMorosa, conTandaExigente, conPrimerosConHistorial, conSubastaSellada, conMiBolsaLista, historial } from './mock.mjs'
import { BASE_URL, nuevaPagina, opcionesNavegador } from './helpers.mjs'
import { StrKey } from '../node_modules/@stellar/stellar-sdk/lib/esm/index.js'

const BASE = BASE_URL
const SHOTS = new URL('./shots/', import.meta.url).pathname
fs.mkdirSync(SHOTS, { recursive: true })

const resultados = []
const check = (nombre, ok, extra = '') => {
  resultados.push({ nombre, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nombre}${!ok && extra ? '  -> ' + extra : ''}`)
}

const texto = (page) => page.locator('body').innerText()
const shot = (page, nombre) => page.screenshot({ path: SHOTS + nombre + '.png', fullPage: true })

const browser = await chromium.launch(opcionesNavegador())

// ---------------------------------------------------------------- 1. Lobby (conectada como ME)
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
  const t = await texto(page)
  check('Lobby: muestra las 5 tandas', (await page.locator('.tarjeta').count()) === 5, `tarjetas=${await page.locator('.tarjeta').count()}`)
  check('Lobby: la más nueva va primero', (await page.locator('.tarjeta h2').first().innerText()) === 'Tanda 5')
  check('Lobby: etiqueta Terminada y Cancelada y En curso', /Terminada/.test(t) && /Cancelada/.test(t) && /En curso/.test(t))
  check('Lobby: tarjeta abierta muestra la garantía de entrada', /Entras con 100 TUSD de garantía \(turno 2\)/.test(t), t.slice(0, 300))
  check('Lobby: marca "La creaste tú" en la tanda 3', /La creaste tú/.test(t))
  check('Lobby: la barra de cuenta muestra el saldo', /Tu saldo:\s*1[\s.,]?000 TUSD/.test(t.replace(/ /g, ' ')), t.slice(0, 200))
  await shot(page, '01-lobby')
  await page.getByRole('button', { name: 'Mis tandas' }).click()
  check('Filtro "Mis tandas": solo la tanda 3', (await page.locator('.tarjeta').count()) === 1)
  await page.getByRole('button', { name: 'Abiertas' }).click()
  check('Filtro "Abiertas": tandas 3 y 5', (await page.locator('.tarjeta').count()) === 2)
  await page.getByRole('button', { name: 'Terminadas' }).click()
  check('Filtro "Terminadas": tandas 1 y 4', (await page.locator('.tarjeta').count()) === 2)
  check('Lobby: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 2. Crear tanda
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.vista-previa table')
  let filas = await page.locator('.vista-previa tbody tr').allInnerTexts()
  check('Crear: la vista previa tiene 3 turnos con 200/100/100', filas.length === 3 && /200/.test(filas[0]) && /100/.test(filas[1]) && /100/.test(filas[2]), JSON.stringify(filas))
  check('Crear: con garantía 100 % dice que el grupo no pierde nada', /el grupo no pierde nada/.test(await texto(page)))
  await shot(page, '02-crear')
  await page.locator('#n').fill('5')
  await page.locator('#cobertura').fill('50')
  filas = await page.locator('.vista-previa tbody tr').allInnerTexts()
  check('Crear: n=5 y garantía 50 % -> 200/150/100/100/100', filas.length === 5 && /200/.test(filas[0]) && /150/.test(filas[1]), JSON.stringify(filas))
  check('Crear: con garantía 50 % advierte el riesgo del grupo', /podría perder hasta 200 TUSD/.test(await texto(page)))
  await page.locator('#cuota').fill('abc')
  check('Crear: cuota inválida muestra error y deshabilita el botón', /mayor que cero/.test(await texto(page)) && (await page.locator('button[type=submit]').isDisabled()))
  await page.locator('#cuota').fill('100')
  await page.locator('#cobertura').fill('100')
  // M1: rondas de semanas y meses, con un máximo de 3 meses por ronda (igual que el contrato).
  const unidades = await page.locator('select[aria-label="Unidad de tiempo"] option').allInnerTexts()
  check('Crear: ofrece semanas y meses', unidades.includes('semanas') && unidades.includes('meses'), JSON.stringify(unidades))
  await page.locator('#periodo').fill('4')
  await page.locator('select[aria-label="Unidad de tiempo"]').selectOption('meses')
  check('Crear: una ronda de 4 meses se rechaza (máximo 3 meses)', /hasta 3 meses/.test(await texto(page)) && (await page.locator('button[type=submit]').isDisabled()))
  await page.locator('#periodo').fill('3')
  check('Crear: 3 meses sí se aceptan y dice "1 mes = 30 días"', /1 mes = 30 días/.test(await texto(page)) && !(await page.locator('button[type=submit]').isDisabled()))
  await page.getByRole('button', { name: 'Mensual × 12' }).click()
  const previa = (await page.locator('.vista-previa').innerText()).replace(/\u00a0/g, ' ')
  check('Preset "Mensual × 12": dura 12 meses y dice cuándo vence la última ronda', /12 meses/.test(previa) && /la última ronda vence el \S+ \d+ de \S+ de \d{4}/.test(previa), previa.slice(0, 400))
  check('Preset "Mensual × 12": 12 turnos en la tabla de garantías', (await page.locator('.vista-previa tbody tr').count()) === 12)
  await shot(page, '03b-crear-mensual')
  await page.getByRole('button', { name: 'Semanal × 4' }).click()
  check('Preset "Semanal × 4" rellena el formulario', (await page.locator('#cuota').inputValue()) === '25' && (await page.locator('#periodo').inputValue()) === '1' && (await page.locator('select[aria-label="Unidad de tiempo"]').inputValue()) === 'semanas')
  check('Crear: botón habilitado con billetera conectada', !(await page.locator('button[type=submit]').isDisabled()))
  await shot(page, '03-crear-semanal')
  check('Crear: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 3. Tanda abierta (creada por ME)
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/3')
  await page.waitForSelector('.rueda svg', { timeout: 15000 })
  const t = await texto(page)
  check('Tanda 3: título y etiqueta Abierta', /Tanda 3/.test(t) && /Abierta/.test(t))
  check('Tanda 3: muestra el botón de unirse con la garantía', /Unirme y dejar 100 TUSD de garantía/.test(t))
  check('Tanda 3: aparece "Invita a tu grupo" con el link correcto', /Invita a tu grupo/.test(t) && (await page.locator('.link-fila input').inputValue()).endsWith('#/tanda/3'))
  check('Tanda 3: link de WhatsApp presente', (await page.locator('a.whatsapp').getAttribute('href'))?.startsWith('https://wa.me/?text='))
  check('Tanda 3: el creador ve "Cancelar esta tanda"', await page.getByRole('button', { name: 'Cancelar esta tanda' }).isVisible())
  await page.getByRole('button', { name: 'Cancelar esta tanda' }).click()
  const t2 = await texto(page)
  check('Tanda 3: pide confirmación antes de cancelar', /¿Cancelar esta tanda\?/.test(t2) && /la persona que ya se unió/.test(t2) && (await page.getByRole('button', { name: 'Sí, cancelar la tanda' }).isVisible()))
  await page.waitForSelector('.rendimiento dl', { timeout: 15000 }).catch(() => {})
  const rend = (await page.locator('.rendimiento').innerText()).replace(/\u00a0/g, ' ')
  // 200 TUSD de garantía en la bóveda; la bóveda simulada vale 103 % -> +6 TUSD (3 % de 200)
  check('Tanda 3: rendimiento en vivo leído de la bóveda (+6 TUSD, 3 %)', /\+6 TUSD/.test(rend) && /3 %/.test(rend), rend)
  await shot(page, '04-tanda-abierta')
  await page.getByRole('button', { name: 'No, mantenerla' }).click()
  check('Tanda 3: "No, mantenerla" vuelve al botón normal', await page.getByRole('button', { name: 'Cancelar esta tanda' }).isVisible())
  check('Tanda 3: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 3b. M1: rendimiento acelerado solo en tandas de prueba
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/3')
  await page.waitForSelector('.rendimiento dl', { timeout: 15000 }).catch(() => {})
  const rend = (await page.locator('.rendimiento').innerText()).replace(/\u00a0/g, ' ')
  check('M1: tanda de prueba (rondas de 2 min) dice que su bóveda corre más rápido', /1 minuto equivale a 36,5 días/.test(rend), rend.slice(-300))
  check('M1: tanda de prueba sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 4. Tanda en curso (ME no es miembro ni creador)
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/2')
  await page.waitForSelector('.rueda svg', { timeout: 15000 })
  const t = await texto(page)
  check('Tanda 2: "Ronda 2 de 3"', /Ronda 2 de 3/.test(t))
  check('Tanda 2: no ofrece cancelar a quien no la creó', !/Cancelar esta tanda/.test(t))
  check('Tanda 2: no muestra "Invita" (no está abierta)', !/Invita a tu grupo/.test(t))
  check('Tanda 2: muestra "Ya pagaron 1 de 3"', /Ya pagaron\s*1 de 3/.test(t))
  await shot(page, '05-tanda-activa')
  check('Tanda 2: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 5. Tanda terminada: resultados desde eventos
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, direccion: ANA })
  await page.goto(BASE + '#/tanda/1')
  await page.waitForSelector('.resultados table', { timeout: 15000 }).catch(() => {})
  const t = (await texto(page)).replace(/ /g, ' ')
  check('Tanda 1: aparece "Resultados finales" con tabla', (await page.locator('.resultados table').count()) === 1, t.slice(-600))
  const filas = await page.locator('.resultados tbody tr').allInnerTexts()
  check('Tanda 1: Ana recibió 0 y "su garantía cubrió sus cuotas"', /Ana/.test(filas[0] ?? '') && /Su garantía cubrió sus cuotas/.test(filas[0] ?? ''), filas[0])
  check('Tanda 1: Beto recibió 94,5', /94,5/.test(filas[1] ?? ''), filas[1])
  check('Tanda 1: Carla recibió 114', /114/.test(filas[2] ?? ''), filas[2])
  check('Tanda 1: muestra el rendimiento generado +8,5', /\+8,50 TUSD/.test(t), t.slice(-500))
  check('Tanda 1: no muestra rendimiento en vivo (ya terminó)', !/Rendimiento de la garantía/.test(t))
  await shot(page, '06-tanda-terminada')
  check('Tanda 1: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 5b. M1: tanda mensual, "yo" estoy en mora y pago mi deuda
{
  const est = conTandaMorosa(nuevoEstado())
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/6')
  await page.waitForSelector('.pagar-deuda', { timeout: 15000 }).catch(() => {})
  const t = (await texto(page)).replace(/\u00a0/g, ' ')
  const panel = (await page.locator('.pagar-deuda').innerText().catch(() => '')).replace(/\u00a0/g, ' ')
  check('Deuda: "Tienes una deuda de 100 TUSD"', /Tienes una deuda de 100 TUSD/.test(panel), panel.slice(0, 300))
  check('Deuda: dice a quién le llega (Beto, ronda 2)', /Beto/.test(panel) && /ronda 2/.test(panel), panel)
  check('Deuda: dice qué recupera (cobra en la ronda 4)', /Cobras tu bolsa en la ronda 4/.test(panel), panel)
  const boton = page.getByRole('button', { name: 'Pagar mi deuda (100 TUSD)' })
  check('Deuda: botón "Pagar mi deuda (100 TUSD)" habilitado', (await boton.count()) === 1 && !(await boton.isDisabled()))
  check('Deuda: ya no ofrece "Pagar mi cuota" (está en mora)', !/Pagar mi cuota/.test(t))
  await page.locator('summary', { hasText: 'Pagar solo una parte' }).click()
  await page.locator('#monto-deuda').fill('150')
  check('Deuda: pagar más de lo que se debe se rechaza antes de firmar', /más de lo que debes/.test(await page.locator('.pagar-deuda').innerText()) && (await page.getByRole('button', { name: 'Pagar este monto' }).isDisabled()))
  await page.locator('#monto-deuda').fill('40')
  check('Deuda: un pago parcial válido habilita "Pagar 40 TUSD"', !(await page.getByRole('button', { name: 'Pagar 40 TUSD' }).isDisabled()))
  const lista = (await page.locator('.miembros').first().innerText()).replace(/\u00a0/g, ' ')
  check('Lista: "Debe 100 TUSD" para quien está en mora', /Debe 100 TUSD/.test(lista), lista.slice(0, 400))
  check('Lista: "Saldó su deuda" para Carla', /Saldó su deuda/.test(lista), lista.slice(0, 400))
  const cal = (await page.locator('.calendario').innerText().catch(() => '')).replace(/\u00a0/g, ' ')
  check('Calendario: 4 rondas, 2 cerradas y fechas para las que faltan', (await page.locator('.calendario tbody tr').count()) === 4 && (cal.match(/Cerrada/g) ?? []).length === 2 && /Vence el \S+ \d+ de \S+/.test(cal), cal)
  // M1 fase 2: "Agregar a mi calendario" baja un .ics con las 2 fechas que faltan y recordatorios.
  const [descarga] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Agregar a mi calendario' }).click(),
  ])
  const ics = fs.readFileSync(await descarga.path(), 'utf8')
  check('Calendario .ics: se llama rounda-tanda-6.ics', descarga.suggestedFilename() === 'rounda-tanda-6.ics', descarga.suggestedFilename())
  check('Calendario .ics: 2 fechas de pago (las rondas que faltan) con recordatorio un día antes', (ics.match(/BEGIN:VEVENT/g) ?? []).length === 2 && (ics.match(/TRIGGER:-P1D/g) ?? []).length === 2 && ics.endsWith('END:VCALENDAR\r\n'), ics.slice(0, 600))
  check('Calendario .ics: en mi ronda dice que cobro mi bolsa, con el enlace a la tanda', /SUMMARY:Tanda 6: pagas tu cuota y cobras tu bolsa \(ronda 4 de 4\)/.test(ics) && /#\/tanda\/6/.test(ics), ics.slice(0, 1500))
  await page.waitForSelector('.historia-item', { timeout: 15000 }).catch(() => {})
  const hist = (await page.locator('.historia-seccion').innerText()).replace(/\u00a0/g, ' ')
  check('Historia: "Carla pagó 50 TUSD y saldó su deuda"', /Carla pagó 50 TUSD y saldó su deuda/.test(hist), hist.slice(0, 500))
  check('Historia: "Beto recibió los 50 TUSD que le faltaban" (momento clave)', /Beto recibió los 50 TUSD que le faltaban/.test(hist) && (await page.locator('.historia-item.clave').count()) >= 2)
  await page.waitForSelector('.rendimiento dl', { timeout: 15000 }).catch(() => {})
  check('M1: tanda mensual dice que su bóveda rinde al ritmo de la vida real', /al ritmo de la vida real/.test(await page.locator('.rendimiento').innerText()))
  await shot(page, '06b-tanda-deuda')
  check('Deuda: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 5c. M1: otra persona paga la deuda; y a 390 px
{
  const est = conTandaMorosa(nuevoEstado())
  const { page, errores } = await nuevaPagina(browser, { est, direccion: ANA, viewport: { width: 390, height: 844 } })
  est.cuentas[ANA] = { existe: true, trustline: true, saldo: 500n * 10_000_000n }
  await page.goto(BASE + '#/tanda/6')
  await page.waitForSelector('.pagar-deuda', { timeout: 15000 }).catch(() => {})
  const panel = await page.locator('.pagar-deuda').innerText().catch(() => '')
  check('Tercero: quien no debe ve "Pagar la deuda de otra persona"', /Pagar la deuda de otra persona/.test(panel), panel)
  check('Tercero: no le dice "Tienes una deuda"', !/Tienes una deuda/.test(panel))
  await page.locator('summary', { hasText: 'Pagar la deuda de otra persona' }).click()
  check('Tercero: puede pagar la deuda de quien está en mora', (await page.getByRole('button', { name: 'Pagar su deuda' }).count()) === 1 && !(await page.getByRole('button', { name: 'Pagar su deuda' }).isDisabled()))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check('Móvil (390px): la tanda con deuda y calendario no se desborda', !overflow)
  await shot(page, '06c-tanda-deuda-390')
  check('Tercero: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 5d. M1: "Tu bolsa está lista: cóbrala" (cerrador, opción C)
{
  const est = conMiBolsaLista(nuevoEstado())
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
  const tarjeta = page.locator('.tarjeta', { hasText: 'Tanda 6' })
  check('Cobrar: en el lobby, la tarjeta de mi tanda dice "Tu bolsa está lista: cóbrala"', (await tarjeta.locator('.tarjeta-cobro').count()) === 1)
  check('Cobrar: ninguna otra tarjeta lo dice', (await page.locator('.tarjeta-cobro').count()) === 1)
  await page.goto(BASE + '#/tanda/6')
  const boton = page.getByRole('button', { name: 'Tu bolsa está lista: cóbrala' })
  await boton.waitFor({ timeout: 15000 }).catch(() => {})
  check('Cobrar: en la tanda, botón principal "Tu bolsa está lista: cóbrala" habilitado', (await boton.count()) === 1 && !(await boton.isDisabled()) && /principal/.test((await boton.getAttribute('class')) ?? ''))
  const t = (await texto(page)).replace(/\u00a0/g, ' ')
  check('Cobrar: avisa que a Beto no le alcanza la garantía y que la bolsa sale con 60 TUSD menos', /A Beto no le alcanza la garantía: la bolsa sale con 60 TUSD menos, que te queda debiendo y puede pagar después/.test(t), t.slice(0, 1500))
  check('Cobrar: ya no dice "Cerrar la ronda y pagarle a"', !/Cerrar la ronda y pagarle a/.test(t))
  await shot(page, '06d-cobrar-bolsa')
  check('Cobrar: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Otra persona (Ana) ve la misma ronda: cualquiera puede cerrarla, pero no es "su" bolsa.
  const est = conMiBolsaLista(nuevoEstado())
  const { page } = await nuevaPagina(browser, { est, direccion: ANA, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '#/tanda/6')
  await page.waitForSelector('text=Cualquier persona puede cerrar la ronda', { timeout: 15000 }).catch(() => {})
  const t = (await texto(page)).replace(/\u00a0/g, ' ')
  check('Cobrar (otra persona): botón "Cerrar la ronda y pagarle a …" y no "cóbrala"', /Cerrar la ronda y pagarle a/.test(t) && !/Tu bolsa está lista/.test(t), t.slice(0, 1200))
  check('Cobrar (otra persona): la diferencia se le queda debiendo a quien cobra', /que le queda debiendo a /.test(t))
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
  check('Cobrar (otra persona): sin aviso de cobro en el lobby', (await page.locator('.tarjeta-cobro').count()) === 0)
  await page.close()
}

// ---------------------------------------------------------------- 6. Tanda que no existe y ruta desconocida
{
  const est = nuevoEstado()
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/999')
  await page.waitForSelector('.mensaje', { timeout: 15000 }).catch(() => {})
  check('Tanda 999: dice que no existe', /Esa tanda no existe/.test(await texto(page)), (await texto(page)).slice(0, 300))
  await page.goto(BASE + '#/cualquier-cosa')
  check('Ruta desconocida: "Esa página no existe"', /Esa página no existe/.test(await texto(page)))
  await page.close()
}

// ---------------------------------------------------------------- 7. Onboarding de cuenta nueva
{
  const est = nuevoEstado()
  const NUEVA = ME
  est.cuentas = {} // la cuenta no existe todavía
  const { page, errores } = await nuevaPagina(browser, { est, direccion: NUEVA })
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.barra-cuenta')
  check('Cuenta nueva: pide activar con Friendbot', /Activa tu cuenta de pruebas/.test(await texto(page)))
  await shot(page, '07-cuenta-nueva')
  await page.getByRole('button', { name: 'Activar con Friendbot' }).click()
  await page.waitForSelector('text=Listo: tu cuenta ya existe.')
  await page.waitForSelector('text=Acepta TUSD para poder usarlo', { timeout: 15000 })
  check('Cuenta nueva: tras activar, pide aceptar TUSD', true)
  est.cuentas[NUEVA].trustline = true // (la firma real con Freighter no se puede simular aquí)
  await page.waitForSelector('text=Tu saldo:', { timeout: 15000 })
  check('Cuenta con trustline: muestra saldo 0', /Tu saldo:\s*0 TUSD/.test((await texto(page)).replace(/ /g, ' ')))
  await page.getByRole('button', { name: 'Pedir TUSD de prueba' }).click()
  await page.waitForSelector('text=Listo: recibiste TUSD de prueba.')
  await page.waitForFunction(() => /Tu saldo:\s*1.?000 TUSD/.test(document.body.innerText.replace(/ /g, ' ')), null, { timeout: 15000 })
  check('Faucet: el saldo sube a 1 000 TUSD', true)
  await shot(page, '08-cuenta-lista')
  check('Onboarding: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 8. Saldo insuficiente bloquea el botón
{
  const est = nuevoEstado()
  est.cuentas[ME].saldo = 50n * 10_000_000n
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/3')
  await page.waitForSelector('.rueda svg')
  await page.waitForSelector('text=Tu saldo:')
  await page.waitForSelector('.panel .aviso.nota', { timeout: 15000 }).catch(() => {})
  check('Saldo insuficiente: el botón de unirse queda deshabilitado', await page.getByRole('button', { name: /Unirme y dejar/ }).isDisabled())
  check('Saldo insuficiente: explica cuánto falta (50 TUSD)', /Te faltan 50 TUSD/.test(await texto(page)))
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.vista-previa table')
  check('Crear con saldo bajo: avisa que faltan 150 TUSD para unirse como primera', /te faltan 150 TUSD/.test((await texto(page)).replace(/ /g, ' ')))
  await page.close()
}

// ---------------------------------------------------------------- 9. Sin billetera instalada + móvil
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, conectado: false, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.tarjeta', { timeout: 15000 })
  await page.waitForSelector('text=Instalar Freighter', { timeout: 8000 }).catch(() => {})
  check('Sin Freighter: ofrece instalar', /Instalar Freighter/.test(await texto(page)))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  check('Móvil (390px): el lobby no se desborda horizontalmente', !overflow)
  await shot(page, '09-movil-lobby')
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.vista-previa table')
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  check('Móvil (390px): crear tanda no se desborda', !overflow2)
  await shot(page, '10-movil-crear')
  check('Móvil: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}


// ---------------------------------------------------------------- 10. Guía "Pruébalo en 4 pasos"
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, conectado: false })
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.como-probar', { timeout: 15000 })
  const t = await texto(page)
  check('Guía: "Pruébalo en 4 pasos" para quien llega sin billetera', /Pruébalo en 4 pasos/.test(t) && (await page.locator('.paso').count()) === 4)
  check('Guía: no marca ningún ✓ mientras no sabe si hay Freighter (sin parpadeo)', (await page.locator('.paso.hecho').count()) === 0 && (await page.locator('.paso.actual').count()) === 0)
  await page.waitForSelector('.paso.actual', { timeout: 6000 }).catch(() => {})
  check('Guía: sin Freighter, el paso 1 (instalar) queda como el pendiente', /Instala Freighter/.test(await page.locator('.paso.actual').innerText()) && (await page.locator('.paso.hecho').count()) === 0)
  check('Guía: ofrece "Ver la demo en vivo"', (await page.getByRole('link', { name: 'Ver la demo en vivo' }).getAttribute('href')) === '#/demo')
  await shot(page, '11-guia-jurado')
  check('Guía: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = nuevoEstado() // ME con cuenta lista y saldo: la guía ya no hace falta
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.tarjeta', { timeout: 15000 })
  await page.waitForSelector('text=Tu saldo:', { timeout: 15000 })
  check('Guía: desaparece cuando la cuenta ya está lista', (await page.locator('.como-probar').count()) === 0)
  await page.close()
}
{
  const est = nuevoEstado()
  est.cuentas = {} // cuenta nueva: la guía sigue y marca "conectada"
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.barra-cuenta', { timeout: 15000 })
  const hechos = await page.locator('.paso.hecho').count()
  check('Guía: con billetera conectada marca los pasos 1 a 3 como hechos', hechos === 3, `hechos=${hechos}`)
  check('Guía: el paso 4 (conseguir TUSD) queda como el actual', (await page.locator('.paso.actual').count()) === 1)
  await page.close()
}

// ---------------------------------------------------------------- 11. Demo en vivo
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, conectado: false })
  await page.goto(BASE + '#/demo')
  await page.waitForSelector('.demo-persona', { timeout: 15000 })
  await page.waitForSelector('.historia-item', { timeout: 15000 })
  const t = await texto(page)
  check('Demo automática: elige la tanda en curso (2) aunque haya otras más nuevas', /Tanda 2/.test(t) && /Ronda 2 de 3/.test(t))
  check('Demo: muestra el reloj grande', /\d:\d\d/.test(await page.locator('.demo-reloj').innerText()))
  check('Demo: una tarjeta por persona', (await page.locator('.demo-persona').count()) === 3)
  check('Demo: marca a Beto como "cobra ahora"', /cobra ahora/.test(await page.locator('.demo-persona.turno').innerText()) && /Beto/.test(await page.locator('.demo-persona.turno').innerText()))
  check('Demo: muestra la barra de garantía', (await page.locator('.demo-garantia-barra').count()) === 3)
  check('Demo: la línea de tiempo cuenta "Ana cobró 300 TUSD"', /Ana cobró 300 TUSD/.test(t))
  check('Demo: la historia va con lo más reciente primero', /Beto pagó su cuota/.test(await page.locator('.historia-item').first().innerText()))
  check('Demo: no muestra la barra de cuenta (es para proyectar)', (await page.locator('.barra-cuenta').count()) === 0)
  check('Demo automática: ofrece "Fijar esta tanda"', (await page.getByRole('link', { name: 'Fijar esta tanda' }).getAttribute('href')) === '#/demo/2')
  await shot(page, '12-demo-en-curso')
  check('Demo: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, conectado: false })
  await page.goto(BASE + '#/demo/1')
  await page.waitForSelector('.resultados table', { timeout: 15000 })
  await page.waitForSelector('.historia-item.clave', { timeout: 15000 })
  const t = (await texto(page)).replace(/\u00a0/g, ' ')
  check('Demo fija (#/demo/1): resultados finales a todo el ancho', /Resultados finales/.test(t) && /94,50/.test(t))
  check('Demo fija: resalta los DOS momentos clave (la garantía de Ana cubrió dos rondas)', (await page.locator('.historia-item.clave').count()) === 2, `claves=${await page.locator('.historia-item.clave').count()}`)
  check('Demo fija: cuenta "Ana no pagó: su garantía cubrió 100 TUSD"', /Ana no pagó: su garantía cubrió 100 TUSD/.test(t))
  check('Demo fija: no ofrece "Fijar esta tanda" (ya está fija)', (await page.getByRole('link', { name: 'Fijar esta tanda' }).count()) === 0)
  check('Demo fija: una tanda terminada hizo UNA sola consulta de eventos (compartida)', est.eventosPedidos === 1, `consultas=${est.eventosPedidos}`)
  await shot(page, '13-demo-fija-final')
  check('Demo fija: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = nuevoEstado()
  est.tandas = {}
  const { page } = await nuevaPagina(browser, { est, conectado: false })
  await page.goto(BASE + '#/demo')
  await page.waitForSelector('.vacio', { timeout: 15000 })
  check('Demo sin tandas: lo explica en vez de quedar en blanco', /Todavía no hay ninguna tanda/.test(await texto(page)))
  await page.close()
}

// ---------------------------------------------------------------- 12. Historia en la página de una tanda
{
  const est = nuevoEstado()
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/3')
  await page.waitForSelector('.historia-item', { timeout: 15000 })
  const t = await texto(page)
  check('Tanda 3: sección "Qué ha pasado" con la creación y la unión de Ana', /Qué ha pasado/.test(t) && /Se creó la tanda/.test(t) && /Ana se unió/.test(t) && /Turno 1 · dejó 200 TUSD de garantía/.test(t))
  await page.close()
}

// ---------------------------------------------------------------- 13. Estado del sistema (#/estado)
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/estado')
  await page.waitForSelector('.estado-resumen', { timeout: 20000 })
  const t = await texto(page)
  check('Estado: todo en verde -> "Todo listo para la demo"', /Todo listo para la demo/.test(t), t.slice(0, 500))
  check('Estado: 9 puntos revisados (7 de red + 2 de Freighter)', (await page.locator('.chequeo').count()) === 9, `n=${await page.locator('.chequeo').count()}`)
  check('Estado (M3): la web y el contrato desplegado coinciden', /Coinciden: el contrato tiene las \d+ funciones y tipos que usa esta web/.test(t), t.slice(0, 900))
  // M1: las dos bóvedas, con lo libre para intereses (no el saldo bruto, que incluye las garantías).
  check('M1 estado: la principal rinde al ritmo real y dice lo libre y para cuánto alcanza', /Rinde al ritmo de la vida real \(5 % al año\)\. Tiene 3[\s.\u00a0\u202f]?99\d(,\d\d)? TUSD libres para pagar intereses: con las garantías de hoy alcanzan para más de 10 años/.test(t), t.slice(0, 900))
  check('M1 estado: la rápida dice su acelerador y cuánto rinde hoy una demo de 5 minutos', /1 minuto equivale a 36,5 días de intereses\. Una demo de 5 minutos rinde hoy ~2,3\d TUSD por cada 100\. Tiene 9[\s.\u00a0\u202f]?3[67]\d(,\d\d)? TUSD libres/.test(t), t.slice(0, 900))
  check('Estado: da los enlaces de la demo', /#\/demo/.test(t))
  await shot(page, '14-estado-ok')
  check('Estado: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // M1: a la rápida casi no le queda para intereses (700 de saldo, 600 depositados). Ya no es un "problema":
  // con el tope de solvencia ningún retiro falla, solo se detiene el rendimiento. Es un aviso.
  const est = nuevoEstado()
  est.cuentas[(await import('./mock.mjs')).BOVEDA_ID].saldo = 700n * 10_000_000n
  est.faucetStatus = 503
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/estado')
  await page.waitForSelector('.estado-resumen', { timeout: 20000 })
  const t = await texto(page)
  check('Estado: faucet sin llave -> "Hay 1 problema" (la bóveda corta es solo un aviso)', /Hay 1 problema/.test(t), t.slice(0, 400))
  check('M1 estado: explica el comando para recargar la bóveda rápida', /mint --to \$BOVEDA_RAPIDA/.test(t) && /nadie pierde lo que depositó/.test(t), t.slice(0, 1200))
  check('Estado: explica que falta FAUCET_ISSUER_SECRET', /FAUCET_ISSUER_SECRET/.test(t))
  await shot(page, '15-estado-problemas')
  await page.close()
}
{
  // M1: bóveda rápida de hace 3 días: rinde poco en una demo -> aviso con el comando para cambiarla.
  const m = await import('./mock.mjs')
  const est = nuevoEstado()
  est.bovedas[m.BOVEDA_ID].inicio = Math.floor(Date.now() / 1000) - 3 * 86_400
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/estado')
  await page.waitForSelector('.estado-resumen', { timeout: 20000 })
  const t = await texto(page)
  check('M1 estado: rápida vieja -> "Casi listo: 1 aviso"', /Casi listo: 1 aviso/.test(t), t.slice(0, 400))
  check('M1 estado: dice su edad y que se cambie con renovar_boveda_rapida.sh', /se desplegó hace 3 días/.test(t) && /renovar_boveda_rapida\.sh/.test(t), t.slice(0, 1200))
  check('M1 estado: el aviso está en la bóveda rápida', (await page.locator('.chequeo.aviso', { hasText: 'Bóveda rápida' }).count()) === 1)
  check('M1 estado (rápida vieja): sin errores de consola', errores.length === 0, errores.join(' | '))
  await shot(page, '15b-estado-rapida-vieja')
  await page.close()
}
{
  // M1: contrato sin bóveda rápida (desplegado con SIN_BOVEDA_RAPIDA=1) -> aviso que explica cómo crearla.
  const est = nuevoEstado()
  delete est.instanciaTanda.BovedaRapida
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/estado')
  await page.waitForSelector('.estado-resumen', { timeout: 20000 })
  const t = await texto(page)
  check('M1 estado: sin bóveda rápida -> aviso y cómo crearla', /No hay bóveda rápida/.test(t) && /renovar_boveda_rapida\.sh/.test(t) && /Casi listo: 1 aviso/.test(t), t.slice(0, 1200))
  await page.close()
}
{
  const est = nuevoEstado()
  est.contratoCaido = true
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/estado')
  await page.waitForSelector('.estado-resumen', { timeout: 20000 })
  const t = await texto(page)
  check('Estado: contrato caído -> problema y dice que hay que volver a desplegar', /problema/.test(t) && /desplegar_testnet\.sh/.test(t), t.slice(0, 500))
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.aviso.error', { timeout: 15000 }).catch(() => {})
  check('Lobby con el contrato caído: muestra un error (no queda en blanco)', (await page.locator('.aviso.error[role=alert]').count()) >= 1)
  await page.close()
}
{
  // (M3) VITE_TANDA_ID apunta a un contrato de otra versión: le falta una función y un tipo cambió.
  const est = nuevoEstado()
  est.interfazSin = ['crear_tanda_avanzada', 'OpcionesTanda']
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/estado')
  await page.waitForSelector('.estado-resumen', { timeout: 20000 })
  const t = await texto(page)
  check('Estado (M3): contrato de otra versión -> "Hay 1 problema"', /Hay 1 problema/.test(t), t.slice(0, 600))
  check('Estado (M3): dice qué no coincide', /otra versión/.test(t) && /crear_tanda_avanzada/.test(t) && /OpcionesTanda/.test(t))
  check('Estado (M3): dice qué hacer (VITE_TANDA_ID)', /VITE_TANDA_ID/.test(t))
  await shot(page, '15b-estado-otra-version')
  check('Estado (M3): sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 8. Landing
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, conectado: false, viewport: { width: 1280, height: 900 } })
  await page.goto(BASE)
  await page.waitForSelector('.ln', { timeout: 15000 }).catch(() => {})
  check('Landing: la raíz (#/) muestra la landing', (await page.locator('.ln').count()) === 1)
  check('Landing: no hay campos de contraseña ni de correo', (await page.locator('input[type=password], input[type=email]').count()) === 0)
  const hrefs = await page.locator('.ln a[href="#/tandas"]').count()
  check('Landing: hay botones que abren la app (#/tandas)', hrefs >= 2, `hrefs=${hrefs}`)
  check('Landing: botón "Ver la demo en vivo" apunta a #/demo', (await page.locator('.ln a[href="#/demo"]').count()) >= 1)
  const t0 = await texto(page)
  check('Landing: nombre Rounda y sin "Continuar con Google"', /Rounda/.test(t0) && !/Google/.test(t0))
  await page.waitForTimeout(600)
  await shot(page, '08-landing-escritorio')
  // los enlaces internos de la nav no deben romper el enrutador
  const enlaces = page.locator('.ln nav a[href="#/"]')
  const n = await enlaces.count()
  if (n > 0) {
    await enlaces.first().click()
    await page.waitForTimeout(400)
    const t1 = await texto(page)
    check('Landing: click en un enlace de la nav sigue en la landing', (await page.locator('.ln').count()) === 1 && !/no existe/i.test(t1))
  } else {
    check('Landing: la nav tiene enlaces internos', false, 'sin enlaces')
  }
  const h = await page.evaluate(() => window.location.hash)
  check('Landing: la URL sigue siendo #/ tras navegar por la nav', h === '' || h === '#/', `hash=${h}`)
  // abrir la app desde la landing
  await page.locator('.ln a[href="#/tandas"]').first().click()
  await page.waitForSelector('.tarjeta, .aviso', { timeout: 15000 }).catch(() => {})
  check('Landing -> "Abrir app" lleva al lobby', /\/tandas$/.test(await page.evaluate(() => window.location.hash)) && (await page.locator('.ln').count()) === 0)
  check('Landing: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, conectado: false, viewport: { width: 390, height: 800 } })
  await page.goto(BASE)
  await page.waitForSelector('.ln', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(600)
  const ancho = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  check('Landing móvil: sin desborde horizontal', ancho.sw <= ancho.cw + 1, JSON.stringify(ancho))
  await shot(page, '08-landing-movil')
  await page.close()
}
{
  // las rutas profundas no pasan por la landing
  const est = nuevoEstado()
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/3')
  await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {})
  check('Ruta #/tanda/3 no muestra la landing', (await page.locator('.ln').count()) === 0)
  await page.goto(BASE + '#/demo')
  await page.waitForTimeout(800)
  check('Ruta #/demo no muestra la landing', (await page.locator('.ln').count()) === 0)
  await page.goto(BASE + '#/tandas')
  await page.waitForTimeout(800)
  const marca = page.locator('a.marca')
  check('Header: la marca Rounda lleva a la landing', (await marca.getAttribute('href')) === '#/' && /Rounda/.test(await marca.innerText()))
  await marca.click()
  await page.waitForSelector('.ln', { timeout: 5000 }).catch(() => {})
  check('Header: click en la marca abre la landing', (await page.locator('.ln').count()) === 1)
  await page.close()
}

// ---------------------------------------------------------------- M3. Mecanismos de turnos
{
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.modos')
  check('Turnos/crear: cinco formas de repartir los turnos', (await page.locator('.modo').count()) === 5)
  check('Turnos/crear: por defecto, orden de llegada (sin tabla de turnos)', (await page.locator('.turnos-previa').count()) === 0)
  await page.locator('.modo', { hasText: 'Sorteo' }).click()
  let filas = await page.locator('.turnos-previa tbody tr').allInnerTexts()
  check(
    'Turnos/crear: sorteo -> todos dejan 100; al primero se le apartan 100 y recibe 200',
    filas.length === 3 && /^1\s+100\s+100\s+200$/.test(filas[0].trim()) && /300$/.test(filas[2].trim()),
    JSON.stringify(filas),
  )
  check('Turnos/crear: sorteo avisa que un validador podría influir', /un validador de la red podría influir/.test(await texto(page)))
  await page.locator('.modo', { hasText: 'Precio por turno' }).click()
  filas = await page.locator('.turnos-previa tbody tr').allInnerTexts()
  check(
    'Turnos/crear: precio por turno 10 % -> el turno 1 paga 30 y el 3 gana 30',
    /paga 30/.test(filas[0] ?? '') && /270$/.test((filas[0] ?? '').trim()) && /gana 30/.test(filas[2] ?? '') && /330$/.test((filas[2] ?? '').trim()),
    JSON.stringify(filas),
  )
  await page.locator('.modo', { hasText: 'Subasta' }).click()
  check('Turnos/crear: en la subasta no se ofrece intercambiar', !/Permitir intercambiar turnos/.test(await texto(page)))
  check('Turnos/crear: muestra el descuento máximo (30 %)', /Descuento máximo por ronda:\s*30 %/.test(await texto(page)))
  await page.locator('.modo', { hasText: 'Elegir e intercambiar' }).click()
  check('Turnos/crear: "Elegir e intercambiar" trae el intercambio activado', await page.getByLabel(/Permitir intercambiar turnos/).isChecked())
  check('Turnos/crear: el botón de crear sigue habilitado', !(await page.locator('button[type=submit]').isDisabled()))
  await shot(page, 'm3-01-crear-turnos')
  check('Turnos/crear: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/7')
  await page.waitForSelector('.rueda svg', { timeout: 15000 })
  await page.waitForSelector('.turnos-acciones', { timeout: 15000 }).catch(() => {})
  const t = await texto(page)
  check('Turnos/sorteo abierta: "El orden se sortea cuando se llene"', /El orden se sortea cuando se llene/.test(t))
  check('Turnos/sorteo abierta: unirse pide una cuota', /Unirme y dejar 100 TUSD de garantía/.test(t))
  check('Turnos/sorteo abierta: "Tu turno se sorteará"', /Tu turno se sorteará cuando se llene la tanda/.test(t))
  check('Turnos/sorteo abierta: Ana con turno por decidir', /Turno por decidir/.test(t) && (await page.locator('.nodo-turno', { hasText: '?' }).count()) === 1)
  await shot(page, 'm3-02-sorteo-abierta')
  check('Turnos/sorteo abierta: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/8')
  await page.waitForSelector('.rejilla-turnos', { timeout: 15000 })
  const casillas = page.locator('.turno-casilla')
  check('Turnos/precio: una casilla por turno', (await casillas.count()) === 3)
  check('Turnos/precio: el turno 2 (de Ana) no se puede elegir', await casillas.nth(1).isDisabled())
  check('Turnos/precio: el turno 1 muestra su precio', /Garantía 200 TUSD/.test(await casillas.nth(0).innerText()) && /Paga 24/.test(await casillas.nth(0).innerText()))
  check('Turnos/precio: no muestra el botón de unirse sin elegir turno', (await page.getByRole('button', { name: /^Unirme y dejar/ }).count()) === 0)
  await casillas.nth(0).click()
  await page.waitForSelector('text=Unirme en el turno 1 y dejar 200 TUSD', { timeout: 15000 }).catch(() => {})
  const t = await texto(page)
  check('Turnos/precio: al elegir el turno 1 explica que recibe 276 (paga 24)', /recibes 276 TUSD \(la bolsa menos 24 por cobrar antes\)/.test(t), t.slice(0, 900))
  check('Turnos/precio: botón "Unirme en el turno 1 y dejar 200 TUSD"', await page.getByRole('button', { name: 'Unirme en el turno 1 y dejar 200 TUSD' }).isEnabled())
  await casillas.nth(2).click()
  await page.waitForSelector('text=Unirme en el turno 3 y dejar 100 TUSD', { timeout: 15000 }).catch(() => {})
  check('Turnos/precio: el turno 3 gana 24 por esperar', /recibes 324 TUSD \(la bolsa más 24 por esperar\)/.test(await texto(page)))
  await shot(page, 'm3-03-precio-por-turno')
  check('Turnos/precio: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/9')
  await page.waitForSelector('.turnos-acciones', { timeout: 15000 })
  await page.waitForSelector('#oferta', { timeout: 15000 }).catch(() => {})
  let t = await texto(page)
  check('Turnos/subasta: mejor oferta de Beto, 5 % (15 TUSD)', /Beto: 5 % menos \(15 TUSD\)/.test(t), t.slice(0, 800))
  check('Turnos/subasta: "Le toca cobrar: Se decide en la subasta"', /Se decide en la subasta/.test(t))
  check('Turnos/subasta: dice quién cobra si nadie ofrece más', /Si nadie ofrece más, Beto cobra esta ronda/.test(t))
  await page.locator('#oferta').fill('4')
  check('Turnos/subasta: una oferta menor a la mejor no se puede enviar', await page.getByRole('button', { name: 'Ofertar' }).isDisabled())
  await page.locator('#oferta').fill('8')
  t = await texto(page)
  check('Turnos/subasta: 8 % -> recibes 276 y se aparta garantía', /Si ganas recibes 276 TUSD; de ahí se apartan hasta 100/.test(t), t.slice(0, 1200))
  check('Turnos/subasta: el botón Ofertar se habilita', await page.getByRole('button', { name: 'Ofertar' }).isEnabled())
  await page.waitForSelector('text=ofrece recibir 5 % menos', { timeout: 15000 }).catch(() => {})
  check('Turnos/subasta: la historia cuenta la oferta de Beto', /Beto ofrece recibir 5 % menos/.test(await texto(page)))
  await shot(page, 'm3-04-subasta')
  check('Turnos/subasta: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/10')
  await page.waitForSelector('.propuesta.recibida', { timeout: 15000 })
  const t = await texto(page)
  check('Turnos/intercambio: propuesta recibida de Carla con 10 TUSD', /Carla te propone cambiar su turno 3 por tu turno 2 · te paga 10 TUSD/.test(t), t.slice(0, 900))
  check('Turnos/intercambio: botones Aceptar y Rechazar', (await page.getByRole('button', { name: 'Aceptar el cambio' }).count()) === 1 && (await page.getByRole('button', { name: 'Rechazar' }).count()) === 1)
  const opciones = await page.locator('#intercambio-con option').allInnerTexts()
  check('Turnos/intercambio: solo se ofrece cambiar con turnos futuros (Carla, no Ana)', opciones.length === 2 && /Carla/.test(opciones[1]), JSON.stringify(opciones))
  await page.locator('#intercambio-con').selectOption({ index: 1 })
  await page.locator('#intercambio-sentido').selectOption('pago')
  check('Turnos/intercambio: con compensación pide el monto', await page.getByRole('button', { name: 'Proponer intercambio' }).isDisabled())
  await page.getByLabel('Monto de la compensación').fill('5')
  check('Turnos/intercambio: con monto se puede proponer', await page.getByRole('button', { name: 'Proponer intercambio' }).isEnabled())
  await shot(page, 'm3-05-intercambio')
  check('Turnos/intercambio: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.tarjeta', { timeout: 15000 })
  await page.waitForFunction(() => document.querySelectorAll('.tarjeta').length === 10, null, { timeout: 15000 }).catch(() => {})
  const tarjeta = async (n) => page.locator('.tarjeta', { has: page.locator('h2', { hasText: new RegExp(`^Tanda ${n}$`) }) }).innerText()
  check('Turnos/lobby: sorteo abierta entra con una cuota', /Entras con 100 TUSD de garantía \(el orden se sortea\)/.test(await tarjeta(7)) && /Turnos: sorteo/.test(await tarjeta(7)))
  check('Turnos/lobby: precio por turno -> "Eliges tu turno al entrar"', /Eliges tu turno al entrar/.test(await tarjeta(8)) && /Turnos: precio por turno/.test(await tarjeta(8)))
  check('Turnos/lobby: la subasta muestra su modo', /Turnos: subasta/.test(await tarjeta(9)))
  check('Turnos/lobby: las tandas de siempre no muestran modo', !/Turnos:/.test(await tarjeta(3)) && /\(turno 2\)/.test(await tarjeta(3)))
  await shot(page, 'm3-10-lobby-turnos')
  check('Turnos/lobby: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est, conectado: false })
  await page.goto(BASE + '#/demo/9')
  await page.waitForSelector('.demo-personas', { timeout: 15000 })
  await page.waitForTimeout(500)
  const t = await texto(page)
  check('Turnos/demo proyectada: "Cobra quien gane la subasta"', /Cobra quien gane la subasta/.test(t), t.slice(0, 600))
  check('Turnos/demo proyectada: turnos por decidir con "?"', (await page.locator('.demo-turno', { hasText: '?' }).count()) === 3)
  await shot(page, 'm3-09-demo-subasta')
  check('Turnos/demo proyectada: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
for (const [ruta, nombre] of [['#/crear', 'm3-06-crear-movil'], ['#/tanda/9', 'm3-07-subasta-movil'], ['#/tanda/8', 'm3-08-precio-movil'], ['#/tanda/10', 'm3-11-intercambio-movil']]) {
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est, viewport: { width: 390, height: 800 } })
  await page.goto(BASE + ruta)
  if (ruta === '#/crear') {
    await page.waitForSelector('.modos')
    await page.locator('.modo', { hasText: 'Subasta' }).click()
  } else {
    await page.waitForSelector('.turnos-acciones', { timeout: 15000 }).catch(() => {})
  }
  await page.waitForTimeout(400)
  const ancho = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  check(`Turnos 390 px (${ruta}): sin desborde horizontal`, ancho.sw <= ancho.cw + 1, JSON.stringify(ancho))
  await shot(page, nombre)
  check(`Turnos 390 px (${ruta}): sin errores de consola`, errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- M2 + M3: historial donde se elige turno
{
  // Precio por turno (tanda 8) que pide Bronce y da descuento. "Yo" soy Bronce (110 puntos): 10 % menos.
  const est = nuevoEstadoTurnos()
  est.tandas[8].requisitos = { puntaje_minimo: 100, descuento: true }
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/8')
  await page.waitForSelector('.rejilla-turnos', { timeout: 15000 })
  await page.waitForSelector('.nota-historial', { timeout: 15000 }).catch(() => {})
  let t = await texto(page)
  check('Historial + turnos: la nota del historial también sale donde se elige turno', /pide historial Bronce o mejor/.test(t) && /Tienes 110: puedes entrar/.test(t), t.slice(0, 900))
  await page.locator('.turno-casilla').nth(0).click()
  await page.getByRole('button', { name: /^Unirme en el turno 1 y dejar 180 TUSD$/ }).waitFor({ timeout: 15000 }).catch(() => {})
  t = await texto(page)
  check('Historial + turnos: el turno 1 cotiza la garantía con descuento (200 -> 180)', /dejas 180 TUSD de garantía \(con el descuento de tu historial\)/.test(t), t.slice(0, 900))
  check('Historial + turnos: el botón usa la garantía con descuento', await page.getByRole('button', { name: 'Unirme en el turno 1 y dejar 180 TUSD' }).isEnabled())
  await shot(page, 'm2m3-01-precio-con-historial')
  check('Historial + turnos: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- M3: subasta con ofertas selladas
{
  // Crear: la casilla aparece en la subasta.
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.modos')
  await page.locator('.modo', { hasText: 'Subasta' }).click()
  const casilla = page.getByLabel(/Ofertas selladas/)
  check('Sellada/crear: la subasta ofrece ofertas selladas (apagadas por defecto)', (await casilla.count()) === 1 && !(await casilla.isChecked()))
  await casilla.check()
  check('Sellada/crear: explica que se revela desde el mismo navegador', /Se revela desde el mismo navegador/.test(await texto(page)))
  await page.locator('.modo', { hasText: 'Precio por turno' }).click()
  check('Sellada/crear: en otros modos no aparece', (await page.getByLabel(/Ofertas selladas/).count()) === 0)
  check('Sellada/crear: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Primera mitad: se sella. Beto ya selló; nadie ve porcentajes.
  const est = conSubastaSellada(nuevoEstadoTurnos(), 'sellar')
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/9')
  await page.waitForSelector('.turnos-acciones', { timeout: 15000 })
  const t = await texto(page)
  check('Sellada/sellar: cuántos sellaron, sin porcentajes', /Ofertas selladas\s*1 persona/.test(t) && !/Beto: 5 %/.test(t), t.slice(0, 900))
  check('Sellada/sellar: cuánto queda para sellar', /Se sella durante/.test(t))
  const boton = page.getByRole('button', { name: 'Sellar mi oferta' })
  check('Sellada/sellar: sin porcentaje no se puede sellar', await boton.isDisabled())
  await page.locator('#oferta-sellada').fill('8')
  check('Sellada/sellar: con 8 % se habilita "Sellar mi oferta"', await boton.isEnabled())
  check('Sellada/sellar: avisa que la clave queda en este navegador', /revélala desde aquí mismo/.test(await texto(page)))
  await page.locator('#oferta-sellada').fill('31')
  check('Sellada/sellar: más del máximo (30 %) no se puede', await boton.isDisabled())
  await shot(page, 'm3-12-sellada-sellar')
  check('Sellada/sellar: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Segunda mitad: "yo" sellé 8 % desde este navegador y puedo revelarla; Beto ya reveló 5 %.
  const est = conSubastaSellada(nuevoEstadoTurnos(), 'revelar')
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.addInitScript(
    ({ k, v }) => localStorage.setItem(k, v),
    { k: `rounda:oferta-sellada:${TANDA_ID}:9:0:${ME}`, v: JSON.stringify({ bps: 800, sal: '07'.repeat(32) }) },
  )
  await page.goto(BASE + '#/tanda/9')
  await page.waitForSelector('.turnos-acciones', { timeout: 15000 })
  const t = await texto(page)
  check('Sellada/revelar: muestra la mejor revelada', /Mejor oferta revelada\s*Beto: 5 % menos/.test(t), t.slice(0, 900))
  check('Sellada/revelar: botón "Revelar mi oferta (8 %)"', await page.getByRole('button', { name: 'Revelar mi oferta (8 %)' }).isEnabled())
  await shot(page, 'm3-13-sellada-revelar')
  check('Sellada/revelar: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Segunda mitad, pero sellé desde otro navegador: no hay clave aquí.
  const est = conSubastaSellada(nuevoEstadoTurnos(), 'revelar')
  const { page, errores } = await nuevaPagina(browser, { est, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '#/tanda/9')
  await page.waitForSelector('.turnos-acciones', { timeout: 15000 })
  check('Sellada/revelar sin clave: lo explica', /Sellaste tu oferta desde otro navegador/.test(await texto(page)))
  check('Sellada/revelar sin clave: no ofrece revelar', (await page.getByRole('button', { name: /Revelar mi oferta/ }).count()) === 0)
  const ancho = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  check('Sellada (390 px): sin desborde horizontal', ancho.sw <= ancho.cw + 1, JSON.stringify(ancho))
  check('Sellada/revelar sin clave: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- M2 + M3: los primeros turnos piden historial
{
  // Crear: la opción aparece donde se elige turno (con historial activo) y marca los turnos en la tabla.
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.modos')
  check('Primeros con historial: no se ofrece en orden de llegada', (await page.locator('.primeros-historial').count()) === 0)
  await page.locator('.modo', { hasText: 'Precio por turno' }).click()
  await page.waitForSelector('.primeros-historial', { timeout: 15000 }).catch(() => {})
  check('Primeros con historial: se ofrece en precio por turno', (await page.locator('.primeros-historial').count()) === 1)
  await page.getByLabel(/Los primeros turnos, solo para quien tenga buen historial/).check()
  const t = await texto(page)
  check('Primeros con historial: por defecto, turnos 1 a 2 con Bronce', /Los turnos 1 a 2 solo los puede elegir quien tenga historial Bronce o mejor/.test(t), t.slice(0, 900))
  const filas = await page.locator('.turnos-previa tbody tr').allInnerTexts()
  check('Primeros con historial: la tabla marca los turnos 1 y 2', /Bronce/.test(filas[0] ?? '') && /Bronce/.test(filas[1] ?? '') && !/Bronce/.test(filas[2] ?? ''), JSON.stringify(filas))
  check('Primeros con historial: con Bronce (tengo 110) me uno en el turno 1', /dejarás 200 TUSD de garantía y cobrarás en la ronda 1/.test(t))
  await page.locator('#primeros-nivel').selectOption('300')
  await page.getByText(/cobrarás en la ronda 3/).waitFor({ timeout: 15000 }).catch(() => {})
  const t2 = await texto(page)
  check('Primeros con historial: se puede pedir Plata', /historial Plata o mejor/.test(t2))
  check('Primeros con historial: con Plata (tengo 110) me uno en el primer turno abierto: el 3', /dejarás 100 TUSD de garantía y cobrarás en la ronda 3/.test(t2), t2.slice(0, 1200))
  check('Primeros con historial: el botón de crear sigue habilitado', !(await page.locator('button[type=submit]').isDisabled()))
  await shot(page, 'm2m3-02-crear-primeros-con-historial')
  check('Primeros con historial (crear): sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // A 390 px, con la opción abierta, nada se desborda.
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.modos')
  await page.locator('.modo', { hasText: 'Precio por turno' }).click()
  await page.getByLabel(/Los primeros turnos, solo para quien tenga buen historial/).check()
  await page.waitForTimeout(400)
  const ancho = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  check('Primeros con historial (390 px): sin desborde horizontal', ancho.sw <= ancho.cw + 1, JSON.stringify(ancho))
  await shot(page, 'm2m3-04-crear-primeros-390')
  check('Primeros con historial (390 px): sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Sin historial conectado (contrato anterior a M2), la opción no existe.
  const est = nuevoEstadoTurnos()
  est.historialActivo = false
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.modos')
  await page.locator('.modo', { hasText: 'Precio por turno' }).click()
  await page.waitForTimeout(800)
  check('Primeros con historial: sin historial no se ofrece', (await page.locator('.primeros-historial').count()) === 0)
  await page.close()
}
{
  // Elegir turno: "yo" tengo 110 puntos y el turno 1 pide Bronce (100): lo puedo elegir.
  const est = conPrimerosConHistorial(nuevoEstadoTurnos(), 8, 1, 100)
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/8')
  await page.waitForSelector('.rejilla-turnos', { timeout: 15000 })
  await page.getByText(/tienes 110/).waitFor({ timeout: 15000 }).catch(() => {})
  const t = await texto(page)
  check('Turno con historial (alcanza): lo explica con mi puntaje', /El turno 1 pide historial Bronce o mejor \(100 puntos\): tienes 110/.test(t), t.slice(0, 900))
  const casilla = page.locator('.turno-casilla').nth(0)
  check('Turno con historial (alcanza): la casilla dice "Pide Bronce" y se puede elegir', /Pide Bronce/.test(await casilla.innerText()) && !(await casilla.isDisabled()))
  check('Turno con historial (alcanza): sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Si pide Plata (300) y tengo 110, el turno 1 no se puede elegir; el 3 sí.
  const est = conPrimerosConHistorial(nuevoEstadoTurnos(), 8, 1, 300)
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/8')
  await page.waitForSelector('.rejilla-turnos', { timeout: 15000 })
  await page.getByText(/tienes 110/).waitFor({ timeout: 15000 }).catch(() => {})
  const casillas = page.locator('.turno-casilla')
  check('Turno con historial (no alcanza): el turno 1 no se puede elegir', await casillas.nth(0).isDisabled())
  check('Turno con historial (no alcanza): el turno 3 sí', !(await casillas.nth(2).isDisabled()))
  check('Turno con historial (no alcanza): dice cuánto tengo', /historial Plata o mejor \(300 puntos\): tienes 110/.test(await texto(page)))
  await shot(page, 'm2m3-03-turno-con-historial')
  check('Turno con historial (no alcanza): sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- M2. Historial crediticio
{
  // Página pública de otra persona
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + `#/historial/${ANA}`)
  await page.waitForSelector('.historial-cabeza', { timeout: 15000 }).catch(() => {})
  const t = (await texto(page)).replace(/ /g, ' ')
  check('Historial: muestra puntaje y nivel Plata de Ana', /330 puntos/.test(t) && /Plata/.test(t), t.slice(0, 400))
  check('Historial: desglose en frases', /30 cuotas pagadas a tiempo/.test(t) && /3 tandas terminadas sin atrasos/.test(t))
  check('Historial: dice el descuento y lo que falta para Oro', /25 % menos de garantía/.test(t) && /Faltan 270 puntos para Oro/.test(t))
  await page.getByText('Cómo se calcula').click()
  const reglas = await texto(page)
  check('Historial: explica la fórmula y las reglas anti-trampa', /Pagar una cuota a tiempo\s*\+10/.test(reglas) && /150 puntos por tanda/.test(reglas))
  check('Historial: enlace al contrato en el explorador', (await page.locator('a[href*="/contract/C"]', { hasText: 'Verlo en el explorador' }).count()) === 1)
  await shot(page, 'm2-01-historial-ana')
  // Buscar otra dirección
  await page.locator('#buscar-dir').fill(CARLA.toLowerCase())
  await page.getByRole('button', { name: 'Ver historial' }).click()
  await page.waitForFunction(() => /Historial de Carla/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
  const tc = await texto(page)
  check('Historial: buscar lleva al de Carla (mora saldada, puntaje 0, Nuevo)', /0 puntos/.test(tc) && /1 vez en mora/.test(tc) && /1 deuda saldada/.test(tc) && !/deuda sin saldar/.test(tc), tc.slice(0, 400))
  check('Historial: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Mi historial (menú) y una dirección sin historial
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await page.getByRole('link', { name: 'Mi historial' }).click()
  await page.waitForSelector('.historial-cabeza', { timeout: 15000 }).catch(() => {})
  const t = await texto(page)
  check('Mi historial: desde el menú, con 110 puntos (Bronce)', /Tu historial/.test(t) && /110 puntos/.test(t) && /Bronce/.test(t), t.slice(0, 300))
  est.historiales[ME] = historial()
  await page.goto(BASE + `#/historial/${StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3))}`)
  await page.waitForFunction(() => /no tiene historial/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
  check('Historial: una dirección nueva empieza en cero', /todavía no tiene historial/.test(await texto(page)))
  await page.goto(BASE + `#/historial/${'G' + 'A'.repeat(55)}`)
  await page.waitForFunction(() => /no es válida/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
  check('Historial: una dirección con error de tipeo se explica', /Esa dirección no es válida/.test(await texto(page)))
  check('Mi historial: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Insignias en la lista de miembros
  const est = nuevoEstado()
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/2')
  await page.waitForSelector('.miembros .insignia', { timeout: 15000 }).catch(() => {})
  const insignias = await page.locator('.miembros .insignia').allInnerTexts()
  check('Insignias: Ana Plata, Beto Bronce, Carla Nuevo', insignias.join(',') === 'Plata,Bronce,Nuevo', JSON.stringify(insignias))
  const href = await page.locator('.miembros .insignia').first().getAttribute('href')
  check('Insignias: llevan al historial de esa persona', href === `#/historial/${ANA}`, href)
  await page.close()
}
{
  // Tanda exigente: puntaje mínimo y descuento al unirse
  const est = conTandaExigente(nuevoEstado())
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/7')
  await page.waitForSelector('.nota-historial', { timeout: 15000 }).catch(() => {})
  await page.waitForFunction(() => /baja de/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {})
  const t = (await texto(page)).replace(/ /g, ' ')
  check('Unirse: dice que la tanda pide Bronce y que sí puedo entrar', /pide historial Bronce o mejor/.test(t) && /Tienes 110: puedes entrar/.test(t), t.slice(0, 600))
  check('Unirse: la garantía baja de 500 a 450 por mi historial', /tu garantía baja de 500 a 450 TUSD/.test(t))
  check('Unirse: el botón usa la garantía con descuento', (await page.getByRole('button', { name: /Unirme y dejar 450 TUSD/ }).count()) === 1)
  await shot(page, 'm2-02-unirse-con-descuento')
  check('Unirse con descuento: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()

  const est2 = conTandaExigente(nuevoEstado())
  est2.historiales[ME] = historial({ cuotas_a_tiempo: 5, puntos_positivos: 50 })
  const p2 = await nuevaPagina(browser, { est: est2 })
  await p2.page.goto(BASE + '#/tanda/7')
  await p2.page.waitForFunction(() => /Tienes 50/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
  const t2 = (await texto(p2.page)).replace(/ /g, ' ')
  check('Unirse: con 50 puntos avisa que todavía no puede entrar', /Tienes 50: todavía no puedes unirte/.test(t2) && /garantía por buen historial/.test(t2), t2.slice(0, 600))
  check('Unirse sin nivel: el botón usa la garantía normal', (await p2.page.getByRole('button', { name: /Unirme y dejar 500 TUSD/ }).count()) === 1)
  await p2.page.close()
}
{
  // Crear: opciones de historial
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.opciones-historial', { timeout: 15000 }).catch(() => {})
  check('Crear: ofrece las opciones de historial', (await page.locator('.opciones-historial').count()) === 1)
  await page.getByLabel('Pedir un nivel mínimo para unirse').check()
  await page.locator('#nivel-minimo').selectOption('300')
  const t = await texto(page)
  check('Crear: avisa que con nivel Plata yo (110) no podría unirme', /Tu historial tiene 110 puntos/.test(t) && /firma más/.test(t), t.slice(0, 200))
  await page.getByLabel('Dar descuento de garantía por buen historial').check()
  check('Crear: el descuento se puede marcar', await page.getByLabel('Dar descuento de garantía por buen historial').isChecked())
  await shot(page, 'm2-03-crear-opciones')
  check('Crear con historial: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Contrato de tanda anterior a M2: todo lo del historial se esconde sin errores
  const est = conTandaExigente(nuevoEstado())
  est.historialActivo = false
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/2')
  await page.waitForSelector('.miembros table', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
  check('Sin historial: no hay insignias', (await page.locator('.insignia').count()) === 0)
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.vista-previa table', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
  check('Sin historial: crear no muestra las opciones de historial', (await page.locator('.opciones-historial').count()) === 0)
  await page.goto(BASE + '#/historial')
  await page.waitForTimeout(800)
  check('Sin historial: la página lo explica', /todavía no está activo/.test(await texto(page)))
  check('Sin historial: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // 390 px
  const est = conTandaExigente(nuevoEstado())
  const { page } = await nuevaPagina(browser, { est, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + `#/historial/${ANA}`)
  await page.waitForSelector('.historial-cabeza', { timeout: 15000 }).catch(() => {})
  const desborde = async () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  check('Móvil (390px): el historial no se desborda', !(await desborde()))
  await shot(page, 'm2-04-historial-390')
  await page.goto(BASE + '#/tanda/7')
  await page.waitForSelector('.nota-historial', { timeout: 15000 }).catch(() => {})
  check('Móvil (390px): unirse con descuento no se desborda', !(await desborde()))
  await shot(page, 'm2-05-unirse-390')
  await page.close()
}

await browser.close()
const fallos = resultados.filter((r) => !r.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas`)
process.exit(fallos.length ? 1 : 0)
