import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { ME, ANA, nuevoEstado } from './mock.mjs'
import { BASE_URL, nuevaPagina, opcionesNavegador } from './helpers.mjs'

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
  await page.locator('#periodo').fill('40')
  await page.locator('#cobertura').fill('100')
  await page.locator('select[aria-label="Unidad de tiempo"]').selectOption('dias')
  check('Crear: más de 25 días muestra la nota de precaución', /no se ha probado con plazos tan/.test(await texto(page)))
  await page.getByRole('button', { name: 'Semanal' }).click()
  check('Preset "Semanal" rellena el formulario', (await page.locator('#cuota').inputValue()) === '50' && (await page.locator('#periodo').inputValue()) === '7')
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
  check('Estado: 7 puntos revisados (5 de red + 2 de Freighter)', (await page.locator('.chequeo').count()) === 7, `n=${await page.locator('.chequeo').count()}`)
  check('Estado: muestra el saldo de la bóveda', /La bóveda tiene 10[\s.\u00a0]?000 TUSD/.test(t))
  check('Estado: da los enlaces de la demo', /#\/demo/.test(t))
  await shot(page, '14-estado-ok')
  check('Estado: sin errores de consola', errores.length === 0, errores.join(' | '))
  await page.close()
}
{
  const est = nuevoEstado()
  est.cuentas[(await import('./mock.mjs')).BOVEDA_ID].saldo = 300n * 10_000_000n
  est.faucetStatus = 503
  const { page } = await nuevaPagina(browser, { est })
  await page.goto(BASE + '#/estado')
  await page.waitForSelector('.estado-resumen', { timeout: 20000 })
  const t = await texto(page)
  check('Estado: bóveda casi vacía y faucet sin llave -> "Hay 2 problemas"', /Hay 2 problemas/.test(t), t.slice(0, 400))
  check('Estado: explica el comando para recargar la bóveda', /mint --to \$BOVEDA/.test(t))
  check('Estado: explica que falta FAUCET_ISSUER_SECRET', /FAUCET_ISSUER_SECRET/.test(t))
  await shot(page, '15-estado-problemas')
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

await browser.close()
const fallos = resultados.filter((r) => !r.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas`)
process.exit(fallos.length ? 1 : 0)
