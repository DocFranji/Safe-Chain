import { describe, expect, it, vi } from 'vitest'
import { direccionCorta, nombreDe, parsearNombres } from './nombres'

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
