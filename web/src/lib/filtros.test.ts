import { describe, expect, it } from 'vitest'
import type { ResumenTanda } from './lectura'
import type { NombreNivel } from './historial'
import {
  busquedaDeFiltros,
  busquedaDelHash,
  coincideTexto,
  cuantosExtra,
  direccionesARevisar,
  duracionDe,
  filtrar,
  filtrosDeBusqueda,
  hashDeLista,
  normalizar,
  pendientesEn,
  SIN_FILTROS,
  type Contexto,
  type Filtros,
} from './filtros'

const ANA = 'GANAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const BETO = 'GBETOXQ2PLKJHGFDSAZXCVBNMQWERTYUIOP234567ASDFGHJKLZXCVB'
const CARLA = 'GCARLA7777777777777777777777777777777777777777777777777Z'
const DIA = 86_400n

type Opciones = {
  id: number
  estado?: ResumenTanda['tanda']['estado']['tag']
  creador?: string
  miembros?: string[]
  cuota?: number
  n?: number
  periodo?: bigint
  modo?: ResumenTanda['modo']
  nombre?: string | null
  morosos?: string[]
}

function tanda(o: Opciones): ResumenTanda {
  const miembros = (o.miembros ?? []).map((direccion, posicion) => ({
    direccion,
    posicion,
    atrasos: 0,
    cobro: false,
    colateral: 0n,
    colateral_inicial: 0n,
    deuda: 0n,
    moroso: (o.morosos ?? []).includes(direccion),
    multas_pendientes: 0n,
  }))
  return {
    id: o.id,
    nombre: o.nombre ?? null,
    modo: o.modo ?? 'Llegada',
    miembros,
    tanda: {
      cobertura_bps: 10_000,
      creador: o.creador ?? ANA,
      cuota: BigInt(Math.round((o.cuota ?? 20) * 10_000_000)),
      estado: { tag: o.estado ?? 'Abierta', values: undefined },
      fondo_premios: 0n,
      inicio_ronda: 0n,
      n_miembros: o.n ?? 5,
      penalidad_bps: 500,
      periodo_seg: o.periodo ?? 7n * DIA,
      retenido: 0n,
      ronda_actual: 0,
      shares_boveda: 0n,
      token: 'C',
    },
  }
}

const APODOS: Record<string, string> = { [ANA]: 'Ana', [BETO]: 'Beto Núñez' }
const NIVELES: Record<string, NombreNivel> = { [ANA]: 'Plata', [BETO]: 'Nuevo' }

function contexto(cambios: Partial<Contexto> = {}): Contexto {
  return {
    yo: null,
    nombreDe: (d) => APODOS[d] ?? null,
    nivelDe: (d) => NIVELES[d],
    pendientesDe: (r) => r.miembros.filter((m) => m.moroso).length,
    ...cambios,
  }
}

const con = (cambios: Partial<Filtros>): Filtros => ({ ...SIN_FILTROS, ...cambios })
const ids = (lista: ResumenTanda[]) => lista.map((r) => r.id)

const LISTA = [
  tanda({ id: 1, estado: 'Finalizada', creador: BETO, miembros: [BETO, CARLA], cuota: 10 }),
  tanda({ id: 2, estado: 'Cancelada', creador: ANA }),
  tanda({ id: 3, estado: 'Abierta', creador: ANA, miembros: [ANA, BETO], cuota: 50, modo: 'Subasta', nombre: 'Tanda de la Oficina' }),
  tanda({ id: 4, estado: 'Activa', creador: CARLA, miembros: [CARLA, ANA], cuota: 100, n: 12, periodo: 30n * DIA, morosos: [CARLA] }),
  tanda({ id: 5, estado: 'Abierta', creador: BETO, miembros: [BETO], cuota: 20, n: 3, periodo: 180n }),
]

describe('estado', () => {
  it('sin sesión, "Todas" esconde las canceladas', () => {
    expect(ids(filtrar(LISTA, SIN_FILTROS, contexto()))).toEqual([1, 3, 4, 5])
  })
  it('con "Mostrar canceladas" aparecen en Todas y en Terminadas', () => {
    expect(ids(filtrar(LISTA, con({ canceladas: true }), contexto()))).toEqual([1, 2, 3, 4, 5])
    expect(ids(filtrar(LISTA, con({ estado: 'terminadas', canceladas: true }), contexto()))).toEqual([1, 2])
    expect(ids(filtrar(LISTA, con({ estado: 'terminadas' }), contexto()))).toEqual([1])
  })
  it('con sesión empieza en "Mis tandas": las que creó o en las que está', () => {
    expect(ids(filtrar(LISTA, SIN_FILTROS, contexto({ yo: CARLA })))).toEqual([1, 4])
  })
  it('abiertas y en curso', () => {
    expect(ids(filtrar(LISTA, con({ estado: 'abiertas' }), contexto()))).toEqual([3, 5])
    expect(ids(filtrar(LISTA, con({ estado: 'en-curso' }), contexto()))).toEqual([4])
  })
})

describe('búsqueda por texto', () => {
  const ctx = contexto()
  it('por número: "3", "#3" o "tanda 3"', () => {
    for (const q of ['3', '#3', 'Tanda 3', 'tanda3']) expect(ids(filtrar(LISTA, con({ q }), ctx))).toEqual([3])
  })
  it('por nombre, sin importar mayúsculas ni tildes', () => {
    expect(ids(filtrar(LISTA, con({ q: 'oficina' }), ctx))).toEqual([3])
    expect(ids(filtrar(LISTA, con({ q: 'TANDA DE LA ofícina' }), ctx))).toEqual([3])
  })
  it('por el apodo de quien la creó o de alguien que está en ella', () => {
    expect(ids(filtrar(LISTA, con({ q: 'beto' }), ctx))).toEqual([1, 3, 5])
    expect(ids(filtrar(LISTA, con({ q: 'nunez' }), ctx))).toEqual([1, 3, 5])
    expect(ids(filtrar(LISTA, con({ q: 'ana' }), ctx))).toEqual([3, 4])
  })
  it('por un pedazo de la dirección, desde 4 letras', () => {
    expect(ids(filtrar(LISTA, con({ q: 'GCARLA7' }), ctx))).toEqual([1, 4])
    expect(ids(filtrar(LISTA, con({ q: CARLA.toLowerCase() }), ctx))).toEqual([1, 4])
    // Tres letras de una dirección no bastan (podría ser un nombre).
    expect(coincideTexto(LISTA[3], 'gca', ctx)).toBe(false)
  })
  it('sin coincidencias, la lista queda vacía', () => {
    expect(filtrar(LISTA, con({ q: 'zzzz nadie' }), ctx)).toEqual([])
  })
  it('normaliza espacios y tildes', () => {
    expect(normalizar('  Tanda  de la  OFICINA ')).toBe('tanda de la oficina')
    expect(normalizar('Núñez')).toBe('nunez')
  })
})

describe('filtros', () => {
  const ctx = contexto()
  it('tipo de turnos', () => {
    expect(ids(filtrar(LISTA, con({ tipo: 'Subasta' }), ctx))).toEqual([3])
  })
  it('cuota: desde, hasta y entre (en dólares, bordes incluidos)', () => {
    expect(ids(filtrar(LISTA, con({ cuotaMin: 50 }), ctx))).toEqual([3, 4])
    expect(ids(filtrar(LISTA, con({ cuotaMax: 20 }), ctx))).toEqual([1, 5])
    expect(ids(filtrar(LISTA, con({ cuotaMin: 20, cuotaMax: 50 }), ctx))).toEqual([3, 5])
  })
  it('duración de la tanda completa', () => {
    expect(duracionDe(LISTA[4])).toBe('dias') // 3 turnos de 3 min
    expect(duracionDe(LISTA[0])).toBe('semanas') // 5 semanas
    expect(duracionDe(LISTA[3])).toBe('meses') // 12 meses
    expect(duracionDe(tanda({ id: 9, n: 1, periodo: 7n * DIA }))).toBe('semanas') // justo una semana
    expect(duracionDe(tanda({ id: 9, n: 2, periodo: 30n * DIA }))).toBe('meses') // justo dos meses
    expect(ids(filtrar(LISTA, con({ duracion: 'meses' }), ctx))).toEqual([4])
  })
  it('reputación mínima de quien la creó; si no se sabe todavía, no se muestra', () => {
    expect(ids(filtrar(LISTA, con({ nivel: 'Bronce' }), ctx))).toEqual([3])
    expect(ids(filtrar(LISTA, con({ nivel: 'Oro' }), ctx))).toEqual([])
  })
  it('sin personas con pagos pendientes', () => {
    expect(ids(filtrar(LISTA, con({ sinPendientes: true }), ctx))).toEqual([1, 3, 5])
  })
  it('todo junto', () => {
    expect(ids(filtrar(LISTA, con({ estado: 'abiertas', cuotaMax: 30, q: 'beto' }), ctx))).toEqual([5])
  })
  it('cuenta los filtros de "Más filtros"', () => {
    expect(cuantosExtra(SIN_FILTROS)).toBe(0)
    expect(cuantosExtra(con({ q: 'ana', estado: 'abiertas' }))).toBe(0)
    expect(cuantosExtra(con({ tipo: 'Sorteo', cuotaMax: 10, sinPendientes: true, canceladas: true }))).toBe(4)
  })
})

describe('pagos pendientes y reputación (lo que hay que leer)', () => {
  const sinMora = { veces_moroso: 1, deudas_saldadas: 1 }
  const conMora = { veces_moroso: 2, deudas_saldadas: 1 }
  it('cuenta a quien debe en esta tanda o, según su reputación, en otra', () => {
    const historial = (d: string) => (d === ANA ? conMora : d === BETO ? sinMora : undefined)
    expect(pendientesEn(LISTA[2], historial)).toBe(1) // Ana debe en otra tanda
    expect(pendientesEn(LISTA[3], historial)).toBe(2) // Carla es morosa aquí y Ana debe en otra
    expect(pendientesEn(LISTA[4], historial)).toBe(0)
  })
  it('en una tanda terminada no importa', () => {
    expect(pendientesEn(LISTA[0], () => conMora)).toBe(0)
  })
  it('lee a la gente de las tandas que siguen y, si se filtra por reputación, a quien las creó', () => {
    expect(direccionesARevisar(LISTA, false)).toEqual([ANA, BETO, CARLA].sort())
    expect(direccionesARevisar([LISTA[0]], false)).toEqual([])
    expect(direccionesARevisar([LISTA[0]], true)).toEqual([BETO])
  })
})

describe('la URL', () => {
  it('ida y vuelta', () => {
    const f = con({ q: 'ana', estado: 'abiertas', tipo: 'Subasta', cuotaMin: 10, cuotaMax: 50, duracion: 'meses', nivel: 'Plata', sinPendientes: true, canceladas: true })
    const qs = busquedaDeFiltros(f)
    expect(qs).toBe('q=ana&estado=abiertas&tipo=Subasta&cuota=10-50&duracion=meses&nivel=Plata&sinpendientes=1&canceladas=1')
    expect(filtrosDeBusqueda(qs)).toEqual(f)
  })
  it('sin filtros, la lista queda en #/tandas', () => {
    expect(busquedaDeFiltros(SIN_FILTROS)).toBe('')
    expect(hashDeLista(SIN_FILTROS)).toBe('#/tandas')
    expect(hashDeLista(con({ cuotaMax: 20 }))).toBe('#/tandas?cuota=-20')
  })
  it('lee el hash compartido', () => {
    expect(busquedaDelHash('#/tandas?cuota=10-&tipo=Sorteo')).toBe('cuota=10-&tipo=Sorteo')
    expect(busquedaDelHash('#/tandas')).toBe('')
    expect(filtrosDeBusqueda('cuota=10-')).toEqual(con({ cuotaMin: 10 }))
    expect(filtrosDeBusqueda('cuota=7,5-')).toEqual(con({ cuotaMin: 7.5 }))
  })
  it('ignora lo que no entiende', () => {
    expect(filtrosDeBusqueda('estado=raro&tipo=Nada&cuota=abc-x&nivel=Nuevo&duracion=siglos&sinpendientes=si')).toEqual(SIN_FILTROS)
    expect(filtrosDeBusqueda('cuota=-5-').cuotaMin).toBe(null)
    expect(filtrosDeBusqueda(`q=${'a'.repeat(200)}`).q).toHaveLength(80)
  })
})
