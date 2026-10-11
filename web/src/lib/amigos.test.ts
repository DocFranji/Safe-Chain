import { describe, expect, it } from 'vitest'
import {
  APODO_AMIGO_MAX,
  apodoDeAmigo,
  claveAmigos,
  conAmigo,
  esCuenta,
  guardarAmigos,
  leerAmigos,
  limpiarApodo,
  limpiarDireccion,
  MAX_AMIGOS,
  problemaDeAmigo,
  sinAmigo,
  type Amigo,
} from './amigos'

// Cuentas de la demo (las mismas del mock del e2e): son direcciones válidas con su código de verificación.
const ANA = 'GADMQOSHB74SMBATS6IF67ZKS2KJPQC4FOM6NDGGWADEUT253XCATVPD'
const BETO = 'GBPDH2E2EX5D7DO76YRIX477LPJWNPB7MJZRTEDJWBKZMS5KTLLRU2LO'
const CARLA = 'GDPIB76VVYNDJINI6BRYGVOKTPOTERZABL43OB7DIOCLTXSKEUMJWNUN'

function almacen(inicial?: string) {
  let guardado = inicial ?? null
  return {
    getItem: () => guardado,
    setItem: (_k: string, v: string) => {
      guardado = v
    },
    crudo: () => guardado,
  }
}

describe('esCuenta y limpiarDireccion', () => {
  it('una cuenta válida; no un contrato ni una dirección con un error de tipeo', () => {
    expect(esCuenta(ANA)).toBe(true)
    expect(esCuenta(ANA.slice(0, -1) + 'A')).toBe(false)
    expect(esCuenta('CAUT2PXKDEKE4ZWNXULA23SYRCK25FLQBXO3IV2HYVVY5JIKVKXURQ2Q')).toBe(false)
    expect(esCuenta('')).toBe(false)
  })

  it('al pegar se quitan espacios y saltos de línea', () => {
    expect(limpiarDireccion(`  ${ANA.slice(0, 20)}\n${ANA.slice(20)} `)).toBe(ANA)
    expect(limpiarDireccion(ANA.toLowerCase())).toBe(ANA)
  })
})

describe('limpiarApodo', () => {
  it('sin espacios al inicio, al final ni dobles', () => {
    expect(limpiarApodo('  Mi   hermano  ')).toBe('Mi hermano')
    expect(limpiarApodo('Beto')).toBe('Beto')
  })
})

describe('problemaDeAmigo', () => {
  const amigos: Amigo[] = [{ dir: BETO, apodo: 'Beto' }]

  it('una dirección y un apodo buenos no tienen problema', () => {
    expect(problemaDeAmigo(CARLA, 'Carla', ANA, amigos)).toBeNull()
  })

  it('la dirección: vacía, inválida, la tuya o repetida (dice cómo se llama)', () => {
    expect(problemaDeAmigo('', 'Carla', ANA, amigos)).toMatchObject({ campo: 'dir', texto: expect.stringMatching(/Pega la dirección/) })
    expect(problemaDeAmigo('GABC', 'Carla', ANA, amigos)).toMatchObject({ campo: 'dir', texto: expect.stringMatching(/no es válida/) })
    expect(problemaDeAmigo(ANA, 'Yo', ANA, amigos)).toMatchObject({ campo: 'dir', texto: 'Esa dirección es la tuya.' })
    expect(problemaDeAmigo(BETO, 'Otro', ANA, amigos)).toEqual({ campo: 'dir', texto: 'Ya tienes a Beto en tus amigos.' })
  })

  it('el apodo: obligatorio y no muy largo', () => {
    expect(problemaDeAmigo(CARLA, '', ANA, amigos)).toMatchObject({ campo: 'apodo' })
    expect(problemaDeAmigo(CARLA, 'x'.repeat(APODO_AMIGO_MAX), ANA, amigos)).toBeNull()
    expect(problemaDeAmigo(CARLA, 'x'.repeat(APODO_AMIGO_MAX + 1), ANA, amigos)).toMatchObject({ campo: 'apodo', texto: `Usa como máximo ${APODO_AMIGO_MAX} caracteres.` })
  })

  it('cuenta caracteres, no bytes (las tildes y los emojis valen uno)', () => {
    expect(problemaDeAmigo(CARLA, 'ñ'.repeat(APODO_AMIGO_MAX), ANA, amigos)).toBeNull()
    expect(problemaDeAmigo(CARLA, 'Mamá ❤', ANA, amigos)).toBeNull()
  })

  it('no se pasa del máximo de amigos', () => {
    const muchos = Array.from({ length: MAX_AMIGOS }, (_, i) => ({ dir: `G${i}`, apodo: `A${i}` }))
    expect(problemaDeAmigo(CARLA, 'Carla', ANA, muchos)).toMatchObject({ campo: 'dir', texto: expect.stringMatching(/quita alguno/) })
  })
})

describe('guardar y leer amigos', () => {
  it('cada cuenta tiene su lista, con la clave de siempre', () => {
    expect(claveAmigos(ANA)).toBe(`rounda:amigos:${ANA}`)
    const a = almacen()
    expect(guardarAmigos(a, ANA, [{ dir: BETO, apodo: 'Beto' }])).toBe(true)
    expect(JSON.parse(a.crudo() ?? '')).toEqual([{ dir: BETO, apodo: 'Beto' }])
    expect(leerAmigos(a, ANA)).toEqual([{ dir: BETO, apodo: 'Beto' }])
  })

  it('agregar y quitar mantienen el orden y no repiten por dirección', () => {
    let lista: Amigo[] = []
    lista = conAmigo(lista, { dir: BETO, apodo: 'Beto' })
    lista = conAmigo(lista, { dir: CARLA, apodo: 'Carla' })
    lista = conAmigo(lista, { dir: BETO, apodo: 'Mi hermano' })
    expect(lista).toEqual([
      { dir: CARLA, apodo: 'Carla' },
      { dir: BETO, apodo: 'Mi hermano' },
    ])
    expect(sinAmigo(lista, CARLA)).toEqual([{ dir: BETO, apodo: 'Mi hermano' }])
    expect(apodoDeAmigo(lista, BETO)).toBe('Mi hermano')
    expect(apodoDeAmigo(lista, ANA)).toBeNull()
  })

  it('lo guardado que no sirve se ignora (y lo bueno se conserva)', () => {
    expect(leerAmigos(almacen('{no es json'), ANA)).toEqual([])
    expect(leerAmigos(almacen('{"dir":"x"}'), ANA)).toEqual([])
    const mezcla = [{ dir: BETO, apodo: 'Beto' }, { dir: 'GMAL', apodo: 'Mala' }, { dir: CARLA, apodo: '' }, null, { dir: BETO, apodo: 'Repetido' }]
    expect(leerAmigos(almacen(JSON.stringify(mezcla)), ANA)).toEqual([{ dir: BETO, apodo: 'Beto' }])
  })

  it('sin almacenamiento nada se rompe', () => {
    expect(leerAmigos(null, ANA)).toEqual([])
    expect(guardarAmigos(null, ANA, [])).toBe(false)
    const lleno = { getItem: () => null, setItem: () => { throw new Error('lleno') } }
    expect(guardarAmigos(lleno, ANA, [{ dir: BETO, apodo: 'Beto' }])).toBe(false)
  })
})
