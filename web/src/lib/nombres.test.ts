import { describe, expect, it, vi } from 'vitest'
import { direccionCorta, fijarApodo, nombreDe, parsearNombres, suscribirApodos, usarLectorDeApodos } from './nombres'

describe('parsearNombres (VITE_NOMBRES)', () => {
  it('lee un JSON de dirección -> nombre', () => {
    expect(parsearNombres('{"GAAA":"Ana","GBBB":"Beto"}')).toEqual({ GAAA: 'Ana', GBBB: 'Beto' })
  })

  it('sin valor, devuelve vacío', () => {
    expect(parsearNombres(undefined)).toEqual({})
    expect(parsearNombres('')).toEqual({})
    expect(parsearNombres('   ')).toEqual({})
  })

  it('ignora lo que no sirve y no se rompe', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parsearNombres('esto no es json')).toEqual({})
    expect(parsearNombres('["Ana"]')).toEqual({})
    expect(parsearNombres('{"GAAA":"Ana","GBBB":7,"GCCC":""}')).toEqual({ GAAA: 'Ana' })
    expect(aviso).toHaveBeenCalledTimes(2)
    aviso.mockRestore()
  })
})

describe('nombreDe', () => {
  it('usa el nombre conocido o la dirección corta', () => {
    expect(nombreDe('GADMQOSHB74SMBATS6IF67ZKS2KJPQC4FOM6NDGGWADEUT253XCATVPD')).toBe('Ana')
    expect(nombreDe('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX1234')).toBe('GXXX…1234')
    expect(direccionCorta('GABCDEFGH')).toBe('GABC…EFGH')
  })
})

describe('apodos (M2, N4)', () => {
  const G = 'GB2NSL6RGGWODEWQLUP4MD3LC7PMJ775RLGI7TCPT3NJBE2FOUED5BNK'
  it('el apodo va con la dirección corta, para que nadie se haga pasar por otro', async () => {
    fijarApodo(G, 'Doña Ana')
    expect(nombreDe(G)).toBe('Doña Ana')
    fijarApodo(G, null)
    expect(nombreDe(G)).toBe('GB2N…5BNK')
    await new Promise((r) => setTimeout(r, 60)) // deja salir el aviso pendiente
  })
  it('pide cada apodo una sola vez y avisa cuando llega', async () => {
    vi.useFakeTimers()
    const D = 'GDPIB76VVYNDJINI6BRYGVOKTPOTERZABL43OB7DIOCLTXSKEUMJWNUO'
    const lector = vi.fn(async () => 'Tía Carla')
    const oyente = vi.fn()
    usarLectorDeApodos(lector)
    const quitar = suscribirApodos(oyente)
    expect(nombreDe(D)).toBe('GDPI…WNUO') // todavía no llegó
    nombreDe(D)
    await vi.runAllTimersAsync()
    expect(lector).toHaveBeenCalledTimes(1)
    expect(oyente).toHaveBeenCalled()
    expect(nombreDe(D)).toBe('Tía Carla')
    quitar()
    usarLectorDeApodos(null)
    vi.useRealTimers()
  })
})
