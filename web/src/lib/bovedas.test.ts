import { describe, expect, it } from 'vitest'
import {
  aproximado,
  alcanzaPara,
  edad,
  evaluarPrincipal,
  evaluarRapida,
  libreParaIntereses,
  precio,
  precioLineal,
  rindeDemo,
  type DatosBoveda,
} from './bovedas'

const U = 10_000_000n
const ESCALA = 10_000_000n
const T0 = 1_790_000_000
const DIA = 86_400
const ANIO = 365 * DIA
const MILES = '[\\s\\u00a0\\u202f.]?' // separador de miles de es-CR

/** Bóveda recién desplegada en T0, sin depósitos y con 10 000 TUSD para intereses. */
const boveda = (o: Partial<DatosBoveda> = {}): DatosBoveda => ({
  aprBps: 500,
  acelerador: 1,
  inicio: T0,
  totalShares: 0n,
  saldo: 10_000n * U,
  ...o,
})
const rapida = (o: Partial<DatosBoveda> = {}) => boveda({ acelerador: 52_560, ...o })

describe('precio (la misma fórmula que el contrato)', () => {
  it('empieza en 1,0 y sube en línea recta: 5 % en un año sin acelerar', () => {
    expect(precioLineal(boveda(), T0)).toBe(ESCALA)
    expect(precioLineal(boveda(), T0 + ANIO)).toBe(10_500_000n)
    // Reloj del navegador un poco atrasado: nunca antes del inicio.
    expect(precioLineal(boveda(), T0 - 100)).toBe(ESCALA)
  })

  it('la rápida (×52 560) vale 8,2 un día después de desplegarse', () => {
    expect(precioLineal(rapida(), T0 + DIA)).toBe(82_000_000n)
  })

  it('tope de solvencia: nunca más que saldo / participaciones, y nunca 0', () => {
    const d = rapida({ totalShares: 1_000n * U, saldo: 1_000n * U })
    expect(precio(d, T0 + DIA)).toBe(ESCALA)
    expect(precio(rapida({ totalShares: 5n, saldo: 0n }), T0 + DIA)).toBe(1n)
  })
})

describe('libreParaIntereses', () => {
  it('saldo menos lo que valen todas las participaciones', () => {
    // 10 minutos después: precio 1,05; 600 participaciones valen 630 TUSD.
    expect(libreParaIntereses(rapida({ totalShares: 600n * U }), T0 + 600)).toBe(9_370n * U)
    expect(libreParaIntereses(boveda(), T0)).toBe(10_000n * U)
  })

  it('no se sabe con la versión anterior de la bóveda', () => {
    expect(libreParaIntereses(boveda({ totalShares: null }), T0)).toBeNull()
  })
})

describe('rindeDemo (100 TUSD durante 5 minutos)', () => {
  it('rápida nueva: 2,50 TUSD; un día después, unas 8 veces menos', () => {
    expect(rindeDemo(rapida(), T0)).toBe(25_000_000n)
    expect(rindeDemo(rapida(), T0 + DIA)).toBe(3_048_780n)
  })

  it('nunca más de lo que le queda libre', () => {
    expect(rindeDemo(rapida({ totalShares: 1_000n * U, saldo: 1_001n * U }), T0)).toBe(1n * U)
  })
})

describe('alcanzaPara', () => {
  it('lo libre dividido por los intereses de lo depositado hoy', () => {
    // 1 000 TUSD depositados al 5 %: 50 TUSD libres alcanzan para un año.
    const s = alcanzaPara(boveda({ totalShares: 1_000n * U, saldo: 1_050n * U }), T0)
    expect(s).not.toBeNull()
    expect(Math.abs((s as number) - ANIO)).toBeLessThan(DIA)
  })

  it('null si nadie depositó o si no se sabe', () => {
    expect(alcanzaPara(boveda(), T0)).toBeNull()
    expect(alcanzaPara(boveda({ totalShares: null }), T0)).toBeNull()
  })
})

describe('textos de tiempo', () => {
  it('aproximado', () => {
    expect(aproximado(1_800)).toBe('menos de una hora')
    expect(aproximado(3_600)).toBe('una hora')
    expect(aproximado(5 * 3_600)).toBe('unas 5 horas')
    expect(aproximado(3 * DIA)).toBe('unos 3 días')
    expect(aproximado(100 * DIA)).toBe('unos 3 meses')
    expect(aproximado(400 * DIA)).toBe('más de un año')
    expect(aproximado(3 * ANIO)).toBe('más de 3 años')
    expect(aproximado(20 * ANIO)).toBe('más de 10 años')
  })

  it('edad', () => {
    expect(edad(30)).toBe('1 minuto')
    expect(edad(600)).toBe('10 minutos')
    expect(edad(3_600)).toBe('1 hora')
    expect(edad(5 * 3_600)).toBe('5 horas')
    expect(edad(3 * DIA)).toBe('3 días')
  })
})

describe('evaluarPrincipal', () => {
  it('ok con fondos: dice el ritmo real y lo libre', () => {
    const r = evaluarPrincipal(boveda({ saldo: 5_000n * U }), T0)
    expect(r.nivel).toBe('ok')
    expect(r.detalle).toMatch(/ritmo de la vida real \(5 % al año\)/)
    expect(r.detalle).toMatch(new RegExp(`5${MILES}000 TUSD libres`))
    expect(r.solucion).toBeUndefined()
  })

  it('cuenta las garantías aparte: 5 000 TUSD de saldo pero solo 50 libres -> aviso con el comando', () => {
    const r = evaluarPrincipal(boveda({ totalShares: 4_950n * U, saldo: 5_000n * U }), T0)
    expect(r.nivel).toBe('aviso')
    expect(r.detalle).toMatch(/50 TUSD libres/)
    expect(r.solucion).toMatch(/mint --to \$BOVEDA /)
    expect(r.solucion).toMatch(/nadie pierde lo que depositó/)
  })

  it('aviso si lo libre no alcanza para un año de intereses de lo depositado', () => {
    const r = evaluarPrincipal(boveda({ totalShares: 10_000n * U, saldo: 10_300n * U }), T0)
    expect(r.nivel).toBe('aviso')
    expect(r.detalle).toMatch(/alcanzan para unos 7 meses/)
  })

  it('versión anterior: una sola bóveda acelerada y vieja -> aviso que propone el despliegue nuevo', () => {
    const r = evaluarPrincipal(rapida({ totalShares: null, saldo: 3_000n * U }), T0 + DIA)
    expect(r.nivel).toBe('aviso')
    expect(r.detalle).toMatch(/contando las garantías/)
    expect(r.solucion).toMatch(/desplegar_testnet\.sh/)
  })
})

describe('evaluarRapida', () => {
  it('nueva y con fondos: ok, con el acelerador y lo que rinde una demo', () => {
    const r = evaluarRapida(rapida({ totalShares: 600n * U, saldo: 10_600n * U }), boveda(), T0 + 60)
    expect(r.nivel).toBe('ok')
    expect(r.detalle).toMatch(/1 minuto equivale a 36,5 días de intereses/)
    expect(r.detalle).toMatch(/Una demo de 5 minutos rinde hoy ~2,4\d TUSD por cada 100/)
  })

  it('vieja: aviso que dice su edad y el comando para cambiarla', () => {
    const r = evaluarRapida(rapida(), boveda(), T0 + 3 * DIA)
    expect(r.nivel).toBe('aviso')
    expect(r.solucion).toMatch(/se desplegó hace 3 días/)
    expect(r.solucion).toMatch(/renovar_boveda_rapida\.sh/)
  })

  it('nueva pero casi sin dinero para intereses: aviso con el comando para recargarla', () => {
    const r = evaluarRapida(rapida({ totalShares: 600n * U, saldo: 700n * U }), boveda(), T0)
    expect(r.nivel).toBe('aviso')
    expect(r.solucion).toMatch(/mint --to \$BOVEDA_RAPIDA/)
    expect(r.solucion).not.toMatch(/se desplegó hace/)
  })

  it('sin bóveda rápida: aviso (las tandas de prueba rinden al ritmo real) salvo en la versión anterior', () => {
    const sin = evaluarRapida(null, boveda(), T0)
    expect(sin.nivel).toBe('aviso')
    expect(sin.solucion).toMatch(/renovar_boveda_rapida\.sh/)
    expect(evaluarRapida(null, rapida({ totalShares: null }), T0).nivel).toBe('ok')
    expect(evaluarRapida(null, null, T0).nivel).toBe('aviso')
  })
})
