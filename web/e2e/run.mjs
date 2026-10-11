import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { ME, ANA, BETO, CARLA, TANDA_ID, nuevoEstado, nuevoEstadoTurnos, conTandaMorosa, conTodosPagaron, conDeudaTerminada, conTandaExigente, conPrimerosConHistorial, conSubastaSellada, conMiBolsaLista, conTandaUsdc, historial, ADAPTADOR_USDC, USDC_ID } from './mock.mjs'
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
/** UX: en "Crear", lo que no es una de las 3 preguntas está plegado en "Opciones avanzadas". */
const abrirAvanzadas = async (page) => {
  await page.waitForSelector('details.avanzadas', { timeout: 15000 })
  if (!(await page.locator('details.avanzadas').evaluate((d) => d.open))) await page.locator('details.avanzadas summary').click()
}
/** UX: con sesión, el lobby empieza en "Mis tandas". Los escenarios que miran todas las tandas pasan a "Todas". */
const verTodas = async (page) => {
  await page.waitForSelector('.filtros', { timeout: 8000 }).catch(() => {})
  const b = page.getByRole('button', { name: 'Todas', exact: true })
  if (await b.count()) await b.click()
}
/** Los escenarios de turnos, reputación y moneda usan la tanda de prueba de siempre: 3 personas, $100, 1 minuto. */
const crearDePrueba = async (page) => {
  await page.getByRole('button', { name: 'Prueba rápida (1 minuto)' }).click()
  await abrirAvanzadas(page)
}

const browser = await chromium.launch(opcionesNavegador())

// ---------------------------------------------------------------- 1. Lobby (conectada como ME)
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
  check('Lobby (UX): con sesión empieza en "Mis tandas"', (await page.locator('h1').innerText()) === 'Mis tandas' && (await page.locator('.tarjeta').count()) === 1)
  check('Menú (UX): Mis tandas, Crear y Perfil; Demo y Estado van al pie', (await page.locator('.menu a').allInnerTexts()).join('|') === 'Mis tandas|Crear|Perfil' && (await page.locator('.pie a', { hasText: 'Demo en vivo' }).count()) === 1)
  check('Encabezado (UX): sin dirección G... a la vista', !/G[A-Z2-7]{3}…[A-Z2-7]{4}/.test(await page.locator('.barra').innerText()))
  await verTodas(page)
  // El saldo llega en otra consulta que las tandas: se espera como en las demás pruebas de la cuenta.
  await page.waitForSelector('text=Tienes:', { timeout: 15000 }).catch(() => {})
  const t = await texto(page)
  // Plan v5: las canceladas no se muestran si no se piden ("Mostrar canceladas", en "Más filtros").
  check('Lobby: muestra las 4 tandas que no están canceladas', (await page.locator('.tarjeta').count()) === 4, `tarjetas=${await page.locator('.tarjeta').count()}`)
  check('Lobby: la más nueva va primero', (await page.locator('.tarjeta h2').first().innerText()) === 'Tanda 5')
  check('Lobby: etiqueta Terminada y En curso, sin canceladas', /Terminada/.test(t) && !/Cancelada/.test(t) && /En curso/.test(t))
  check('Lobby: tarjeta abierta muestra la garantía de entrada', /Entras con \$100 de depósito \(turno 2\)/.test(t), t.slice(0, 300))
  check('Lobby: marca "La creaste tú" en la tanda 3', /La creaste tú/.test(t))
  check('Lobby: la barra de cuenta muestra el saldo', /Tienes:\s*\$1[\s.,]?000/.test(t.replace(/ /g, ' ')), t.slice(0, 200))
  await shot(page, '01-lobby')
  await page.getByRole('button', { name: /Más filtros/ }).click()
  await page.getByLabel('Mostrar canceladas').check()
  check('Lobby: "Mostrar canceladas" agrega la cancelada', (await page.locator('.tarjeta').count()) === 5 && /Cancelada/.test(await texto(page)))
  await page.getByRole('button', { name: 'Mis tandas' }).click()
  check('Filtro "Mis tandas": solo la tanda 3', (await page.locator('.tarjeta').count()) === 1)
  await page.getByRole('button', { name: 'Abiertas' }).click()
  check('Filtro "Abiertas": tandas 3 y 5', (await page.locator('.tarjeta').count()) === 2)
  await page.getByRole('button', { name: 'Terminadas' }).click()
  check('Filtro "Terminadas": tandas 1 y 4', (await page.locator('.tarjeta').count()) === 2)
  check('Lobby: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 1b. Buscar y filtrar (plan v5, pedidos 5 y 4)
{
  const est = nuevoEstado()
  // Carla tiene un pago pendiente en otra tanda (lo dice su reputación): marca en las tandas 2 y 5, que siguen.
  est.historiales[CARLA] = historial({ cuotas_a_tiempo: 4, veces_moroso: 2, deudas_saldadas: 1, puntos_positivos: 100, puntos_negativos: 115 })
  const { page, errores } = await nuevaPagina(browser, { est, conectado: false })
  const tarjetas = async () => (await page.locator('.tarjeta h2').allInnerTexts()).join()
  const buscar = async (q) => {
    await page.locator('#buscar-tandas').fill(q)
    await page.waitForTimeout(150)
  }
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
  check('Buscar: sin sesión empieza en "Todas" y sin canceladas', (await tarjetas()) === 'Tanda 5,Tanda 3,Tanda 2,Tanda 1', await tarjetas())
  await buscar('Beto')
  check('Buscar: por nombre de una persona (Beto está en las tandas 1, 2 y 5)', (await tarjetas()) === 'Tanda 5,Tanda 2,Tanda 1', await tarjetas())
  check('Buscar: lo buscado queda en la URL', /#\/tandas\?q=Beto$/.test(page.url()), page.url())
  await buscar('#3')
  check('Buscar: por número', (await tarjetas()) === 'Tanda 3', await tarjetas())
  await buscar('GDPIB76')
  check('Buscar: por un pedazo de la dirección (la de Carla)', (await tarjetas()) === 'Tanda 5,Tanda 2,Tanda 1', await tarjetas())
  await buscar('nadie se llama así')
  check('Buscar: sin resultados lo dice', (await page.locator('.tarjeta').count()) === 0 && /Ninguna tanda coincide/.test(await texto(page)))
  await page.getByRole('button', { name: 'Quitar filtros' }).click()
  check('Buscar: "Quitar filtros" vuelve a mostrar todo', (await page.locator('.tarjeta').count()) === 4 && (await page.locator('#buscar-tandas').inputValue()) === '' && /#\/tandas$/.test(page.url()), page.url())

  // Pedido 4: la marca de pagos pendientes (solo en tandas que siguen)
  await page.waitForFunction(() => document.querySelectorAll('.tarjeta-pendiente').length === 2, null, { timeout: 8000 }).catch(() => {})
  const marcadas = (await page.locator('.tarjeta:has(.tarjeta-pendiente) h2').allInnerTexts()).join()
  check('Pagos pendientes: marca en las tandas que siguen con Carla (5 y 2), no en la terminada', marcadas === 'Tanda 5,Tanda 2', marcadas)
  check('Pagos pendientes: la marca dice cuántas personas', /1 persona con un pago pendiente/.test(await texto(page)))
  check('Tarjeta: dice cuánto dura la tanda completa', /dura 5 semanas/.test(await page.locator('.tarjeta', { hasText: 'Tanda 5' }).innerText()))

  // Más filtros
  const mas = page.getByRole('button', { name: /Más filtros/ })
  await mas.click()
  await page.getByLabel('Sin personas con pagos pendientes').check()
  check('Filtro: sin personas con pagos pendientes (quedan la 3 y la 1)', (await tarjetas()) === 'Tanda 3,Tanda 1', await tarjetas())
  check('Filtro: el botón cuenta los filtros puestos', /Más filtros \(1\)/.test(await mas.innerText()), await mas.innerText())
  await page.getByLabel('Sin personas con pagos pendientes').uncheck()
  await page.getByLabel('Cuota hasta, en dólares').fill('60')
  check('Filtro: cuota hasta $60 (solo la 5, de $50)', (await tarjetas()) === 'Tanda 5', await tarjetas())
  check('Filtro: la cuota queda en la URL', /[?&]cuota=-60(&|$)/.test(page.url()), page.url())
  await page.getByLabel('Cuota hasta, en dólares').fill('')
  await page.getByLabel('Duración').selectOption('semanas')
  check('Filtro: dura de una semana a dos meses (la 5: 5 turnos semanales)', (await tarjetas()) === 'Tanda 5', await tarjetas())
  await page.getByLabel('Duración').selectOption('')
  await page.getByLabel('Reputación de quien la creó').selectOption('Plata')
  await page.waitForFunction(() => document.querySelectorAll('.tarjeta').length === 1, null, { timeout: 8000 }).catch(() => {})
  check('Filtro: reputación Plata o más (solo Ana, que creó la 1)', (await tarjetas()) === 'Tanda 1', await tarjetas())
  await page.getByLabel('Reputación de quien la creó').selectOption('')
  await page.getByLabel('Turnos').selectOption('Subasta')
  check('Filtro: turnos por subasta (ninguna en este escenario)', (await page.locator('.tarjeta').count()) === 0)
  await page.getByLabel('Turnos').selectOption('')
  await page.getByLabel('Mostrar canceladas').check()
  check('Filtro: "Mostrar canceladas" agrega la 4', (await page.locator('.tarjeta').count()) === 5)

  // Se recuerdan en el navegador y se comparten por la URL
  await page.getByRole('button', { name: 'Abiertas' }).click()
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {})
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(200)
  check('Filtros: se recuerdan al volver a la lista', (await tarjetas()) === 'Tanda 5,Tanda 3' && /estado=abiertas/.test(page.url()) && /canceladas=1/.test(page.url()), `${await tarjetas()} ${page.url()}`)
  await page.goto(BASE + '#/tandas?cuota=-60')
  await page.waitForTimeout(300)
  check('Filtros: un enlace con filtros, abierto en la lista, se aplica', (await tarjetas()) === 'Tanda 5' && (await page.getByRole('button', { name: 'Todas', exact: true }).getAttribute('aria-pressed')) === 'true', await tarjetas())
  check('Buscar y filtrar: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Un enlace compartido abre la lista ya filtrada; a 390 px el panel no se sale
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, conectado: false, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '#/tandas?q=Ana&estado=todas&duracion=dias')
  await page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(300)
  const lista = (await page.locator('.tarjeta h2').allInnerTexts()).join()
  check('Enlace compartido: abre la lista filtrada (Ana, tandas cortas: 3, 2 y 1)', lista === 'Tanda 3,Tanda 2,Tanda 1', lista)
  check('Enlace compartido: "Más filtros" se abre solo si trae filtros', (await page.locator('#panel-filtros').count()) === 1 && (await page.getByLabel('Duración').inputValue()) === 'dias')
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  check('Buscar y filtrar (390 px): nada se sale de la pantalla', !desborde)
  await shot(page, 'v5-filtros-390')
  check('Enlace compartido: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 2. Crear tanda (UX: 3 preguntas)
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.vista-previa .resumen-frase')
  const previa = async () => (await page.locator('.vista-previa').innerText()).replace(/[\u00a0\u202f]/g, ' ')
  let p = await previa()
  check('Crear: por defecto "Entre amigos, semanal"', (await page.getByRole('button', { name: 'Entre amigos, semanal' }).getAttribute('aria-pressed')) === 'true')
  check('Crear: las 3 preguntas', /¿Cuánto pone cada quien\?/.test(await texto(page)) && /¿Cuántas personas\?/.test(await texto(page)) && /¿Cada cuánto\?/.test(await texto(page)))
  check('Crear: el resumen en palabras', /Cada semana, 5 personas ponen \$20 y una de ellas recibe \$100\./.test(p), p.slice(0, 300))
  check('Crear: el resumen trae fechas reales', /el primer pago vence el \S+ \d+ de \S+/.test(p) && /el último pago vence el \S+ \d+ de \S+/.test(p), p.slice(0, 600))
  check('Crear: dice cuánto dejo de depósito ($80) y que lo recupero', /Tú dejas \$80 de depósito de seguridad y lo recuperas al final/.test(p), p.slice(0, 900))
  check('Crear: con depósito 100 % dice que el grupo no pierde nada', /el grupo no pierde nada/.test(p))
  check('Crear: "Unirme yo también" viene marcada', await page.getByLabel(/Unirme yo también/).isChecked())
  check('Crear: "Opciones avanzadas" viene plegada', !(await page.locator('details.avanzadas').evaluate((d) => d.open)) && !(await page.locator('.modos').isVisible()))
  await page.locator('details.deposito-turnos summary').click()
  let filas = await page.locator('.vista-previa tbody tr').allInnerTexts()
  check('Crear: depósito de cada turno 80/60/40/20/20', filas.length === 5 && /\$80/.test(filas[0]) && /\$60/.test(filas[1]) && /\$20/.test(filas[4]), JSON.stringify(filas))
  await shot(page, '02-crear')
  await page.getByRole('button', { name: 'Una persona más' }).click()
  check('Crear: el botón + suma una persona', (await page.locator('#n').inputValue()) === '6' && /6 personas ponen \$20 y una de ellas recibe \$120/.test(await previa()))
  await page.getByRole('button', { name: 'Quincenal', exact: true }).click()
  check('Crear: "Quincenal" cambia el resumen', /^Cada 15 días, 6 personas/m.test(await previa()))
  await page.locator('#cuota').fill('abc')
  check('Crear: cuota inválida muestra error y deshabilita el botón', /mayor que cero/.test(await texto(page)) && (await page.locator('button[type=submit]').isDisabled()))
  await page.locator('#cuota').fill('100')
  await page.locator('#n').fill('5')
  await page.locator('details.avanzadas summary').click()
  await page.locator('#cobertura').fill('50')
  check('Crear: con depósito 50 % advierte el riesgo del grupo', /podría perder hasta \$\d+/.test(await previa()))
  await page.locator('#cobertura').fill('100')
  // M1: rondas de semanas y meses, con un máximo de 3 meses por turno (igual que el contrato).
  const unidades = await page.locator('select[aria-label="Unidad de tiempo"] option').allInnerTexts()
  check('Crear (avanzado): ofrece semanas y meses', unidades.includes('semanas') && unidades.includes('meses'), JSON.stringify(unidades))
  await page.locator('select[aria-label="Unidad de tiempo"]').selectOption('meses')
  await page.locator('#periodo').fill('4')
  check('Crear (avanzado): un turno de 4 meses se rechaza (máximo 3 meses)', /hasta 3 meses/.test(await texto(page)) && (await page.locator('button[type=submit]').isDisabled()))
  await page.locator('#periodo').fill('3')
  check('Crear (avanzado): 3 meses sí se aceptan y dice "1 mes = 30 días"', /1 mes = 30 días/.test(await texto(page)) && !(await page.locator('button[type=submit]').isDisabled()))
  check('Crear (avanzado): otra duración quita la frecuencia elegida', (await page.locator('.frecuencias [aria-pressed="true"]').count()) === 0)
  await page.getByRole('button', { name: 'Familia, mensual' }).click()
  p = await previa()
  check('Plantilla "Familia, mensual": 6 personas, $50 cada mes, dura 6 meses', /^Cada mes, 6 personas ponen \$50/m.test(p) && /dura 6 meses/.test(p), p.slice(0, 400))
  check('Plantilla "Familia, mensual": 6 turnos en la tabla de depósitos', (await page.locator('.vista-previa tbody tr').count()) === 6)
  await shot(page, '03b-crear-mensual')
  await page.getByRole('button', { name: 'Prueba rápida (1 minuto)' }).click()
  p = await previa()
  check('Plantilla "Prueba rápida": 3 personas, $100, turnos de 1 minuto', (await page.locator('#cuota').inputValue()) === '100' && /3 personas ponen \$100/.test(p) && /dura 3 min/.test(p), p.slice(0, 300))
  check('Plantilla "Prueba rápida": abre las opciones avanzadas con 1 minuto', (await page.locator('details.avanzadas').evaluate((d) => d.open)) && (await page.locator('select[aria-label="Unidad de tiempo"]').inputValue()) === 'minutos')
  check('Crear: botón "Crear la tanda y unirme" habilitado', !(await page.locator('button[type=submit]').isDisabled()) && /Crear la tanda y unirme/.test(await page.locator('button[type=submit]').innerText()))
  await shot(page, '03-crear-prueba')
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
  check('Tanda 3: muestra el botón de unirse con la garantía', /Unirme y dejar \$100 de depósito/.test(t))
  check('Tanda 3: aparece "Invita a tu grupo" con el link correcto', /Invita a tu grupo/.test(t) && (await page.locator('.link-fila input').inputValue()).endsWith('#/tanda/3'))
  check('Tanda 3: link de WhatsApp presente', (await page.locator('a.whatsapp').getAttribute('href'))?.startsWith('https://wa.me/?text='))
  check('Tanda 3: el creador ve "Cancelar esta tanda"', await page.getByRole('button', { name: 'Cancelar esta tanda' }).isVisible())
  await page.getByRole('button', { name: 'Cancelar esta tanda' }).click()
  const t2 = await texto(page)
  check('Tanda 3: pide confirmación antes de cancelar', /¿Cancelar esta tanda\?/.test(t2) && /la persona que ya se unió/.test(t2) && (await page.getByRole('button', { name: 'Sí, cancelar la tanda' }).isVisible()))
  await page.waitForSelector('.rendimiento dl', { timeout: 15000 }).catch(() => {})
  const rend = (await page.locator('.rendimiento').innerText()).replace(/\u00a0/g, ' ')
  // 200 TUSD de garantía en la bóveda; la bóveda simulada vale 103 % -> +6 TUSD (3 % de 200)
  check('Tanda 3: rendimiento en vivo leído de la bóveda (+$6, 3 %)', /\+\$6/.test(rend) && /3 %/.test(rend), rend)
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
  check('Tanda 2: "Ronda 2 de 3"', /Turno 2 de 3/.test(t))
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
  check('Tanda 1: Ana recibió 0 y "su garantía cubrió sus cuotas"', /Ana/.test(filas[0] ?? '') && /Su depósito cubrió sus cuotas/.test(filas[0] ?? ''), filas[0])
  check('Tanda 1: Beto recibió 94,5', /94,5/.test(filas[1] ?? ''), filas[1])
  check('Tanda 1: Carla recibió 114', /114/.test(filas[2] ?? ''), filas[2])
  check('Tanda 1: muestra el rendimiento generado +8,5', /\+\$8,50/.test(t), t.slice(-500))
  check('Tanda 1: no muestra rendimiento en vivo (ya terminó)', !/Intereses de los depósitos/.test(t))
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
  check('Deuda: "Tienes una deuda de $100"', /Tienes una deuda de \$100/.test(panel), panel.slice(0, 300))
  check('Deuda: dice a quién le llega (Beto, ronda 2)', /Beto/.test(panel) && /turno 2/.test(panel), panel)
  check('Deuda: dice qué recupera (cobra en la ronda 4)', /Cobras tu pozo en el turno 4/.test(panel), panel)
  const boton = page.getByRole('button', { name: 'Pagar mi deuda ($100)' })
  check('Deuda: botón "Pagar mi deuda ($100)" habilitado', (await boton.count()) === 1 && !(await boton.isDisabled()))
  check('Deuda: ya no ofrece "Pagar mi cuota" (está en mora)', !/Pagar mi cuota/.test(t))
  await page.locator('summary', { hasText: 'Pagar solo una parte' }).click()
  await page.locator('#monto-deuda').fill('150')
  check('Deuda: pagar más de lo que se debe se rechaza antes de firmar', /más de lo que debes/.test(await page.locator('.pagar-deuda').innerText()) && (await page.getByRole('button', { name: 'Pagar este monto' }).isDisabled()))
  await page.locator('#monto-deuda').fill('40')
  check('Deuda: un pago parcial válido habilita "Pagar $40"', !(await page.getByRole('button', { name: 'Pagar $40' }).isDisabled()))
  const lista = (await page.locator('.miembros').first().innerText()).replace(/\u00a0/g, ' ')
  check('Lista: "Debe $100" para quien está en mora', /Debe \$100/.test(lista), lista.slice(0, 400))
  check('Lista: "se puso al día" para Carla', /se puso al día/i.test(lista), lista.slice(0, 400))
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
  check('Calendario .ics: en mi ronda dice que cobro mi bolsa, con el enlace a la tanda', /SUMMARY:Tanda 6: pagas tu cuota y cobras tu pozo \(turno 4 de 4\)/.test(ics) && /#\/tanda\/6/.test(ics), ics.slice(0, 1500))
  await page.waitForSelector('.historia-item', { timeout: 15000 }).catch(() => {})
  const hist = (await page.locator('.historia-seccion').innerText()).replace(/\u00a0/g, ' ')
  check('Historia: "Carla pagó \$50 y se puso al día"', /Carla pagó \$50 y se puso al día/.test(hist), hist.slice(0, 500))
  check('Historia: "Beto recibió los $50 que le faltaban" (momento clave)', /Beto recibió los \$50 que le faltaban/.test(hist) && (await page.locator('.historia-item.clave').count()) >= 2)
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

// ---------------------------------------------------------------- 5e. M1 v4: todos pagaron, se cierra antes (y en la subasta no)
{
  const est = conTodosPagaron(nuevoEstado())
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/6')
  await page.waitForSelector('.panel .acciones button', { timeout: 15000 }).catch(() => {})
  const panel = (await page.locator('.panel-ronda').innerText()).replace(/\u00a0/g, ' ')
  const boton = page.getByRole('button', { name: 'Todos pagaron: cobra tu pozo ya' })
  check('Cerrar antes: a quien cobra le ofrece "Todos pagaron: cobra tu bolsa ya"', (await boton.count()) === 1 && !(await boton.isDisabled()), panel.slice(0, 500))
  check('Cerrar antes: explica que las fechas no cambian y cuándo vence la próxima', /Las fechas no cambian: el próximo turno ya se puede pagar y vence el \S+ \d+ de \S+/.test(panel), panel)
  check('Cerrar antes: no dice "Venció hace" (la ronda no ha vencido)', !/Venció hace/.test(panel))
  await page.waitForSelector('.historia-item', { timeout: 15000 }).catch(() => {})
  const hist = (await page.locator('.historia-seccion').innerText()).replace(/\u00a0/g, ' ')
  check('Historia: "Todos pagaron: la ronda 1 se cerró antes"', /Todos pagaron: el pozo del turno 1 se entregó antes/.test(hist), hist.slice(0, 400))
  await shot(page, '06e-cerrar-antes')
  check('Cerrar antes: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = conTodosPagaron(nuevoEstado())
  const { page, errores } = await nuevaPagina(browser, { est, direccion: CARLA, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '#/tanda/6')
  await page.waitForSelector('.panel .acciones button', { timeout: 15000 }).catch(() => {})
  const panel = (await page.locator('.panel-ronda').innerText()).replace(/\u00a0/g, ' ')
  check('Cerrar antes: cualquiera puede ("Todos pagaron: cerrar ya y pagarle a …")', /Todos pagaron: entregarle el pozo a/.test(panel) && /cualquier persona del grupo puede hacerlo/.test(panel), panel.slice(0, 500))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check('Móvil (390px): cerrar antes no se desborda', !overflow)
  await shot(page, '06e-cerrar-antes-390')
  check('Cerrar antes (otra persona): sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = conTodosPagaron(nuevoEstado(), { subasta: true })
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/6')
  await page.waitForSelector('.panel .acciones', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
  const panel = (await page.locator('.panel-ronda').innerText()).replace(/\u00a0/g, ' ')
  check('Subasta: aunque todos pagaron, no ofrece cerrar antes', !/Todos pagaron: c/.test(panel) && !/Pasar al siguiente turno|Entregarle el pozo/.test(panel), panel.slice(0, 500))
  check('Subasta: explica que se entrega al terminar el plazo', /En la subasta el pozo se entrega cuando termina el plazo/.test(panel), panel.slice(0, 600))
  check('Subasta (todos pagaron): sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 5f. M1 v4: pagar la deuda con la tanda ya terminada
{
  const est = conDeudaTerminada(nuevoEstado())
  const { page, errores } = await nuevaPagina(browser, { est, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '#/tanda/6')
  await page.waitForSelector('.pagar-deuda', { timeout: 15000 }).catch(() => {})
  const panel = (await page.locator('.pagar-deuda').innerText().catch(() => '')).replace(/\u00a0/g, ' ')
  check('Deuda tras terminar: "Tienes una deuda de $150"', /Tienes una deuda de \$150/.test(panel), panel.slice(0, 300))
  check('Deuda tras terminar: explica que la tanda terminó y que bloquea unirse a otras', /La tanda ya terminó/.test(panel) && /no puedes unirte a otras tandas/.test(panel), panel)
  check('Deuda tras terminar: a Beto directo y su propia bolsa al reparto', /Beto/.test(panel) && /Tu propio pozo: se repartió al final/.test(panel), panel)
  check('Deuda tras terminar: no promete recuperar la bolsa', !/Recuperas tu pozo/.test(panel), panel)
  const boton = page.getByRole('button', { name: 'Pagar mi deuda ($150)' })
  check('Deuda tras terminar: botón "Pagar mi deuda ($150)" habilitado', (await boton.count()) === 1 && !(await boton.isDisabled()))
  await page.waitForSelector('.historia-item', { timeout: 15000 }).catch(() => {})
  const hist = (await page.locator('.historia-seccion').innerText()).replace(/\u00a0/g, ' ')
  check('Historia: "Beto recibió los $20 que le faltaban" (con la tanda ya terminada)', /Beto recibió los \$20 que le faltaban/.test(hist) && /con la tanda ya terminada/.test(hist), hist.slice(0, 500))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check('Móvil (390px): deuda tras terminar no se desborda', !overflow)
  await shot(page, '06f-deuda-terminada-390')
  check('Deuda tras terminar: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- 5d. M1: "Tu bolsa está lista: cóbrala" (cerrador, opción C)
{
  const est = conMiBolsaLista(nuevoEstado())
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
  await page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
  const tarjeta = page.locator('.tarjeta', { hasText: 'Tanda 6' })
  check('Cobrar: en el lobby, la tarjeta de mi tanda dice "Tu bolsa está lista: cóbrala"', (await tarjeta.locator('.tarjeta-cobro').count()) === 1)
  check('Cobrar: ninguna otra tarjeta lo dice', (await page.locator('.tarjeta-cobro').count()) === 1)
  await page.goto(BASE + '#/tanda/6')
  const boton = page.getByRole('button', { name: 'Tu pozo está listo: cóbralo' })
  await boton.waitFor({ timeout: 15000 }).catch(() => {})
  check('Cobrar: en la tanda, botón principal "Tu bolsa está lista: cóbrala" habilitado', (await boton.count()) === 1 && !(await boton.isDisabled()) && /principal/.test((await boton.getAttribute('class')) ?? ''))
  const t = (await texto(page)).replace(/\u00a0/g, ' ')
  check('Cobrar: avisa que el depósito de Beto no alcanza para sus cuotas, no se usa, y la bolsa sale con $100 menos (v5)', /El depósito de Beto no alcanza para todas las cuotas que le quedan y no se usa ahora: el pozo sale con \$100 menos, que te queda debiendo\. Puede pagarlo después; si no, al terminar la tanda su depósito se reparte entre quienes cobraron de menos/.test(t), t.slice(0, 1500))
  check('Cobrar: ya no dice "Cerrar la ronda y pagarle a"', !/Entregarle el pozo a/.test(t))
  await shot(page, '06d-cobrar-bolsa')
  check('Cobrar: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Otra persona (Ana) ve la misma ronda: cualquiera puede cerrarla, pero no es "su" bolsa.
  const est = conMiBolsaLista(nuevoEstado())
  const { page } = await nuevaPagina(browser, { est, direccion: ANA, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '#/tanda/6')
  await page.waitForSelector('text=El turno terminó y cualquier persona del grupo puede hacer este paso', { timeout: 15000 }).catch(() => {})
  const t = (await texto(page)).replace(/\u00a0/g, ' ')
  check('Cobrar (otra persona): botón "Cerrar la ronda y pagarle a …" y no "cóbrala"', /Entregarle el pozo a/.test(t) && !/Tu pozo está listo/.test(t), t.slice(0, 1200))
  check('Cobrar (otra persona): la diferencia se le queda debiendo a quien cobra', /que le queda debiendo a /.test(t))
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
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

// ---------------------------------------------------------------- 7. Onboarding de cuenta nueva (UX: un solo botón)
{
  const est = nuevoEstado()
  const NUEVA = ME
  est.cuentas = {} // la cuenta no existe todavía
  const { page, errores } = await nuevaPagina(browser, { est, direccion: NUEVA })
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
  await page.waitForSelector('.barra-cuenta')
  const barra = async () => (await page.locator('.barra-cuenta').innerText()).replace(/[\u00a0\u202f]/g, ' ')
  check('Cuenta nueva: ofrece preparar la cuenta de práctica', /Prepara tu cuenta de práctica/.test(await barra()))
  check('Cuenta nueva: un solo botón, sin Friendbot ni TUSD', (await page.getByRole('button', { name: 'Preparar mi cuenta' }).count()) === 1 && !/Friendbot|TUSD|XLM/.test(await barra()))
  await shot(page, '07-cuenta-nueva')
  await page.getByRole('button', { name: 'Preparar mi cuenta' }).click()
  // El mismo botón crea la cuenta y pide la única confirmación (activar los dólares de práctica). La firma real
  // con Freighter no se puede simular aquí: el paso 2 falla y queda "Intentar de nuevo", con la cuenta ya creada.
  await page.getByRole('button', { name: 'Intentar de nuevo' }).waitFor({ timeout: 15000 }).catch(() => {})
  check('Preparar: crea la cuenta y sigue solo con el paso 2 (la confirmación)', est.cuentas[NUEVA]?.existe === true && (await page.getByRole('button', { name: 'Intentar de nuevo' }).count()) === 1)
  est.cuentas[NUEVA].trustline = true // (como si la persona hubiera confirmado en Freighter)
  await page.waitForSelector('text=Tienes:', { timeout: 15000 })
  check('Cuenta lista sin saldo: muestra $0', /Tienes:\s*\$0/.test(await barra()))
  const recibir = page.getByRole('button', { name: 'Recibir dólares de práctica' })
  check('Cuenta lista sin saldo: "Recibir dólares de práctica" es el botón principal', /principal/.test((await recibir.getAttribute('class')) ?? ''))
  await recibir.click()
  await page.waitForSelector('text=Listo: recibiste dólares de práctica.')
  await page.waitForFunction(() => /Tienes:\s*\$1.?000/.test(document.body.innerText.replace(/[\u00a0\u202f]/g, ' ')), null, { timeout: 15000 })
  check('Recibir: el saldo sube a $1 000', true)
  check('Con saldo: "Recibir más dólares de práctica" pasa a ser chico', (await page.getByRole('button', { name: 'Recibir más dólares de práctica' }).count()) === 1)
  await shot(page, '08-cuenta-lista')
  check('Onboarding: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- UX: entrar por invitación
{
  // Llego por el enlace de la tanda 5 (la creó Beto) y todavía no estoy en ella.
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, viewport: { width: 375, height: 800 } })
  await page.goto(BASE + '#/tanda/5')
  await page.waitForSelector('.invitacion', { timeout: 15000 }).catch(() => {})
  const inv = ((await page.locator('.invitacion').innerText().catch(() => '')) ?? '').replace(/[\u00a0\u202f]/g, ' ')
  check('Invitación: "Beto te invita a una tanda"', /Beto te invita a una tanda/.test(inv), inv)
  check('Invitación: "5 personas · $50 por semana"', /5 personas · \$50 por semana/.test(inv), inv)
  check('Invitación: cuánto recibe cada turno y cuánto dejo de depósito', /Cada semana una persona recibe \$250\./.test(inv) && /Dejas \$\d+ de depósito de seguridad y lo recuperas al final/.test(inv), inv)
  check('Invitación: el botón para unirme está en la misma tarjeta', (await page.locator('.panel-ronda').getByRole('button', { name: /Unirme y dejar/ }).count()) === 1)
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  check('Invitación (375 px): sin desborde horizontal', !desborde)
  await shot(page, 'ux-invitacion-375')
  check('Invitación: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // La misma invitación sin haber entrado todavía.
  const est = nuevoEstado()
  const { page } = await nuevaPagina(browser, { est, conectado: false, viewport: { width: 375, height: 800 } })
  await page.goto(BASE + '#/tanda/5')
  await page.waitForSelector('.invitacion', { timeout: 15000 }).catch(() => {})
  const panel = await page.locator('.panel-ronda').innerText().catch(() => '')
  check('Invitación sin cuenta: la ve igual y el botón para entrar está ahí mismo', /Beto te invita a una tanda/.test(panel) && /Instalar Freighter|Conectar billetera Stellar|Entrar con Google/.test(panel), panel.slice(0, 400))
  await shot(page, 'ux-invitacion-sin-cuenta-375')
  await page.close()
}
{
  // Quien creó la tanda no se ve invitado a sí mismo.
  const est = nuevoEstado()
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/3')
  await page.waitForSelector('.panel', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
  check('Invitación: no aparece para quien creó la tanda', (await page.locator('.invitacion').count()) === 0)
  await page.close()
}

// ---------------------------------------------------------------- 8. Saldo insuficiente bloquea el botón
{
  const est = nuevoEstado()
  est.cuentas[ME].saldo = 50n * 10_000_000n
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/3')
  await page.waitForSelector('.rueda svg')
  await page.waitForSelector('text=Tienes:')
  await page.waitForSelector('.panel .aviso.nota', { timeout: 15000 }).catch(() => {})
  check('Saldo insuficiente: el botón de unirse queda deshabilitado', await page.getByRole('button', { name: /Unirme y dejar/ }).isDisabled())
  check('Saldo insuficiente: explica cuánto falta ($50)', /Te faltan \$50/.test(await texto(page)))
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.vista-previa .resumen-frase')
  check('Crear con saldo bajo: avisa que faltan $30 para unirse como primera', /te faltan \$30/.test((await texto(page)).replace(/ /g, ' ')))
  await page.close()
}

// ---------------------------------------------------------------- 9. Sin billetera instalada + móvil
{
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, conectado: false, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
  await page.waitForSelector('.tarjeta', { timeout: 15000 })
  await page.waitForSelector('text=Instalar Freighter', { timeout: 8000 }).catch(() => {})
  check('Sin Freighter: ofrece instalar', /Instalar Freighter/.test(await texto(page)))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  check('Móvil (390px): el lobby no se desborda horizontalmente', !overflow)
  await shot(page, '09-movil-lobby')
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.vista-previa .resumen-frase')
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
  await verTodas(page)
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
  await verTodas(page)
  await page.waitForSelector('.tarjeta', { timeout: 15000 })
  await page.waitForSelector('text=Tienes:', { timeout: 15000 })
  check('Guía: desaparece cuando la cuenta ya está lista', (await page.locator('.como-probar').count()) === 0)
  await page.close()
}
{
  const est = nuevoEstado()
  est.cuentas = {} // cuenta nueva: la guía sigue y marca "conectada"
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
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
  check('Demo automática: elige la tanda en curso (2) aunque haya otras más nuevas', /Tanda 2/.test(t) && /Turno 2 de 3/.test(t))
  check('Demo: muestra el reloj grande', /\d:\d\d/.test(await page.locator('.demo-reloj').innerText()))
  check('Demo: una tarjeta por persona', (await page.locator('.demo-persona').count()) === 3)
  check('Demo: marca a Beto como "cobra ahora"', /cobra ahora/.test(await page.locator('.demo-persona.turno').innerText()) && /Beto/.test(await page.locator('.demo-persona.turno').innerText()))
  check('Demo: muestra la barra de garantía', (await page.locator('.demo-garantia-barra').count()) === 3)
  check('Demo: la línea de tiempo cuenta "Ana cobró $300"', /Ana cobró \$300/.test(t))
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
  check('Demo fija: cuenta "Ana no pagó: su garantía cubrió $100"', /Ana no pagó: su depósito cubrió \$100/.test(t))
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
  check('Tanda 3: sección "Qué ha pasado" con la creación y la unión de Ana', /Qué ha pasado/.test(t) && /Se creó la tanda/.test(t) && /Ana se unió/.test(t) && /Turno 1 · dejó \$200 de depósito/.test(t))
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
  check('Estado: 10 puntos revisados (8 de red + 2 de Freighter)', (await page.locator('.chequeo').count()) === 10, `n=${await page.locator('.chequeo').count()}`)
  check('Estado (M3): la web y el contrato desplegado coinciden', /Coinciden: el contrato tiene las \d+ funciones y tipos que usa esta web/.test(t), t.slice(0, 900))
  // M1: las dos bóvedas, con lo libre para intereses (no el saldo bruto, que incluye las garantías).
  check('M1 estado: la principal rinde al ritmo real y dice lo libre y para cuánto alcanza', /Rinde al ritmo de la vida real \(5 % al año\)\. Tiene 3[\s.\u00a0\u202f]?99\d(,\d\d)? TUSD libres para pagar intereses: con las garantías de hoy alcanzan para más de 10 años/.test(t), t.slice(0, 900))
  check('M1 estado: la rápida dice su acelerador y cuánto rinde hoy una demo de 5 minutos', /1 minuto equivale a 36,5 días de intereses\. Una demo de 5 minutos rinde hoy ~2,3\d TUSD por cada 100\. Tiene 9[\s.\u00a0\u202f]?3[67]\d(,\d\d)? TUSD libres/.test(t), t.slice(0, 900))
  check('Estado (M4): muestra la liquidez libre de Blend', /Blend tiene 28[\s.\u00a0\u202f]?453(,\d+)? USDC libres para retirar \(78 % prestado\)/.test(t), t.slice(0, 900))
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
  await verTodas(page)
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
  await verTodas(page)
  await page.waitForTimeout(800)
  const marca = page.locator('a.marca')
  check('Header: la marca Rounda lleva a la landing', (await marca.getAttribute('href')) === '#/' && /Rounda/.test(await marca.innerText()))
  await marca.click()
  await page.waitForSelector('.ln', { timeout: 5000 }).catch(() => {})
  check('Header: click en la marca abre la landing', (await page.locator('.ln').count()) === 1)
  await page.close()
}
{
  // Modo claro u oscuro: arranca como el sistema, el botón de la barra lo cambia y se recuerda; ?modo= manda
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  const modo = () => page.evaluate(() => document.documentElement.dataset.modo)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(BASE + '#/')
  await page.waitForSelector('.ln', { timeout: 15000 }).catch(() => {})
  check('Modo: sin elegir, sigue al sistema (oscuro)', (await modo()) === 'oscuro')
  const enPortada = page.locator('.ln .boton-modo')
  check('Modo: la barra de la portada tiene el botón', (await enPortada.count()) === 1 && (await enPortada.getAttribute('aria-pressed')) === 'true')
  await enPortada.click()
  check('Modo: el botón de la portada pasa a claro', (await modo()) === 'claro')
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
  await page.reload()
  await page.waitForSelector('.barra .boton-modo', { timeout: 15000 }).catch(() => {})
  check('Modo: al recargar se recuerda lo elegido aunque el sistema esté en oscuro', (await modo()) === 'claro')
  await page.locator('.barra .boton-modo').click()
  check('Modo: el botón de la barra de la app pasa a oscuro', (await modo()) === 'oscuro' && (await page.locator('.barra .boton-modo').getAttribute('aria-pressed')) === 'true')
  await page.goto(BASE.replace(/\/?$/, '/') + '?modo=claro#/tandas')
  await page.waitForSelector('.barra', { timeout: 15000 }).catch(() => {})
  check('Modo: ?modo= en la URL manda sobre lo elegido', (await modo()) === 'claro')
  await page.goto(BASE + '#/demo')
  await page.waitForTimeout(800)
  check('Modo: la demo (siempre oscura) no muestra el botón', (await page.locator('.boton-modo').count()) === 0)
  check('Modo: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Buscadores y redes (docs/seo.md): metadatos de la portada, robots.txt, sitemap e imagen para compartir
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, conectado: false })
  await page.goto(BASE + '#/')
  await page.waitForSelector('.ln', { timeout: 15000 }).catch(() => {})
  const meta = await page.evaluate(() => {
    const atributo = (sel, attr = 'content') => document.querySelector(sel)?.getAttribute(attr) ?? ''
    let ld = null
    try {
      ld = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent ?? '')
    } catch {
      ld = null
    }
    return {
      lang: document.documentElement.lang,
      titulo: document.title,
      descripcion: atributo('meta[name="description"]'),
      canonical: atributo('link[rel="canonical"]', 'href'),
      ogUrl: atributo('meta[property="og:url"]'),
      ogImagen: atributo('meta[property="og:image"]'),
      ogAncho: atributo('meta[property="og:image:width"]'),
      ogAlto: atributo('meta[property="og:image:height"]'),
      tarjeta: atributo('meta[name="twitter:card"]'),
      ld,
      head: document.head.innerHTML,
    }
  })
  check('Buscadores: idioma español y título con tanda, ahorro, Costa Rica y Stellar', meta.lang === 'es' && /tanda/i.test(meta.titulo) && /ahorro/.test(meta.titulo) && /Costa Rica/.test(meta.titulo) && /Stellar/.test(meta.titulo), meta.titulo)
  check('Buscadores: descripción de 160 caracteres o menos que habla de tandas', meta.descripcion.length > 50 && meta.descripcion.length <= 160 && /Tandas de ahorro/.test(meta.descripcion), `${meta.descripcion.length}`)
  check('Buscadores: canonical y og:url en https://rounda.net/', meta.canonical === 'https://rounda.net/' && meta.ogUrl === 'https://rounda.net/', `${meta.canonical} ${meta.ogUrl}`)
  check('Buscadores: ninguna URL apunta a rounda-phi.vercel.app', !/rounda-phi/.test(meta.head))
  check('Buscadores: imagen para redes de 1200×630 y tarjeta grande', meta.ogImagen === 'https://rounda.net/og.jpg' && meta.ogAncho === '1200' && meta.ogAlto === '630' && meta.tarjeta === 'summary_large_image')
  check('Buscadores: JSON-LD de WebApplication en rounda.net', meta.ld?.['@type'] === 'WebApplication' && meta.ld?.url === 'https://rounda.net/' && meta.ld?.inLanguage === 'es-CR', JSON.stringify(meta.ld)?.slice(0, 120))
  const imagen = await page.evaluate(
    (ruta) =>
      new Promise((listo) => {
        const img = new Image()
        img.onload = () => listo({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => listo(null)
        img.src = ruta
      }),
    new URL(meta.ogImagen).pathname,
  )
  check('Buscadores: la imagen para redes existe en el sitio y mide 1200×630', imagen?.w === 1200 && imagen?.h === 630, JSON.stringify(imagen))
  const raiz = BASE.replace(/[#?].*$/, '').replace(/\/?$/, '/')
  const robots = await page.request.get(raiz + 'robots.txt')
  const textoRobots = await robots.text()
  // La compilación de las pruebas no es producción (VERCEL_ENV vacío): no se deja indexar
  check('Buscadores: robots.txt fuera de producción dice Disallow: /', robots.ok() && /User-agent: \*/.test(textoRobots) && /Disallow: \//.test(textoRobots), textoRobots)
  const sitemap = await page.request.get(raiz + 'sitemap.xml')
  const textoSitemap = await sitemap.text()
  check('Buscadores: sitemap.xml con la portada de rounda.net', sitemap.ok() && /<loc>https:\/\/rounda\.net\/<\/loc>/.test(textoSitemap) && !/<loc>[^<]*#/.test(textoSitemap), textoSitemap.slice(0, 200))
  check('Buscadores: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- M3. Mecanismos de turnos
{
  const est = nuevoEstadoTurnos()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/crear')
  await crearDePrueba(page)
  await page.waitForSelector('.modos')
  check('Turnos/crear: cinco formas de repartir los turnos', (await page.locator('.modo').count()) === 5)
  check('Turnos/crear: por defecto, orden de llegada (sin tabla de turnos)', (await page.locator('.turnos-previa').count()) === 0)
  await page.locator('.modo', { hasText: 'Sorteo' }).click()
  let filas = await page.locator('.turnos-previa tbody tr').allInnerTexts()
  check(
    'Turnos/crear: sorteo -> todos dejan 100; al primero se le apartan 100 y recibe 200',
    filas.length === 3 && /^1\s+\$100\s+\$100\s+\$200$/.test(filas[0].trim()) && /300$/.test(filas[2].trim()),
    JSON.stringify(filas),
  )
  check('Turnos/crear: sorteo avisa que un validador podría influir', /un validador de la red podría influir/.test(await texto(page)))
  await page.locator('.modo', { hasText: 'Precio por turno' }).click()
  filas = await page.locator('.turnos-previa tbody tr').allInnerTexts()
  check(
    'Turnos/crear: precio por turno 10 % -> el turno 1 paga 30 y el 3 gana 30',
    /paga \$30/.test(filas[0] ?? '') && /270$/.test((filas[0] ?? '').trim()) && /gana \$30/.test(filas[2] ?? '') && /330$/.test((filas[2] ?? '').trim()),
    JSON.stringify(filas),
  )
  await page.locator('.modo', { hasText: 'Subasta' }).click()
  check('Turnos/crear: en la subasta no se ofrece intercambiar', !/Permitir intercambiar turnos/.test(await texto(page)))
  check('Turnos/crear: muestra el descuento máximo (30 %)', /Descuento máximo por turno:\s*30 %/.test(await texto(page)))
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
  check('Turnos/sorteo abierta: unirse pide una cuota', /Unirme y dejar \$100 de depósito/.test(t))
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
  check('Turnos/precio: el turno 1 muestra su precio', /Depósito \$200/.test(await casillas.nth(0).innerText()) && /Paga \$24/.test(await casillas.nth(0).innerText()))
  check('Turnos/precio: no muestra el botón de unirse sin elegir turno', (await page.getByRole('button', { name: /^Unirme y dejar/ }).count()) === 0)
  await casillas.nth(0).click()
  await page.waitForSelector('text=Unirme en el turno 1 y dejar $200', { timeout: 15000 }).catch(() => {})
  const t = await texto(page)
  check('Turnos/precio: al elegir el turno 1 explica que recibe 276 (paga 24)', /recibes \$276 \(el pozo menos \$24 por cobrar antes\)/.test(t), t.slice(0, 900))
  check('Turnos/precio: botón "Unirme en el turno 1 y dejar $200"', await page.getByRole('button', { name: 'Unirme en el turno 1 y dejar $200' }).isEnabled())
  await casillas.nth(2).click()
  await page.waitForSelector('text=Unirme en el turno 3 y dejar $100', { timeout: 15000 }).catch(() => {})
  check('Turnos/precio: el turno 3 gana 24 por esperar', /recibes \$324 \(el pozo más \$24 por esperar\)/.test(await texto(page)))
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
  check('Turnos/subasta: mejor oferta de Beto, 5 % ($15)', /Beto: 5 % menos \(\$15\)/.test(t), t.slice(0, 800))
  check('Turnos/subasta: "Le toca cobrar: Se decide en la subasta"', /Se decide en la subasta/.test(t))
  check('Turnos/subasta: dice quién cobra si nadie ofrece más', /Si nadie ofrece más, Beto cobra este turno/.test(t))
  await page.locator('#oferta').fill('4')
  check('Turnos/subasta: una oferta menor a la mejor no se puede enviar', await page.getByRole('button', { name: 'Ofertar' }).isDisabled())
  await page.locator('#oferta').fill('8')
  t = await texto(page)
  check('Turnos/subasta: 8 % -> recibes 276 y se aparta garantía', /Si ganas recibes \$276; de ahí se apartan hasta \$100/.test(t), t.slice(0, 1200))
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
  check('Turnos/intercambio: propuesta recibida de Carla con $10', /Carla te propone cambiar su turno 3 por tu turno 2 · te paga \$10/.test(t), t.slice(0, 900))
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
  await verTodas(page)
  await page.waitForSelector('.tarjeta', { timeout: 15000 })
  await page.waitForFunction(() => document.querySelectorAll('.tarjeta').length === 10, null, { timeout: 15000 }).catch(() => {})
  const tarjeta = async (n) => page.locator('.tarjeta', { has: page.locator('h2', { hasText: new RegExp(`^Tanda ${n}$`) }) }).innerText()
  check('Turnos/lobby: sorteo abierta entra con una cuota', /Entras con \$100 de depósito \(el orden se sortea\)/.test(await tarjeta(7)) && /Turnos: sorteo/.test(await tarjeta(7)))
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
    await crearDePrueba(page)
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
  check('Historial + turnos: la nota del historial también sale donde se elige turno', /pide una reputación Bronce o mejor/.test(t) && /Tienes 110: puedes entrar/.test(t), t.slice(0, 900))
  await page.locator('.turno-casilla').nth(0).click()
  await page.getByRole('button', { name: /^Unirme en el turno 1 y dejar \$180$/ }).waitFor({ timeout: 15000 }).catch(() => {})
  t = await texto(page)
  check('Historial + turnos: el turno 1 cotiza la garantía con descuento (200 -> 180)', /dejas \$180 de depósito \(con el descuento de tu historial\)/.test(t), t.slice(0, 900))
  check('Historial + turnos: el botón usa la garantía con descuento', await page.getByRole('button', { name: 'Unirme en el turno 1 y dejar $180' }).isEnabled())
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
  await crearDePrueba(page)
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
  await crearDePrueba(page)
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
  check('Primeros con historial: con Bronce (tengo 110) me uno en el turno 1', /Tú dejas \$200 de depósito de seguridad[^]*Cobras en el turno 1\./.test(t))
  await page.locator('#primeros-nivel').selectOption('300')
  await page.getByText(/Cobras en el turno 3/).waitFor({ timeout: 15000 }).catch(() => {})
  const t2 = await texto(page)
  check('Primeros con historial: se puede pedir Plata', /historial Plata o mejor/.test(t2))
  check('Primeros con historial: con Plata (tengo 110) me uno en el primer turno abierto: el 3', /Tú dejas \$100 de depósito de seguridad[^]*Cobras en el turno 3\./.test(t2), t2.slice(0, 1200))
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
  await crearDePrueba(page)
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
  await crearDePrueba(page)
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
  check('Historial: dice el descuento y lo que falta para Oro', /25 % menos de depósito/.test(t) && /Faltan 270 puntos para Oro/.test(t))
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
  check('Historial: buscar lleva al de Carla (mora saldada, puntaje 0, Nuevo)', /0 puntos/.test(tc) && /1 vez con un pago pendiente/.test(tc) && /1 deuda saldada/.test(tc) && !/deuda sin saldar/.test(tc), tc.slice(0, 400))
  check('Historial: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Mi historial (menú) y una dirección sin historial
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/historial') // (v4: el menú dice "Perfil"; #/historial sigue siendo el mío)
  await page.waitForSelector('.historial-cabeza', { timeout: 15000 }).catch(() => {})
  const t = await texto(page)
  check('Mi historial (#/historial): con 110 puntos (Bronce)', /Tu historial/.test(t) && /110 puntos/.test(t) && /Bronce/.test(t), t.slice(0, 300))
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
  check('Unirse: dice que la tanda pide Bronce y que sí puedo entrar', /pide una reputación Bronce o mejor/.test(t) && /Tienes 110: puedes entrar/.test(t), t.slice(0, 600))
  check('Unirse: la garantía baja de 500 a 450 por mi historial', /tu depósito baja de \$500 a \$450/.test(t))
  check('Unirse: el botón usa la garantía con descuento', (await page.getByRole('button', { name: /Unirme y dejar \$450/ }).count()) === 1)
  await shot(page, 'm2-02-unirse-con-descuento')
  check('Unirse con descuento: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()

  const est2 = conTandaExigente(nuevoEstado())
  est2.historiales[ME] = historial({ cuotas_a_tiempo: 5, puntos_positivos: 50 })
  const p2 = await nuevaPagina(browser, { est: est2 })
  await p2.page.goto(BASE + '#/tanda/7')
  await p2.page.waitForFunction(() => /Tienes 50/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
  const t2 = (await texto(p2.page)).replace(/ /g, ' ')
  check('Unirse: con 50 puntos avisa que todavía no puede entrar', /Tienes 50: todavía no puedes unirte/.test(t2) && /depósito por buena reputación/.test(t2), t2.slice(0, 600))
  check('Unirse sin nivel: el botón usa la garantía normal', (await p2.page.getByRole('button', { name: /Unirme y dejar \$500/ }).count()) === 1)
  await p2.page.close()
}
{
  // Crear: opciones de historial
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/crear')
  await crearDePrueba(page)
  await page.waitForSelector('.opciones-historial', { timeout: 15000 }).catch(() => {})
  check('Crear: ofrece las opciones de historial', (await page.locator('.opciones-historial').count()) === 1)
  await page.getByLabel('Pedir un nivel mínimo para unirse').check()
  await page.locator('#nivel-minimo').selectOption('300')
  const t = await texto(page)
  check('Crear: avisa que con nivel Plata yo (110) no podría unirme', /Tu historial tiene 110 puntos/.test(t) && /firma más/.test(t), t.slice(0, 200))
  await page.getByLabel('Dar descuento de depósito por buen historial').check()
  check('Crear: el descuento se puede marcar', await page.getByLabel('Dar descuento de depósito por buen historial').isChecked())
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
  await page.waitForSelector('.lista-personas', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
  check('Sin historial: no hay insignias', (await page.locator('.insignia').count()) === 0)
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.vista-previa .resumen-frase', { timeout: 15000 }).catch(() => {})
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

// ---------------------------------------------------------------- M4: USDC de Blend (rendimiento real)
{
  // La barra de cuenta invita a recibir USDC de prueba de Blend; si el faucet dice que ya los recibió, lo explica.
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
  await page.waitForSelector('.cuenta-usdc', { timeout: 15000 }).catch(() => {})
  let t = await texto(page)
  check('M4: la oferta de USDC de Blend queda plegada (no es parte del camino principal)', (await page.locator('details.cuenta-usdc-mas').count()) === 1 && !(await page.locator('details.cuenta-usdc-mas').evaluate((d) => d.open)))
  await page.locator('details.cuenta-usdc-mas summary').click()
  const tb = await texto(page)
  check('M4: la barra invita a recibir USDC de prueba de Blend', /rendimiento real en Blend/.test(tb) && (await page.getByRole('button', { name: 'Recibir USDC de prueba' }).count()) === 1, tb.slice(0, 400))
  await page.getByRole('button', { name: 'Recibir USDC de prueba' }).click()
  await page.waitForSelector('.cuenta-usdc .aviso.error', { timeout: 15000 }).catch(() => {})
  check('M4: si ya recibió USDC, lo explica', /ya recibió sus dólares de prueba de Blend/.test(await texto(page)))
  check('M4: barra USDC sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Con USDC en la cuenta, la barra muestra el saldo en USDC.
  const est = nuevoEstado()
  est.cuentas[ME].usdc = 500n * 10_000_000n
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
  await page.waitForSelector('.cuenta-usdc', { timeout: 15000 }).catch(() => {})
  check('M4: la barra muestra el saldo en USDC', /En USDC:\s*500 USDC/.test(await texto(page)))
  await page.close()
}
{
  // Tanda en USDC: el rendimiento es real (Blend), con la liquidez a la vista y el enlace a la garantía en Blend.
  const est = conTandaUsdc(nuevoEstado())
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/12')
  await page.waitForSelector('.liquidez-blend', { timeout: 20000 }).catch(() => {})
  const t = await texto(page)
  check('M4: tanda USDC dice que el rendimiento es real (Blend)', /los intereses son reales/.test(t), t.slice(0, 600))
  check('M4: tanda USDC muestra el rendimiento en USDC', /Ganado hasta ahora\s*\+\$0,0000039/.test(t) && /Depósitos guardados\s*\$400/.test(t))
  check('M4: tanda USDC muestra la liquidez libre de Blend', /Blend tiene 28[\s.\u00a0\u202f]?453(,\d+)? USDC libres/.test(t))
  check('M4: enlace a la garantía en Blend (stellar.expert)', (await page.locator(`a[href$="/contract/${ADAPTADOR_USDC}"]`).count()) === 1)
  check('M4: tanda USDC no dice "bóveda simulada"', !/bóveda simulada/.test(t))
  await shot(page, 'm4-01-tanda-usdc')
  check('M4: tanda USDC sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Si Blend está prestado casi por completo, la tanda lo advierte (sin alarmar: el dinero está seguro).
  const est = conTandaUsdc(nuevoEstado())
  est.reservaUsdc = { ...est.reservaUsdc, d_supply: 1_214_280_000_000n } // quedan ~301 USDC libres; la garantía es 400
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/12')
  await page.waitForSelector('.liquidez-blend', { timeout: 20000 }).catch(() => {})
  check('M4: poca liquidez -> avisa que se reintenta y que el dinero está seguro', /no alcanzaría para devolver toda la garantía/.test(await texto(page)) && /Tu dinero está seguro/.test(await texto(page)))
  await page.goto(BASE + '#/estado')
  await page.waitForSelector('.estado-resumen', { timeout: 20000 })
  check('M4: #/estado avisa la poca liquidez de Blend', /poca liquidez libre/.test(await texto(page)))
  await page.close()
}
{
  // Contrato sin bóveda de Blend para USDC (por ejemplo, el de producción de hoy): nada de USDC y #/estado lo explica.
  const est = nuevoEstado()
  est.usdcRegistrado = false
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
  await page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
  check('M4: sin USDC registrado, la barra no ofrece USDC', (await page.locator('.cuenta-usdc').count()) === 0)
  await page.goto(BASE + '#/estado')
  await page.waitForSelector('.estado-resumen', { timeout: 20000 })
  check('M4: sin USDC registrado, #/estado lo explica', /solo se pueden crear tandas en TUSD/.test(await texto(page)))
  check('M4: sin USDC, sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Tanda en USDC: TODA la página habla en USDC (rueda, panel, lista, historia); solo la barra de la cuenta dice TUSD.
  const est = conTandaUsdc(nuevoEstado())
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/12')
  await page.waitForSelector('.historia-item', { timeout: 20000 }).catch(() => {})
  await page.waitForSelector('.liquidez-blend', { timeout: 20000 }).catch(() => {})
  const principal = await page.evaluate(() => {
    const quitar = document.querySelectorAll('.barra-cuenta, footer')
    const copia = document.body.cloneNode(true)
    copia.querySelectorAll('.barra-cuenta, footer').forEach((n) => n.remove())
    return quitar.length >= 0 ? copia.innerText : ''
  })
  check('M4: tanda USDC: la rueda dice "para Beto"', /para Beto/.test(principal), principal.slice(0, 300))
  check('M4: tanda USDC: el panel dice "Bolsa $300"', /Pozo\s*\$300/.test(principal))
  check('M4: tanda USDC: la lista dice "Garantía (USDC)"', /Depósito/.test(principal))
  check('M4: tanda USDC: la historia dice "Ana cobró $300"', /Ana cobró \$300/.test(principal))
  check('M4: tanda USDC: ningún "TUSD" fuera de la barra de la cuenta', !/TUSD/.test(principal), (principal.match(/.{0,40}TUSD.{0,40}/) ?? [''])[0])
  check('M4: tanda USDC (página completa) sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // En el lobby (que muestra las tandas 1..N), la tarjeta de una tanda en USDC habla en USDC.
  const est = conTandaUsdc(nuevoEstado(), 6)
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
  await page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
  const tarjeta = await page.locator('.tarjeta', { hasText: 'Tanda 6' }).innerText({ timeout: 15000 }).catch(() => '')
  check('M4: la tarjeta de la tanda USDC en el lobby dice USDC', /\$300/.test(tarjeta) && /\$100 cada 2 min/.test(tarjeta), tarjeta)
  await page.close()
}
{
  // M1 + M4: "Tu bolsa está lista: cóbrala" en una tanda en USDC: el aviso de la garantía que no alcanza
  // habla en USDC (y nada fuera de la barra de la cuenta dice TUSD).
  const est = conMiBolsaLista(nuevoEstado())
  est.tandas[6].boveda = ADAPTADOR_USDC
  est.tandas[6].tanda.token = USDC_ID
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/6')
  await page.getByRole('button', { name: 'Tu pozo está listo: cóbralo' }).waitFor({ timeout: 15000 }).catch(() => {})
  const principal = await page.evaluate(() => {
    const copia = document.body.cloneNode(true)
    copia.querySelectorAll('.barra-cuenta, footer').forEach((n) => n.remove())
    return copia.innerText.replace(/\u00a0/g, ' ')
  })
  check('M4: cóbrala en USDC: "la bolsa sale con $100 menos" (v5: la garantía no alcanza y no se usa)', /el pozo sale con \$100 menos/.test(principal), principal.slice(0, 1500))
  check('M4: cóbrala en USDC: ningún "TUSD" fuera de la barra de la cuenta', !/TUSD/.test(principal), (principal.match(/.{0,40}TUSD.{0,40}/) ?? [''])[0])
  check('M4: cóbrala en USDC sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Crear: elegir USDC cambia el símbolo en todo el formulario y el saldo que se revisa es el de USDC.
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/crear')
  await crearDePrueba(page)
  await page.waitForSelector('.opciones-moneda', { timeout: 15000 }).catch(() => {})
  check('M4: crear ofrece TUSD y USDC', (await page.locator('.opciones-moneda .moneda').count()) === 2)
  check('M4: crear empieza en TUSD (la cuota se escribe en dólares)', (await page.locator('.opciones-moneda input[value="TUSD"]').isChecked()) && (await page.locator('.con-prefijo span').first().innerText()) === '$')
  await page.locator('.opciones-moneda .moneda', { hasText: 'USDC' }).click()
  // El saldo en USDC se lee de Horizon al elegir la moneda: esperamos a que llegue.
  await page.waitForFunction(() => /te faltan \$200/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {})
  const t = await texto(page)
  check('M4: con USDC queda elegida esa moneda', await page.locator('.opciones-moneda input[value="USDC"]').isChecked())
  check('M4: con USDC, la tabla dice "Garantía (USDC)"', /Depósito/.test(t))
  check('M4: con USDC explica el rendimiento real en Blend', /gana intereses de verdad/.test(t))
  check('M4: con USDC revisa el saldo en USDC (te faltan $200)', /te faltan \$200/.test(t), t.slice(0, 1500))
  await shot(page, 'm4-04-crear-usdc')
  check('M4: crear con USDC sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Sin USDC registrado en el contrato, crear no muestra el selector (todas las tandas son en TUSD).
  const est = nuevoEstado()
  est.usdcRegistrado = false
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/crear')
  await page.waitForSelector('.vista-previa .resumen-frase', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
  check('M4: sin USDC registrado, crear no muestra el selector de moneda', (await page.locator('.opciones-moneda').count()) === 0)
  await page.close()
}
{
  // 390 px
  const est = conTandaUsdc(nuevoEstado())
  const { page } = await nuevaPagina(browser, { est, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '#/tanda/12')
  await page.waitForSelector('.liquidez-blend', { timeout: 20000 }).catch(() => {})
  const desborde = async () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  check('Móvil (390px): tanda USDC con Blend no se desborda', !(await desborde()))
  await shot(page, 'm4-02-tanda-usdc-390')
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
  await page.waitForSelector('.cuenta-usdc', { timeout: 15000 }).catch(() => {})
  check('Móvil (390px): la barra con USDC no se desborda', !(await desborde()))
  await shot(page, 'm4-03-barra-usdc-390')
  await page.goto(BASE + '#/crear')
  await crearDePrueba(page)
  await page.waitForSelector('.opciones-moneda', { timeout: 15000 }).catch(() => {})
  check('Móvil (390px): crear con el selector de moneda no se desborda', !(await desborde()))
  await page.close()
}

// ---------------------------------------------------------------- M2 v4. Perfil, apodo, deudas y cerrar sesión
{
  // Perfil con deuda (tanda 6 de M1: "yo" debo 100 TUSD) y la mora anotada en el historial.
  const est = conTandaMorosa(nuevoEstado())
  est.historiales[ME] = historial({ cuotas_a_tiempo: 6, veces_moroso: 1, puntos_positivos: 60, puntos_negativos: 100 })
  est.apodos[ANA] = 'Doña Ana'
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tandas')
  await verTodas(page)
  await page.getByRole('link', { name: 'Perfil' }).click()
  await page.waitForFunction(() => /Mis deudas/.test(document.body.innerText) && /Tanda 6/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
  const t = (await texto(page)).replace(/ /g, ' ')
  check('Perfil: desde el menú, con tu dirección y cómo entraste', /Tu perfil/.test(t) && t.includes(ME) && /Entraste con Freighter/.test(t), t.slice(0, 400))
  check('Perfil: "Mis deudas" lista la tanda 6 con lo que debo y un botón para pagar', /Tanda 6 \(en curso\): debes \$100/.test(t) && (await page.getByRole('button', { name: 'Pagar $100' }).count()) === 1, t.slice(0, 900))
  check('Perfil: explica que con deuda no se puede unir a otra tanda', /no puedes unirte a otra tanda/.test(t))
  check('Perfil: "Ver detalle" lleva a la tanda (el desglose de M1)', (await page.getByRole('link', { name: 'Ver detalle' }).getAttribute('href')) === '#/tanda/6')
  check('Perfil: muestra el historial y el aviso de mora sin saldar', /Tu historial/.test(t) && /deuda sin saldar/.test(t))
  check('Perfil: ya no está "Mi historial" en el menú', (await page.getByRole('link', { name: 'Mi historial' }).count()) === 0)
  await shot(page, 'm2v4-01-perfil')

  // Apodo: validación en vivo, igual que el contrato
  await page.locator('#apodo').fill(' Ana')
  check('Apodo: con un espacio al inicio explica el problema y no deja guardar', /espacios del inicio/.test(await texto(page)) && (await page.getByRole('button', { name: 'Guardar' }).isDisabled()))
  await page.locator('#apodo').fill('Mamá Rosa')
  const ayuda = await page.locator('#apodo-ayuda').innerText()
  check('Apodo: uno válido se puede guardar y dice que es público', !(await page.getByRole('button', { name: 'Guardar' }).isDisabled()) && /Es público/.test(ayuda) && /Mamá Rosa · /.test(ayuda), ayuda)

  // El aviso de deuda antes de unirse a otra tanda
  await page.goto(BASE + '#/tanda/3')
  await page.waitForFunction(() => /deuda pendiente/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
  const t3 = await texto(page)
  check('Unirse con deuda: avisa antes de firmar y lleva a Perfil', /Tienes una deuda pendiente en otra tanda/.test(t3) && (await page.getByRole('link', { name: 'Ver y pagar mis deudas' }).getAttribute('href')) === '#/perfil', t3.slice(0, 600))

  // El apodo se ve en lugar de la dirección, siempre con la dirección corta
  await page.waitForFunction(() => /Doña Ana/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
  check('Apodo: "Doña Ana" en la lista de miembros', /Doña Ana/.test(await texto(page)))
  await shot(page, 'm2v4-02-aviso-deuda')
  check('Perfil y deudas: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Sin deudas
  const est = nuevoEstado()
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/perfil')
  await page.waitForFunction(() => /No debes nada|Revisando/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
  await page.waitForFunction(() => /No debes nada/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
  check('Perfil sin deudas: "No debes nada"', /No debes nada/.test(await texto(page)))
  await page.close()
}
{
  // Cerrar sesión con Freighter: al recargar sigue fuera, hasta volver a entrar
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/perfil')
  await page.waitForSelector('.perfil-salir', { timeout: 15000 }).catch(() => {})
  check('Cerrar sesión: explica cómo quitar el permiso desde Freighter', /Sitios conectados/.test(await texto(page)))
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await page.waitForFunction(() => /Entra para ver tu perfil/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {})
  check('Cerrar sesión: el perfil pide entrar de nuevo', /Entra para ver tu perfil/.test(await texto(page)))
  await page.waitForTimeout(2500) // el vigilante de Freighter no debe reconectarla
  check('Cerrar sesión: Freighter no se reconecta sola', /Entra para ver tu perfil/.test(await texto(page)) && (await page.locator('a.billetera').count()) === 0)
  await page.reload()
  await page.waitForTimeout(2500)
  check('Cerrar sesión: al recargar sigue fuera', /Entra para ver tu perfil/.test(await texto(page)))
  await page.getByRole('button', { name: 'Conectar billetera' }).first().click()
  await page.waitForFunction(() => /Tu cuenta/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {})
  check('Cerrar sesión: "Conectar billetera" vuelve a conectar', /Tu cuenta/.test(await texto(page)))
  await page.reload()
  await page.waitForFunction(() => /Tu cuenta/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {})
  check('Cerrar sesión: después de volver a entrar, recargar ya no la olvida', /Tu cuenta/.test(await texto(page)))
  check('Cerrar sesión: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // 390 px
  const est = conTandaMorosa(nuevoEstado())
  const { page } = await nuevaPagina(browser, { est, viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '#/perfil')
  await page.waitForFunction(() => /Tanda 6/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  check('Móvil (390px): el perfil no se desborda', !desborde)
  await shot(page, 'm2v4-03-perfil-390')
  await page.close()
}

// ---------------------------------------------------------------- UX: después de crear, invitar es lo principal
{
  // La tanda 3 la creé yo y está abierta: arriba de todo va la invitación con WhatsApp ya escrito.
  const est = nuevoEstado()
  const { page, errores } = await nuevaPagina(browser, { est, viewport: { width: 375, height: 800 } })
  // Como si la acabara de crear en este navegador (CrearTanda deja esta marca antes de ir a la tanda).
  await page.addInitScript(() => sessionStorage.setItem('rounda:recien-creada', '3'))
  await page.goto(BASE + '#/tanda/3')
  await page.waitForSelector('.invitar-principal', { timeout: 15000 }).catch(() => {})
  const inv = page.locator('.invitar-principal')
  check('Recién creada: saluda con "¡Tu tanda está lista!"', /¡Tu tanda está lista!/.test(await inv.innerText().catch(() => '')))
  const arriba = await page.evaluate(() => {
    const i = document.querySelector('.invitar-principal')
    const p = document.querySelector('.escenario')
    return !!i && !!p && !!(i.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  check('Recién creada: la invitación va antes que la rueda y el panel', arriba)
  const wa = decodeURIComponent((await inv.locator('a.whatsapp').getAttribute('href').catch(() => '')) ?? '')
  check('Recién creada: el WhatsApp lleva el mensaje escrito con montos y enlace', /3 personas ponemos \$100 cada 2 min/.test(wa) && /#\/tanda\/3/.test(wa) && /dólares de práctica/.test(wa), wa)
  check('Recién creada: "Invitar por WhatsApp" es el botón principal', /principal/.test((await inv.locator('a.whatsapp').getAttribute('class')) ?? ''))
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  check('Recién creada (375 px): sin desborde horizontal', !desborde)
  await shot(page, 'ux-recien-creada-375')
  check('Recién creada: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  // Sin la marca: "Invita a tu grupo". Y quien no está en la tanda no ve la invitación arriba.
  const est = nuevoEstado()
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/tanda/3')
  await page.waitForSelector('.invitar-principal', { timeout: 15000 }).catch(() => {})
  check('Tanda abierta que creé: "Invita a tu grupo" arriba', /Invita a tu grupo/.test(await page.locator('.invitar-principal').innerText().catch(() => '')))
  await page.goto(BASE + '#/tanda/5')
  await page.waitForSelector('.panel', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
  check('Tanda abierta ajena: no ve "Invita a tu grupo" (lo suyo es unirse)', (await page.locator('.invitar-principal').count()) === 0 && (await page.locator('.invitar').count()) === 0)
  await page.close()
}

// ---------------------------------------------------------------- UX: "Mis tandas" sin tandas todavía
{
  const est = nuevoEstado()
  const OTRA = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 21))
  est.cuentas[OTRA] = { existe: true, trustline: true, saldo: 1000n * 10_000_000n }
  const { page, errores } = await nuevaPagina(browser, { est, direccion: OTRA, viewport: { width: 375, height: 800 } })
  await page.goto(BASE + '#/tandas')
  await page.waitForSelector('.vacio', { timeout: 15000 }).catch(() => {})
  const t = await texto(page)
  check('Mis tandas vacía: lo dice y ofrece crear o ver las abiertas', /Todavía no estás en ninguna tanda/.test(t) && (await page.getByRole('button', { name: 'Ver tandas abiertas' }).count()) === 1)
  check('Encabezado sin apodo: dice "Mi cuenta", no la dirección', /Mi cuenta/.test(await page.locator('.barra').innerText()))
  await page.getByRole('button', { name: 'Ver tandas abiertas' }).click()
  check('Mis tandas vacía: "Ver tandas abiertas" muestra las abiertas', (await page.locator('.tarjeta').count()) === 2)
  await shot(page, 'ux-mis-tandas-vacia-375')
  check('Mis tandas vacía: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- UX: pantalla de cierre
{
  const { page, errores } = await nuevaPagina(browser, { est: nuevoEstado(), direccion: CARLA, viewport: { width: 375, height: 800 } })
  await page.goto(BASE + '#/tanda/1')
  await page.waitForSelector('.cierre', { timeout: 15000 }).catch(() => {})
  await page.waitForFunction(() => /ganó/.test(document.querySelector('.cierre')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {})
  const c = ((await page.locator('.cierre').innerText().catch(() => '')) ?? '').replace(/[\u00a0\u202f]/g, ' ')
  check('Cierre: "Terminó la tanda" con lo que puse y lo que recibí', /Terminó la tanda/.test(c) && /Pusiste \$300 en cuotas y recibiste \$300 de pozo\./.test(c), c)
  check('Cierre: cuánto ganó el depósito ($100 volvió con $114: ganó $14)', /Tu depósito de \$100 volvió con \$114: ganó \$14/.test(c), c)
  check('Cierre: la reputación y "Crear otra tanda"', /tu reputación sube/.test(c) && (await page.getByRole('link', { name: 'Crear otra tanda' }).count()) === 1)
  const arriba = await page.evaluate(() => {
    const a = document.querySelector('.cierre')
    const b = document.querySelector('.escenario')
    return !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  check('Cierre: va arriba de todo', arriba)
  await shot(page, 'ux-cierre-375')
  check('Cierre: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}

// ---------------------------------------------------------------- UX: a 375 px, igual que el celular de la portada
for (const [hash, direccion, que] of [['#/tanda/2', CARLA, 'en curso'], ['#/tanda/1', CARLA, 'terminada']]) {
  const { page } = await nuevaPagina(browser, { est: nuevoEstado(), direccion, viewport: { width: 375, height: 800 } })
  await page.goto(BASE + hash)
  await page.waitForSelector('.lista-personas', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const anchas = await page.evaluate(() => [...document.querySelectorAll('.tabla-scroll')].filter((t) => t.scrollWidth > t.clientWidth + 1).length)
  check(`375 px (${que}): ninguna tabla se desplaza de lado`, anchas === 0, `tablas anchas: ${anchas}`)
  check(`375 px (${que}): sin desborde horizontal`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
  if (hash === '#/tanda/2') {
    const filas = (await page.locator('.lista-personas .persona').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '))
    check('Tarjeta de la rueda: una píldora por persona con "Pagó" o "Por pagar"', filas.length === 3 && /Ana.*Por pagar/.test(filas[0]) && /Beto.*Pagó/.test(filas[1]) && /Carla.*Por pagar/.test(filas[2]), JSON.stringify(filas))
    check('Tarjeta de la rueda: "Turno 2 de 3 · Cobra Beto"', /Turno 2 de 3/.test(await page.locator('.ronda-linea').innerText()) && /Cobra Beto/.test(await page.locator('.ronda-linea').innerText()))
    check('Tarjeta de la rueda: la rueda y las personas van juntas', (await page.locator('.tarjeta-ronda .rueda').count()) === 1 && (await page.locator('.tarjeta-ronda .lista-personas').count()) === 1)
    const orden = await page.evaluate(() => {
      const y = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1
      return [y('.siguiente'), y('.tarjeta-ronda'), y('.rendimiento')]
    })
    check('375 px: primero la siguiente acción, después la rueda con las personas y al final los intereses', orden[0] >= 0 && orden[0] < orden[1] && orden[1] < orden[2], JSON.stringify(orden))
    await shot(page, 'ux-tanda-como-portada-375')
  }
  await page.close()
}
{
  // La portada dice lo mismo que la app: dólares y turnos.
  const { page } = await nuevaPagina(browser, { est: nuevoEstado(), conectado: false, viewport: { width: 375, height: 800 } })
  await page.goto(BASE + '#/')
  await page.waitForSelector('.lo-telefono', { timeout: 15000 }).catch(() => {})
  const tel = await page.locator('.lo-telefono').innerText().catch(() => '')
  check('Portada: el celular de ejemplo habla en dólares y turnos (sin TUSD ni "Ronda")', /\$500/.test(tel) && /Turno \d de 5/.test(tel) && !/TUSD|Ronda/.test(tel), tel.slice(0, 300))
  await page.close()
}

// ---------------------------------------------------------------- UX: la siguiente acción, arriba del panel
{
  const BETO_DIR = 'GBPDH2E2EX5D7DO76YRIX477LPJWNPB7MJZRTEDJWBKZMS5KTLLRU2LO'
  const casos = [
    ['te toca pagar', nuevoEstado(), CARLA, '#/tanda/2', /^Te toca pagar \$100$/, 'pagar'],
    ['ya pagué y espero', nuevoEstado(), BETO_DIR, '#/tanda/2', /^Ya pagaste\. Esperando a 2 personas$/, 'esperar'],
    ['te toca cobrar', conMiBolsaLista(nuevoEstado()), ME, '#/tanda/6', /^Te toca cobrar \$300$/, 'cobrar'],
    ['falta entregarle el pozo a otra persona', conMiBolsaLista(nuevoEstado()), ANA, '#/tanda/6', /^El turno terminó: falta entregarle el pozo a /, 'entregar'],
    ['debo', conTandaMorosa(nuevoEstado()), ME, '#/tanda/6', /^Debes \$100$/, 'deuda'],
    ['creé la tanda pero no estoy en ella', nuevoEstado(), ME, '#/tanda/3', /^Únete a esta tanda$/, 'entrar'],
  ]
  for (const [que, est, direccion, hash, titulo, tono] of casos) {
    const { page, errores } = await nuevaPagina(browser, { est, direccion, viewport: { width: 375, height: 800 } })
    await page.goto(BASE + hash)
    await page.waitForSelector('.siguiente h2', { timeout: 15000 }).catch(() => {})
    const h2 = ((await page.locator('.siguiente h2').innerText().catch(() => '')) ?? '').replace(/[\u00a0\u202f]/g, ' ')
    check(`Siguiente acción (${que}): "${h2}"`, titulo.test(h2) && (await page.locator(`.siguiente-${tono}`).count()) === 1, h2)
    check(`Siguiente acción (${que}): sin errores de consola`, errores.length === 0, errores.join(' | '))
    if (tono === 'pagar') {
      const b = page.getByRole('button', { name: 'Pagar mi cuota de $100' })
      check('Siguiente acción: "Pagar mi cuota" es el botón grande, justo debajo', /principal grande/.test((await b.getAttribute('class')) ?? ''))
      check('Siguiente acción: los datos del turno van después del botón', await page.evaluate(() => {
        const b = [...document.querySelectorAll('.panel button')].find((x) => /Pagar mi cuota/.test(x.textContent ?? ''))
        const d = document.querySelector('.datos-turno')
        return !!b && !!d && !!(b.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING)
      }))
      await shot(page, 'ux-siguiente-pagar-375')
    }
    if (tono === 'entregar') {
      const b = page.getByRole('button', { name: /^Entregarle el pozo a/ })
      check('Siguiente acción: "Entregarle el pozo a…" es el botón principal para quien ya pagó', (await b.count()) === 1 && /principal/.test((await b.getAttribute('class')) ?? ''))
    }
    if (tono === 'cobrar') await shot(page, 'ux-siguiente-cobrar-375')
    await page.close()
  }
}

// ---------------------------------------------------------------- UX: glosario (web/src/lib/glosario.ts)
// El camino principal (lobby, unirse, pagar, cobrar, ver el final) no muestra jerga: es la lista JERGA del
// glosario. "Opciones avanzadas", #/estado y el pie quedan fuera. Los montos se ven como $100.
{
  const JERGA = /(?<![\p{L}])(TUSD|garantías?|colateral|bolsas?|rondas?|morosos?|mora|XLM|Friendbot|trustline|bóvedas?)(?![\p{L}])/giu
  const casos = [
    ['#/tandas', ME, 'el lobby'],
    ['#/tanda/3', ME, 'la tanda abierta que creé'],
    ['#/tanda/5', ME, 'una tanda abierta a la que me invitan'],
    ['#/tanda/2', CARLA, 'la tanda en curso (me falta pagar)'],
    ['#/tanda/2', ANA, 'la tanda en curso (ya cobré)'],
    ['#/tanda/1', CARLA, 'la tanda terminada'],
  ]
  for (const [hash, direccion, que] of casos) {
    const { page } = await nuevaPagina(browser, { est: nuevoEstado(), direccion })
    await page.goto(BASE + hash)
    await page.waitForSelector('.tarjeta, .panel', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2500)
    const t = (await page.locator('main').innerText()) + '\n' + (await page.locator('.barra-cuenta').allInnerTexts()).join('\n')
    const hallada = [...t.matchAll(JERGA)].map((m) => t.slice(Math.max(0, m.index - 30), m.index + 20).replace(/\n/g, ' | '))
    check(`Glosario: sin jerga en ${que}`, hallada.length === 0, hallada.slice(0, 5).join(' // '))
    if (hash === '#/tanda/2') check(`Glosario: montos en dólares en ${que}`, /\$300/.test(t) && /\$100/.test(t), t.slice(0, 300))
    await page.close()
  }
}

// ---------------------------------------------------------------- UX (plan v5, pedido 4): un pago pendiente en el grupo se dice fuerte
// Quien debe en OTRA tanda y ya está en esta: aviso rojo arriba mientras la tanda está abierta, confirmación al
// unirse ("Unirme igual") y una marca junto a su nombre mientras la tanda sigue. Lee el historial (`tiene_mora`).
{
  const pendiente = historial({ cuotas_a_tiempo: 4, veces_moroso: 1, deudas_saldadas: 0, puntos_positivos: 40, puntos_negativos: 100 })
  const JERGA_MORA = /(?<![\p{L}])(TUSD|garantías?|colateral|bolsas?|rondas?|morosos?|mora|XLM|Friendbot|trustline|bóvedas?)(?![\p{L}])/iu
  const limpio = (s) => s.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()
  // Intentar unirse muestra un aviso en el panel ("Confirma en Freighter…"; con el mock, que no sirve la cuenta, el error). Sin intento, no hay aviso.
  const intentos = (page, panel) => page.locator(`${panel} .aviso`).count()

  // A. Tanda 5 (abierta: Beto y Carla). Carla tiene un pago pendiente en otra tanda y mira "yo", que no está en ella.
  {
    const est = nuevoEstado()
    est.historiales[CARLA] = pendiente
    const { page, errores } = await nuevaPagina(browser, { est })
    await page.goto(BASE + '#/tanda/5')
    await page.waitForSelector('.aviso-mora', { timeout: 15000 }).catch(() => {})
    const aviso = limpio(await page.locator('.aviso-mora').innerText().catch(() => ''))
    check('Pago pendiente: la tanda abierta dice arriba quién lo tiene, con las palabras del plan', /Carla tiene un pago pendiente en otra tanda Si la tanda empieza y no paga, su depósito podría no alcanzar\./.test(aviso), aviso)
    check('Pago pendiente: es una alerta que no se puede cerrar', (await page.locator('.aviso-mora[role="alert"]').count()) === 1 && (await page.locator('.aviso-mora button').count()) === 0)
    check('Pago pendiente: el aviso va arriba de la invitación y de la rueda', await page.evaluate(() => {
      const y = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1
      return y('.aviso-mora') >= 0 && y('.aviso-mora') < y('.panel-ronda') && y('.aviso-mora') < y('.tarjeta-ronda')
    }))
    const filas = (await page.locator('.lista-personas .persona').allInnerTexts()).map(limpio)
    check('Pago pendiente: la marca va junto a Carla y no junto a Beto', /Beto/.test(filas[0]) && !/Pago pendiente/.test(filas[0]) && /Carla.*Pago pendiente en otra tanda/.test(filas[1]), JSON.stringify(filas))
    const historiales = est.llamadas.filter((l) => l.endsWith('.historial')).length
    // Una lectura por persona distinta: "yo", Beto y Carla (las de la tanda 5) y Ana (miembro de la tanda 3, que creé: la lee la campanita).
    check('Pago pendiente: no suma consultas (comparte la lectura de las insignias: una por persona distinta)', historiales <= 4, `lecturas del historial: ${historiales}`)

    const unirse = page.getByRole('button', { name: /^Unirme y dejar/ })
    await unirse.click()
    const conf = limpio(await page.locator('.confirmar-union').innerText().catch(() => ''))
    check('Pago pendiente: al unirse pide confirmar, con "Mejor no" y "Unirme igual"', /^ANTES DE UNIRTE Carla tiene un pago pendiente en otra tanda Si la tanda empieza y no paga, su depósito podría no alcanzar y el pozo de algún turno podría llegar incompleto\./i.test(conf) && (await page.getByRole('button', { name: 'Unirme igual' }).count()) === 1 && (await page.getByRole('button', { name: 'Mejor no' }).count()) === 1, conf)
    check('Pago pendiente: el foco pasa a la advertencia y todavía no se pidió firmar', (await page.evaluate(() => document.activeElement?.classList.contains('confirmar-union'))) && (await intentos(page, '.panel-ronda')) === 0)
    check('Pago pendiente: ni el aviso ni la confirmación usan jerga', !JERGA_MORA.test(aviso) && !JERGA_MORA.test(conf), `${aviso} | ${conf}`)
    await page.setViewportSize({ width: 375, height: 800 })
    check('Pago pendiente (375 px): sin desborde horizontal con el aviso y la confirmación', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    await shot(page, 'ux-pago-pendiente-confirma-375')
    await page.setViewportSize({ width: 1280, height: 900 })
    check('Pago pendiente: sin errores de consola', errores.length === 0, errores.join(' | '))

    await page.getByRole('button', { name: 'Mejor no' }).click()
    await page.waitForTimeout(200)
    check('Pago pendiente: "Mejor no" vuelve al botón de unirse y no firma nada', (await page.locator('.confirmar-union').count()) === 0 && (await unirse.isVisible()) && (await intentos(page, '.panel-ronda')) === 0)
    check('Pago pendiente: al volver, el foco queda en el botón de unirse', await page.evaluate(() => /^Unirme y dejar/.test(document.activeElement?.textContent ?? '')))
    await unirse.click()
    await page.getByRole('button', { name: 'Unirme igual' }).click()
    await page.waitForTimeout(1500)
    check('Pago pendiente: "Unirme igual" sí sigue con la unión (empieza a firmar)', (await intentos(page, '.panel-ronda')) === 1)
    check('Pago pendiente: la confirmación se cierra al seguir', (await page.locator('.confirmar-union').count()) === 0)
    await page.close()
  }

  // B. Sin pagos pendientes: Carla ya saldó el suyo (el historial de ejemplo lo dice). Ni aviso ni marca, y unirse va directo.
  {
    const est = nuevoEstado()
    const { page, errores } = await nuevaPagina(browser, { est })
    await page.goto(BASE + '#/tanda/5')
    await page.waitForSelector('.lista-personas', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)
    check('Sin pago pendiente: ni aviso rojo ni marcas', (await page.locator('.aviso-mora').count()) === 0 && (await page.locator('.marca-mora').count()) === 0)
    await page.getByRole('button', { name: /^Unirme y dejar/ }).click()
    await page.waitForTimeout(1500)
    check('Sin pago pendiente: unirse va directo, sin preguntar', (await page.locator('.confirmar-union').count()) === 0 && (await intentos(page, '.panel-ronda')) === 1)
    check('Sin pago pendiente: sin errores de consola', errores.filter((e) => !/mock|operación/.test(e)).length === 0, errores.join(' | '))
    await page.close()
  }

  // C. Quien mira es quien tiene el pago pendiente (Carla, que ya está en la tanda): se le habla a ella y se le lleva a sus deudas.
  {
    const est = nuevoEstado()
    est.historiales[CARLA] = pendiente
    const { page } = await nuevaPagina(browser, { est, direccion: CARLA })
    await page.goto(BASE + '#/tanda/5')
    await page.waitForSelector('.aviso-mora', { timeout: 15000 }).catch(() => {})
    const aviso = limpio(await page.locator('.aviso-mora').innerText().catch(() => ''))
    check('Pago pendiente (yo): "Tienes un pago pendiente en otra tanda", con lo que puede pasar', /Tienes un pago pendiente en otra tanda Si esta tanda empieza y no pagas, tu depósito podría no alcanzar\./.test(aviso), aviso)
    check('Pago pendiente (yo): lleva a "Ver y pagar mis deudas" (el Perfil)', (await page.locator('.aviso-mora a[href="#/perfil"]').innerText().catch(() => '')) === 'Ver y pagar mis deudas')
    check('Pago pendiente (yo): no se habla de "Carla" en tercera persona', !/Carla tiene/.test(aviso))
    await page.close()
  }

  // D. Dos personas con pagos pendientes: todo en plural, con "y".
  {
    const est = nuevoEstado()
    est.historiales[CARLA] = pendiente
    est.historiales[BETO] = pendiente
    const { page } = await nuevaPagina(browser, { est })
    await page.goto(BASE + '#/tanda/5')
    await page.waitForSelector('.aviso-mora', { timeout: 15000 }).catch(() => {})
    const aviso = limpio(await page.locator('.aviso-mora').innerText().catch(() => ''))
    check('Pago pendiente: dos personas, en plural', /Beto y Carla tienen pagos pendientes en otras tandas Si la tanda empieza y no pagan, sus depósitos podrían no alcanzar\./.test(aviso), aviso)
    check('Pago pendiente: dos marcas en la lista', (await page.locator('.marca-mora').count()) === 2)
    await page.close()
  }

  // E. Tanda en curso: sin aviso rojo (ya empezó), pero la marca sigue junto a la persona. Quien ya debe en ESTA tanda
  // no la lleva: a su derecha dice "Debe $100".
  {
    const est = conTandaMorosa(nuevoEstado())
    est.historiales[CARLA] = pendiente
    est.historiales[ME] = pendiente
    const { page, errores } = await nuevaPagina(browser, { est, direccion: ANA })
    await page.goto(BASE + '#/tanda/6')
    await page.waitForSelector('.lista-personas', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const filas = (await page.locator('.lista-personas .persona').allInnerTexts()).map(limpio)
    check('Pago pendiente (en curso): sin aviso rojo, la tanda ya empezó', (await page.locator('.aviso-mora').count()) === 0)
    check('Pago pendiente (en curso): la marca sigue junto a Carla', filas.some((f) => /^C Carla.*Pago pendiente en otra tanda/.test(f)), JSON.stringify(filas))
    check('Pago pendiente (en curso): quien debe en esta tanda dice "Debe $100" y no lleva la marca', filas.some((f) => /Debe \$100/.test(f) && !/Pago pendiente en otra tanda/.test(f)), JSON.stringify(filas))
    check('Pago pendiente (en curso): sin errores de consola', errores.length === 0, errores.join(' | '))
    await page.close()
  }

  // F. Tanda terminada: ya no hay nada que proteger. Ni aviso ni marcas.
  {
    const est = nuevoEstado()
    est.historiales[CARLA] = pendiente
    const { page } = await nuevaPagina(browser, { est, direccion: ANA })
    await page.goto(BASE + '#/tanda/1')
    await page.waitForSelector('.lista-personas', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)
    check('Pago pendiente (terminada): ni aviso ni marcas', (await page.locator('.aviso-mora').count()) === 0 && (await page.locator('.marca-mora').count()) === 0)
    await page.close()
  }

  // G. La otra forma de unirse (elegir turno, M3) también pregunta. Tanda 8: precio por turno, Ana ya está.
  {
    const est = nuevoEstadoTurnos()
    est.historiales[ANA] = pendiente
    const { page } = await nuevaPagina(browser, { est })
    await page.goto(BASE + '#/tanda/8')
    await page.waitForSelector('.rejilla-turnos', { timeout: 15000 })
    await page.waitForSelector('.aviso-mora', { timeout: 15000 }).catch(() => {})
    check('Pago pendiente (elegir turno): el aviso rojo también sale', /Ana tiene un pago pendiente en otra tanda/.test(limpio(await page.locator('.aviso-mora').innerText().catch(() => ''))))
    await page.locator('.turno-casilla').nth(0).click()
    await page.getByRole('button', { name: /^Unirme en el turno 1 y dejar/ }).click()
    check('Pago pendiente (elegir turno): al unirse pide confirmar y todavía no firma', (await page.locator('.confirmar-union').count()) === 1 && (await intentos(page, '.turnos-acciones')) === 0)
    await page.getByRole('button', { name: 'Unirme igual' }).click()
    await page.waitForTimeout(1500)
    check('Pago pendiente (elegir turno): "Unirme igual" sigue con la unión en ese turno', (await page.locator('.confirmar-union').count()) === 0 && (await intentos(page, '.turnos-acciones')) === 1)
    await page.close()
  }

  // H. Quien toca "Unirme" antes de que llegue la lectura del historial tampoco se salta la confirmación: el botón
  // pregunta en el momento de pulsar, no con lo que ya se dibujó.
  {
    const est = nuevoEstado()
    est.historiales[CARLA] = pendiente
    est.demoraRpc = 1200
    const { page } = await nuevaPagina(browser, { est })
    await page.goto(BASE + '#/tanda/5')
    const unirse = page.getByRole('button', { name: /^Unirme y dejar/ })
    await unirse.waitFor({ timeout: 20000 })
    const todaviaSinAviso = (await page.locator('.aviso-mora').count()) === 0
    await unirse.click()
    check('Pago pendiente (tocar antes de tiempo): al pulsar todavía no llegó el aviso de arriba', todaviaSinAviso)
    await page.waitForSelector('.confirmar-union', { timeout: 15000 }).catch(() => {})
    check('Pago pendiente (tocar antes de tiempo): igual pide confirmar y no empieza a firmar', (await page.locator('.confirmar-union').count()) === 1 && (await intentos(page, '.panel-ronda')) === 0)
    await page.close()
  }
}

// ---------------------------------------------------------------- UX (plan v5, pedido 3): la campanita de avisos
// Los avisos salen de lo que se lee de la red (el estado de las tandas y sus eventos); lo leído se guarda en el
// navegador (rounda:notificaciones:<cuenta>). Las pruebas siembran `base: 0` para que los eventos del mock (de hace
// unos minutos) cuenten como sin leer; sin sembrar, lo que pasó antes de la primera vez cuenta como leído.
{
  const limpio = (s) => s.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()
  const JERGA_AVISOS = /(?<![\p{L}])(TUSD|garantías?|colateral|bolsas?|rondas?|morosos?|mora|XLM|Friendbot|trustline|bóvedas?)(?![\p{L}])/iu
  const CLAVE = (cuenta) => `rounda:notificaciones:${cuenta}`
  /** Siembra lo leído SOLO si todavía no hay nada (así recargar no lo borra). */
  const sembrar = (page, cuenta, leidas = { base: 0, ids: [] }) =>
    page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v) }, [CLAVE(cuenta), JSON.stringify(leidas)])
  const guardado = (page, cuenta) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), CLAVE(cuenta))
  /** Espera a que la campanita lea la red (el número aparece cuando hay avisos sin leer). */
  const hayNumero = (page) => page.waitForSelector('.campana-numero', { timeout: 15000 }).then(() => true).catch(() => false)
  const titulos = async (page) => (await page.locator('.campana-titulo').allInnerTexts()).map((x) => limpio(x.replace('(nuevo)', '')))

  // A. Sin sesión no hay campanita; con sesión, tampoco en la demo (se proyecta).
  {
    const sin = await nuevaPagina(browser, { est: nuevoEstado(), conectado: false })
    await sin.page.goto(BASE + '#/tandas')
    await sin.page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
    check('Campanita: sin sesión no se muestra', (await sin.page.locator('.boton-campana').count()) === 0)
    await sin.page.close()
    const demo = await nuevaPagina(browser, { est: nuevoEstado() })
    await demo.page.goto(BASE + '#/demo')
    await demo.page.waitForTimeout(1500)
    check('Campanita: en la demo tampoco', (await demo.page.locator('.boton-campana').count()) === 0)
    await demo.page.close()
  }

  // B. Carla, con todo sin leer: te toca pagar (tanda 2) y tres cosas que pasaron (la tanda 1 empezó y terminó; la 2 empezó).
  {
    const est = nuevoEstado()
    const { page, errores } = await nuevaPagina(browser, { est, direccion: CARLA })
    await sembrar(page, CARLA)
    await page.goto(BASE + '#/tandas')
    const aparecio = await hayNumero(page)
    const boton = page.locator('.boton-campana')
    check('Campanita: el número dice cuántos avisos hay sin leer', aparecio && limpio(await page.locator('.campana-numero').innerText()) === '4' && (await boton.getAttribute('aria-label')) === 'Avisos: 4 sin leer', await boton.getAttribute('aria-label'))
    check('Campanita: cerrada, el botón avisa que abre un panel', (await boton.getAttribute('aria-expanded')) === 'false' && (await boton.getAttribute('aria-haspopup')) === 'dialog')
    await boton.click()
    await page.waitForSelector('.campana-panel', { timeout: 5000 })
    const lista = await titulos(page)
    check('Campanita: lo que te toca hacer va primero y después lo que pasó', lista[0] === 'Te toca pagar $100 en Tanda 2' && lista.slice(1).every((x) => /^La tanda (terminó|empezó)$/.test(x)) && lista.length === 4, JSON.stringify(lista))
    const detalles = (await page.locator('.campana-item').allInnerTexts()).map(limpio)
    check('Campanita: "Te toca pagar" dice cuándo vence', /Vence en/.test(detalles[0]), detalles[0])
    check('Campanita: cuando terminó la tanda dice cuánto recibiste', detalles.some((d) => /La tanda terminó \(nuevo\)? ?Tanda 1: recibiste \$114 al final\. Mira el detalle\./.test(d) || /Tanda 1: recibiste \$114 al final/.test(d)), JSON.stringify(detalles))
    check('Campanita: lo que pasó dice hace cuánto', detalles.slice(1).every((d) => /hace \d+ min|ahora/.test(d)), JSON.stringify(detalles))
    check('Campanita: los cuatro salen como nuevos', (await page.locator('.campana-item.nueva').count()) === 4)
    check('Campanita: abierta, el panel es un diálogo con el foco adentro y sin el número', (await page.locator('.campana-panel[role="dialog"]').count()) === 1 && (await page.evaluate(() => document.activeElement?.classList.contains('campana-panel'))) && (await page.locator('.campana-numero').count()) === 0 && (await boton.getAttribute('aria-expanded')) === 'true')
    check('Campanita: sin jerga en los avisos', !JERGA_AVISOS.test(detalles.join(' ')), detalles.join(' | '))
    await shot(page, 'ux-campanita-escritorio')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    check('Campanita: Escape cierra el panel y el foco vuelve a la campanita', (await page.locator('.campana-panel').count()) === 0 && (await page.evaluate(() => document.activeElement?.classList.contains('boton-campana'))))
    const g = await guardado(page, CARLA)
    check('Campanita: al cerrar, lo visto queda leído (se guarda en el navegador)', !!g && ['pagar:2:1', 'termino:1', 'empezo:1', 'empezo:2'].every((id) => g.ids.includes(id)), JSON.stringify(g))
    check('Campanita: sin avisos nuevos, el número desaparece', (await page.locator('.campana-numero').count()) === 0 && (await boton.getAttribute('aria-label')) === 'Avisos')
    await boton.click()
    await page.waitForSelector('.campana-panel', { timeout: 5000 })
    check('Campanita: al volver a abrir, ya no hay nuevos (siguen en la lista)', (await page.locator('.campana-item.nueva').count()) === 0 && (await page.locator('.campana-item').count()) === 4)
    await page.locator('h1').first().click()
    await page.waitForTimeout(200)
    check('Campanita: tocar fuera del panel lo cierra', (await page.locator('.campana-panel').count()) === 0)
    await boton.click()
    await page.waitForSelector('.campana-panel', { timeout: 5000 })
    await page.locator('.menu a', { hasText: 'Crear' }).click()
    await page.waitForTimeout(400)
    check('Campanita: en la computadora el toque fuera no se pierde: abre lo que se tocó', /#\/crear$/.test(page.url()) && (await page.locator('.campana-panel').count()) === 0, page.url())
    await boton.click()
    await page.getByRole('link', { name: /Te toca pagar \$100 en Tanda 2/ }).click()
    await page.waitForTimeout(400)
    check('Campanita: tocar un aviso lleva a su tanda y cierra el panel', /#\/tanda\/2$/.test(page.url()) && (await page.locator('.campana-panel').count()) === 0, page.url())
    check('Campanita: sin errores de consola', errores.length === 0, errores.join(' | '))
    // Recargar no borra lo leído: sigue sin número.
    await page.reload()
    await page.waitForSelector('.boton-campana', { timeout: 15000 })
    await page.waitForTimeout(2500)
    check('Campanita: lo leído sobrevive a recargar la página', (await page.locator('.campana-numero').count()) === 0)
    await page.close()
  }

  // C. Primera vez en este navegador: lo que pasó antes cuenta como leído; lo que te toca hacer ahora, no.
  {
    const { page } = await nuevaPagina(browser, { est: nuevoEstado(), direccion: CARLA })
    await page.goto(BASE + '#/tandas')
    const aparecio = await hayNumero(page)
    check('Campanita (primera vez): solo cuenta lo que te toca hacer, no la historia vieja', aparecio && limpio(await page.locator('.campana-numero').innerText()) === '1')
    await page.locator('.boton-campana').click()
    await page.waitForSelector('.campana-panel', { timeout: 5000 })
    check('Campanita (primera vez): la historia está en la lista, pero ya leída', (await page.locator('.campana-item').count()) === 4 && (await page.locator('.campana-item.nueva').count()) === 1)
    const g = await guardado(page, CARLA)
    check('Campanita (primera vez): guarda desde cuándo se usa', !!g && typeof g.base === 'number' && g.base > 1_700_000_000, JSON.stringify(g))
    await page.close()
  }

  // D. Te toca cobrar; y debes.
  {
    const cobro = await nuevaPagina(browser, { est: conMiBolsaLista(nuevoEstado()), direccion: ME })
    await sembrar(cobro.page, ME)
    await cobro.page.goto(BASE + '#/tandas')
    await hayNumero(cobro.page)
    await cobro.page.locator('.boton-campana').click()
    await cobro.page.waitForSelector('.campana-panel', { timeout: 5000 })
    const d = (await cobro.page.locator('.campana-item').allInnerTexts()).map(limpio)
    check('Campanita: "Te toca cobrar $300 en Tanda 6" va primero y dice que el pozo está listo', /^Te toca cobrar \$300 en Tanda 6/.test(d[0]) && /Tu pozo está listo\./.test(d[0]), JSON.stringify(d))
    await cobro.page.close()

    const deuda = await nuevaPagina(browser, { est: conTandaMorosa(nuevoEstado()), direccion: ME })
    await sembrar(deuda.page, ME)
    await deuda.page.goto(BASE + '#/tandas')
    await hayNumero(deuda.page)
    await deuda.page.locator('.boton-campana').click()
    await deuda.page.waitForSelector('.campana-panel', { timeout: 5000 })
    const t2 = await titulos(deuda.page)
    check('Campanita: "Debes $100 en Tanda 6"', t2.includes('Debes $100 en Tanda 6'), JSON.stringify(t2))
    await deuda.page.close()
  }

  // E. Alguien te pagó una deuda (Carla le pagó $50 a Beto), con el apodo que llega después de las direcciones.
  {
    const est = conTandaMorosa(nuevoEstado())
    est.apodos[CARLA] = 'Caro'
    const { page } = await nuevaPagina(browser, { est, direccion: BETO })
    await sembrar(page, BETO)
    await page.goto(BASE + '#/tandas')
    await hayNumero(page)
    await page.locator('.boton-campana').click()
    await page.waitForSelector('.campana-panel', { timeout: 5000 })
    await page.waitForFunction(() => /Caro te pagó/.test(document.querySelector('.campana-panel')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {})
    const t3 = await titulos(page)
    check('Campanita: "Caro te pagó $50 de lo que te debía" (con el apodo, que llega después)', t3.includes('Caro te pagó $50 de lo que te debía'), JSON.stringify(t3))
    await page.close()
  }

  // F. Alguien con un pago pendiente en otra tanda se unió a tu tanda (la 3, que creó "yo"; Ana ya está en ella).
  {
    const est = nuevoEstado()
    est.historiales[ANA] = historial({ cuotas_a_tiempo: 4, veces_moroso: 1, deudas_saldadas: 0, puntos_positivos: 40, puntos_negativos: 100 })
    const { page } = await nuevaPagina(browser, { est, direccion: ME })
    await page.goto(BASE + '#/tandas')
    await hayNumero(page)
    await page.locator('.boton-campana').click()
    await page.waitForSelector('.campana-panel', { timeout: 5000 })
    const d = (await page.locator('.campana-item').allInnerTexts()).map(limpio)
    check('Campanita: "Ana, que tiene un pago pendiente, se unió a tu tanda", con lo que puede pasar', d.length === 1 && /^Ana, que tiene un pago pendiente, se unió a tu tanda/.test(d[0]) && /su depósito podría no alcanzar/.test(d[0]), JSON.stringify(d))
    await page.close()
    // Sin pago pendiente (Ana está al día): ningún aviso.
    const sin = await nuevaPagina(browser, { est: nuevoEstado(), direccion: ME })
    await sin.page.goto(BASE + '#/tandas')
    await sin.page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
    await sin.page.waitForTimeout(2500)
    check('Campanita: con todos al día no hay aviso de pago pendiente', (await sin.page.locator('.campana-numero').count()) === 0)
    await sin.page.close()
  }

  // G. Te invitaron: quien abre el enlace de una tanda abierta y no se une la ve en la campanita.
  {
    const { page } = await nuevaPagina(browser, { est: nuevoEstado(), direccion: ME })
    await page.goto(BASE + '#/tanda/5')
    await page.waitForSelector('.panel-ronda', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(500)
    await page.evaluate(() => { window.location.hash = '#/tandas' })
    await hayNumero(page)
    await page.locator('.boton-campana').click()
    await page.waitForSelector('.campana-panel', { timeout: 5000 })
    const d = (await page.locator('.campana-item').allInnerTexts()).map(limpio)
    check('Campanita: "Te invitaron a Tanda 5", con la tanda en una línea', d.length === 1 && /^Te invitaron a Tanda 5/.test(d[0]) && /5 personas · \$50 por semana\. Entra para unirte\./.test(d[0]), JSON.stringify(d))
    const inv = await page.evaluate(() => JSON.parse(localStorage.getItem('rounda:invitaciones') ?? 'null'))
    check('Campanita: la invitación se guarda en el navegador', Array.isArray(inv) && inv.length === 1 && inv[0].id === 5, JSON.stringify(inv))
    await page.close()
    // Quien ya está en la tanda no se invita a sí mismo: Ana abre la 3 (donde ya está).
    const ana = await nuevaPagina(browser, { est: nuevoEstado(), direccion: ANA })
    await sembrar(ana.page, ANA, { base: Math.floor(Date.now() / 1000) + 3600, ids: [] })
    await ana.page.goto(BASE + '#/tanda/3')
    await ana.page.waitForSelector('.panel-ronda', { timeout: 15000 }).catch(() => {})
    await ana.page.waitForTimeout(2500)
    await ana.page.locator('.boton-campana').click()
    await ana.page.waitForSelector('.campana-panel', { timeout: 5000 })
    check('Campanita: no te invita a una tanda donde ya estás', !(await titulos(ana.page)).some((x) => /Te invitaron/.test(x)))
    await ana.page.close()
  }

  // H. En el celular (375 px): la campanita cabe en la barra y el panel es una hoja desde abajo, con el foco atrapado.
  {
    const { page, errores } = await nuevaPagina(browser, { est: nuevoEstado(), direccion: CARLA, viewport: { width: 375, height: 800 } })
    await sembrar(page, CARLA)
    await page.goto(BASE + '#/tandas')
    await hayNumero(page)
    check('Campanita (375 px): sin desborde horizontal con la campanita en la barra', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    await page.locator('.boton-campana').click()
    await page.waitForSelector('.campana-panel', { timeout: 5000 })
    await page.waitForTimeout(500)
    const hoja = await page.evaluate(() => {
      const r = document.querySelector('.campana-panel').getBoundingClientRect()
      return { abajo: Math.round(r.bottom), alto: window.innerHeight, ancho: Math.round(r.width), pantalla: window.innerWidth, fija: getComputedStyle(document.querySelector('.campana-panel')).position }
    })
    check('Campanita (375 px): el panel es una hoja fija pegada abajo y de lado a lado', hoja.fija === 'fixed' && hoja.abajo === hoja.alto && hoja.ancho === hoja.pantalla, JSON.stringify(hoja))
    check('Campanita (375 px): hay un botón "Cerrar" a la vista', await page.getByRole('button', { name: 'Cerrar', exact: true }).isVisible())
    for (let i = 0; i < 8; i++) await page.keyboard.press('Tab')
    check('Campanita (375 px): con Tab el foco no se escapa de la hoja', await page.evaluate(() => !!document.activeElement?.closest('.campana-panel')))
    for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+Tab')
    check('Campanita (375 px): ni hacia atrás', await page.evaluate(() => !!document.activeElement?.closest('.campana-panel')))
    check('Campanita (375 px): sin desborde horizontal con la hoja abierta', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    await shot(page, 'ux-campanita-375')
    await page.locator('.campana-fondo').click({ position: { x: 20, y: 20 } })
    await page.waitForTimeout(200)
    check('Campanita (375 px): tocar el velo de atrás cierra la hoja', (await page.locator('.campana-panel').count()) === 0)
    await page.locator('.boton-campana').click()
    await page.waitForSelector('.campana-panel', { timeout: 5000 })
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.waitForTimeout(200)
    check('Campanita (375 px): "Cerrar" cierra la hoja', (await page.locator('.campana-panel').count()) === 0)
    check('Campanita (375 px): sin errores de consola', errores.length === 0, errores.join(' | '))
    await page.close()
  }

  // I. Si la red falla, la campanita no estorba: ni número ni errores.
  {
    const est = nuevoEstado()
    est.contratoCaido = true
    const { page, errores } = await nuevaPagina(browser, { est, direccion: CARLA })
    await sembrar(page, CARLA)
    await page.goto(BASE + '#/tandas')
    await page.waitForSelector('.boton-campana', { timeout: 15000 })
    await page.waitForTimeout(2500)
    check('Campanita: con la red caída no muestra número y no da errores', (await page.locator('.campana-numero').count()) === 0 && errores.length === 0, errores.join(' | '))
    await page.locator('.boton-campana').click()
    check('Campanita: con la red caída el panel dice que no hay avisos', /No tienes avisos por ahora/.test(await page.locator('.campana-panel').innerText()))
    await page.close()
  }
}

// ---------------------------------------------------------------- UX (plan v5, pedido 6): amigos
// Se guardan solo en el navegador (rounda:amigos:<cuenta>): se agregan pegando una dirección, desde la lista de quiénes
// participan o desde el perfil público; se les invita a una tanda abierta propia y se quitan. Los de la campanita:
// "Tu amigo Beto creó una tanda".
{
  const limpio = (s) => s.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()
  const CLAVE = (cuenta) => `rounda:amigos:${cuenta}`
  const sembrarAmigos = (page, cuenta, lista) => page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v) }, [CLAVE(cuenta), JSON.stringify(lista)])
  const guardados = (page, cuenta) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]'), CLAVE(cuenta))
  const JERGA_AMIGOS = /(?<![\p{L}])(TUSD|garantías?|colateral|bolsas?|rondas?|morosos?|mora|XLM|Friendbot|trustline|bóvedas?)(?![\p{L}])/iu
  const BETO_DIR = BETO
  const dirMala = BETO.slice(0, -1) + 'A'

  // A. Las pestañas del Perfil.
  {
    const { page } = await nuevaPagina(browser, { est: nuevoEstado(), direccion: ME })
    await page.goto(BASE + '#/perfil')
    await page.waitForSelector('.perfil-pestanas', { timeout: 15000 })
    const tabs = (await page.locator('.perfil-pestanas a').allInnerTexts()).join('|')
    check('Amigos: el Perfil tiene dos pestañas, "Mi cuenta" y "Amigos"', tabs === 'Mi cuenta|Amigos' && (await page.locator('.perfil-pestanas a[aria-current="page"]').innerText()) === 'Mi cuenta', tabs)
    await page.locator('.perfil-pestanas a', { hasText: 'Amigos' }).click()
    await page.waitForSelector('.amigos', { timeout: 5000 })
    check('Amigos: la pestaña tiene su propia dirección (#/perfil/amigos) y el menú sigue en "Perfil"', /#\/perfil\/amigos$/.test(page.url()) && (await page.locator('.menu a[aria-current="page"]').innerText()) === 'Perfil' && (await page.locator('.perfil-pestanas a[aria-current="page"]').innerText()) === 'Amigos')
    const t = limpio(await page.locator('.amigos').innerText())
    check('Amigos: avisa que se guardan solo en este teléfono o computadora', /se guardan solo en este teléfono o computadora/.test(t), t)
    check('Amigos: sin amigos, lo dice y cómo agregarlos', /Todavía no tienes amigos guardados/.test(t))
    check('Amigos: sin jerga', !JERGA_AMIGOS.test(t), t)
    await page.close()
    const sin = await nuevaPagina(browser, { est: nuevoEstado(), conectado: false })
    await sin.page.goto(BASE + '#/perfil/amigos')
    await sin.page.waitForTimeout(1500)
    check('Amigos: sin sesión pide entrar', /Entra para ver tu perfil/.test(await texto(sin.page)) && (await sin.page.locator('.amigos').count()) === 0)
    await sin.page.close()
  }

  // B. Agregar pegando una dirección, con sus validaciones; y que quede guardado.
  {
    const { page, errores } = await nuevaPagina(browser, { est: nuevoEstado(), direccion: ME })
    await page.goto(BASE + '#/perfil/amigos')
    await page.waitForSelector('.amigos', { timeout: 15000 })
    await page.getByRole('button', { name: 'Agregar un amigo' }).click()
    const dir = page.getByLabel('Dirección de tu amigo')
    const apodo = page.getByLabel('¿Cómo le dices?')
    const guardar = page.getByRole('button', { name: 'Guardar amigo' })
    const problema = async () => limpio(await page.locator('.form-amigo [role="alert"]').first().innerText().catch(() => ''))
    await guardar.click()
    check('Amigos: sin dirección, pide pegarla', /Pega la dirección de tu amigo/.test(await problema()), await problema())
    await dir.fill(dirMala)
    await apodo.fill('Beto')
    await guardar.click()
    check('Amigos: una dirección con un error de tipeo se explica', /no es válida/.test(await problema()), await problema())
    await dir.fill(ME)
    await guardar.click()
    check('Amigos: tu propia dirección no vale', /es la tuya/.test(await problema()), await problema())
    await dir.fill(BETO_DIR)
    await apodo.fill('')
    await guardar.click()
    check('Amigos: sin apodo, pide cómo le dices', /Escribe cómo le dices/.test(await problema()), await problema())
    await apodo.fill('  Beto  ')
    await guardar.click()
    await page.waitForSelector('.lista-amigos .amigo', { timeout: 5000 })
    // La reputación llega de la red un momento después: se espera en vez de adivinar cuánto tarda.
    await page.waitForFunction(() => /Bronce/.test(document.querySelector('.lista-amigos .amigo')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {})
    const fila = limpio(await page.locator('.lista-amigos .amigo').first().innerText())
    check('Amigos: queda en la lista con su apodo y su reputación', /^B Beto Bronce/.test(fila) && /Invitar a una tanda/.test(fila) && /Quitar/.test(fila), fila)
    check('Amigos: dice que ya quedó', /Listo: Beto quedó en tus amigos\./.test(await texto(page)))
    const g = await guardados(page, ME)
    check('Amigos: se guarda en el navegador (rounda:amigos:<cuenta>)', g.length === 1 && g[0].dir === BETO_DIR && g[0].apodo === 'Beto', JSON.stringify(g))
    await page.getByRole('button', { name: 'Agregar un amigo' }).click()
    await page.getByLabel('Dirección de tu amigo').fill(BETO_DIR)
    await page.getByLabel('¿Cómo le dices?').fill('Otro')
    await page.getByRole('button', { name: 'Guardar amigo' }).click()
    check('Amigos: no se repite la misma dirección', /Ya tienes a Beto en tus amigos/.test(await problema()), await problema())
    check('Amigos: sin errores de consola', errores.length === 0, errores.join(' | '))
    await page.reload()
    await page.waitForSelector('.lista-amigos .amigo', { timeout: 15000 })
    check('Amigos: siguen ahí al recargar', (await page.locator('.lista-amigos .amigo').count()) === 1)
    await page.close()
    // Cada cuenta tiene su lista: Carla en este navegador no ve a los amigos de "yo".
    const otra = await nuevaPagina(browser, { est: nuevoEstado(), direccion: CARLA })
    await otra.page.goto(BASE + '#/perfil/amigos')
    await otra.page.waitForSelector('.amigos', { timeout: 15000 })
    check('Amigos: cada cuenta tiene su propia lista', (await otra.page.locator('.lista-amigos .amigo').count()) === 0)
    await otra.page.close()
  }

  // C. Invitar a una tanda: elegir una de mis tandas abiertas y compartir el enlace con el nombre del amigo.
  {
    const { page } = await nuevaPagina(browser, { est: nuevoEstado(), direccion: ME })
    await sembrarAmigos(page, ME, [{ dir: BETO_DIR, apodo: 'Beto' }])
    await page.goto(BASE + '#/perfil/amigos')
    await page.waitForSelector('.lista-amigos .amigo', { timeout: 15000 })
    await page.getByRole('button', { name: 'Invitar a una tanda' }).click()
    await page.waitForSelector('.elegir-tanda', { timeout: 15000 })
    const opciones = (await page.locator('.opcion-tanda').allInnerTexts()).map(limpio)
    check('Amigos (invitar): ofrece mis tandas abiertas con lugar libre (la 3, que creé)', opciones.length === 1 && /^Tanda 3 3 personas · \$100 cada 2 min · faltan 2$/.test(opciones[0]), JSON.stringify(opciones))
    check('Amigos (invitar): con una sola, ya viene elegida', await page.locator('.opcion-tanda input').first().isChecked())
    const wa = (await page.getByRole('link', { name: 'Invitar por WhatsApp' }).getAttribute('href')) ?? ''
    const mensaje = decodeURIComponent(wa.replace('https://wa.me/?text=', ''))
    check('Amigos (invitar): el mensaje de WhatsApp lo saluda por su nombre y lleva el enlace de la tanda', wa.startsWith('https://wa.me/?text=') && /^¡Hola, Beto!/.test(mensaje) && /#\/tanda\/3/.test(mensaje), mensaje)
    check('Amigos (invitar): el enlace para copiar lleva a la tanda 3', /#\/tanda\/3$/.test(await page.getByLabel('Enlace de invitación').inputValue()))
    check('Amigos (invitar): sin jerga', !JERGA_AMIGOS.test(limpio(await page.locator('.amigos').innerText())))
    await page.setViewportSize({ width: 375, height: 800 })
    check('Amigos (375 px): sin desborde horizontal con la lista y la invitación abierta', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    await shot(page, 'ux-amigos-375')
    await page.close()
    // Sin tandas abiertas propias: lo dice y lleva a crear una.
    const est = nuevoEstado()
    est.tandas[3].tanda.estado = { tag: 'Cancelada', values: undefined }
    const v = await nuevaPagina(browser, { est, direccion: ME })
    await sembrarAmigos(v.page, ME, [{ dir: BETO_DIR, apodo: 'Beto' }])
    await v.page.goto(BASE + '#/perfil/amigos')
    await v.page.waitForSelector('.lista-amigos .amigo', { timeout: 15000 })
    await v.page.getByRole('button', { name: 'Invitar a una tanda' }).click()
    await v.page.waitForSelector('.invitar-amigo, .amigo .explica', { timeout: 15000 })
    check('Amigos (invitar): sin tandas abiertas, lo dice y ofrece crear una', /No tienes tandas abiertas con lugar libre/.test(await v.page.locator('.amigo').innerText()) && (await v.page.locator('.amigo a[href="#/crear"]').count()) === 1)
    await v.page.close()
  }

  // D. Quitar un amigo (con confirmación).
  {
    const { page } = await nuevaPagina(browser, { est: nuevoEstado(), direccion: ME })
    await sembrarAmigos(page, ME, [{ dir: BETO_DIR, apodo: 'Beto' }, { dir: CARLA, apodo: 'Carla' }])
    await page.goto(BASE + '#/perfil/amigos')
    await page.waitForSelector('.lista-amigos .amigo', { timeout: 15000 })
    await page.locator('.amigo', { hasText: 'Beto' }).getByRole('button', { name: 'Quitar' }).click()
    check('Amigos (quitar): pregunta antes y dice que solo se borra de este teléfono o computadora', /¿Quitar a Beto de tus amigos\? Solo se borra de este teléfono o computadora\./.test(limpio(await page.locator('.confirmar-quitar').innerText())))
    await page.getByRole('button', { name: 'No', exact: true }).click()
    check('Amigos (quitar): "No" lo deja como estaba', (await page.locator('.lista-amigos .amigo').count()) === 2)
    await page.locator('.amigo', { hasText: 'Beto' }).getByRole('button', { name: 'Quitar' }).click()
    await page.getByRole('button', { name: 'Sí, quitar' }).click()
    await page.waitForTimeout(300)
    const g = await guardados(page, ME)
    check('Amigos (quitar): "Sí, quitar" lo borra de la lista y del navegador', (await page.locator('.lista-amigos .amigo').count()) === 1 && g.length === 1 && g[0].apodo === 'Carla', JSON.stringify(g))
    await page.close()
  }

  // E. Desde la lista de quiénes participan (tanda 5: Beto y Carla) y desde el perfil público.
  {
    const { page, errores } = await nuevaPagina(browser, { est: nuevoEstado(), direccion: ME })
    await page.goto(BASE + '#/tanda/5')
    await page.waitForSelector('.lista-personas', { timeout: 15000 })
    await page.waitForTimeout(1200)
    check('Amigos (lista): "Agregar a mis amigos" junto a cada persona de la tanda', (await page.locator('.persona .boton-amigo').count()) === 2)
    await page.locator('.persona', { hasText: 'Beto' }).locator('.boton-amigo').click()
    check('Amigos (lista): el formulario viene con su apodo público', (await page.getByLabel('¿Cómo le dices?').inputValue()) === 'Beto')
    await page.getByRole('button', { name: 'Guardar amigo' }).click()
    await page.waitForTimeout(300)
    check('Amigos (lista): queda "Amigo: Beto" y ya no ofrece agregarlo', /Amigo: Beto/.test(await page.locator('.persona', { hasText: 'Beto' }).innerText()) && (await page.locator('.persona', { hasText: 'Beto' }).locator('.boton-amigo').count()) === 0)
    check('Amigos (lista): se guardó', (await guardados(page, ME)).some((a) => a.dir === BETO_DIR))
    check('Amigos (lista): sin errores de consola', errores.length === 0, errores.join(' | '))
    await page.close()
    // Donde "yo" estoy (tanda 9), no se ofrece agregarme a mí.
    const dentro = await nuevaPagina(browser, { est: nuevoEstadoTurnos(), direccion: ME })
    await dentro.page.goto(BASE + '#/tanda/9')
    await dentro.page.waitForSelector('.lista-personas', { timeout: 15000 })
    await dentro.page.waitForTimeout(1200)
    check('Amigos (lista): no se ofrece agregarte a ti mismo', (await dentro.page.locator('.persona.yo .boton-amigo').count()) === 0 && (await dentro.page.locator('.persona .boton-amigo').count()) === 2)
    await dentro.page.close()
    // Sin sesión, nada.
    const sin = await nuevaPagina(browser, { est: nuevoEstado(), conectado: false })
    await sin.page.goto(BASE + '#/tanda/5')
    await sin.page.waitForSelector('.lista-personas', { timeout: 15000 })
    check('Amigos (lista): sin sesión no se ofrece', (await sin.page.locator('.boton-amigo').count()) === 0)
    await sin.page.close()
    // Perfil público.
    const perfil = await nuevaPagina(browser, { est: nuevoEstado(), direccion: ME })
    await perfil.page.goto(BASE + '#/historial/' + CARLA)
    await perfil.page.waitForSelector('.perfil-amigo .boton-amigo', { timeout: 15000 })
    await perfil.page.locator('.perfil-amigo .boton-amigo').click()
    await perfil.page.getByRole('button', { name: 'Guardar amigo' }).click()
    await perfil.page.waitForTimeout(300)
    check('Amigos (perfil público): se agrega desde ahí', /Amigo: Carla/.test(await perfil.page.locator('.perfil-amigo').innerText()) && (await guardados(perfil.page, ME)).some((a) => a.dir === CARLA))
    await perfil.page.goto(BASE + '#/historial')
    await perfil.page.waitForTimeout(1500)
    check('Amigos (perfil público): en el tuyo no se ofrece', (await perfil.page.locator('.perfil-amigo').count()) === 0)
    await perfil.page.close()
  }

  // F. La campanita avisa cuando un amigo crea una tanda (la 5 la creó Beto y "yo" no estoy en ella).
  {
    const con = await nuevaPagina(browser, { est: nuevoEstado(), direccion: ME })
    await sembrarAmigos(con.page, ME, [{ dir: BETO_DIR, apodo: 'Mi socio' }])
    await con.page.goto(BASE + '#/tandas')
    await con.page.waitForSelector('.campana-numero', { timeout: 15000 }).catch(() => {})
    await con.page.locator('.boton-campana').click()
    await con.page.waitForSelector('.campana-panel', { timeout: 5000 })
    const d = (await con.page.locator('.campana-item').allInnerTexts()).map(limpio)
    check('Amigos (campanita): "Tu amigo Mi socio creó una tanda", con la tanda en una línea', d.some((x) => /^Tu amigo Mi socio creó una tanda/.test(x) && /Tanda 5: 5 personas · \$50 por semana\. Entra para unirte\./.test(x)), JSON.stringify(d))
    await con.page.close()
    const sin = await nuevaPagina(browser, { est: nuevoEstado(), direccion: ME })
    await sin.page.goto(BASE + '#/tandas')
    await sin.page.waitForSelector('.tarjeta', { timeout: 15000 }).catch(() => {})
    await sin.page.waitForTimeout(2500)
    await sin.page.locator('.boton-campana').click()
    await sin.page.waitForSelector('.campana-panel', { timeout: 5000 })
    check('Amigos (campanita): sin amigos guardados no avisa de tandas ajenas', !(await sin.page.locator('.campana-panel').innerText()).includes('Tu amigo'))
    await sin.page.close()
  }
}

await browser.close()
const fallos = resultados.filter((r) => !r.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas`)
process.exit(fallos.length ? 1 : 0)
