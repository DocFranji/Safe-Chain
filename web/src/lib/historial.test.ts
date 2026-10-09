import { describe, expect, it } from 'vitest'
import type { Historial } from 'historial'
import { desglose, descuentoDe, esDireccion, nivelDePuntaje, problemaApodo, puntajeDe, siguienteNivel, sinHistorial } from './historial'

const vacio: Historial = {
  cuotas_a_tiempo: 0,
  cuotas_tarde: 0,
  cuotas_cubiertas: 0,
  veces_moroso: 0,
  deudas_saldadas: 0,
  tandas_cumplidas: 0,
  tandas_con_atrasos: 0,
  cobros: 0,
  monto_pagado: 0n,
  puntos_positivos: 0,
  puntos_negativos: 0,
  primera_actividad: 0n,
  ultima_actividad: 0n,
}

describe('puntaje y nivel (igual que el contrato)', () => {
  it('empieza en cero, Nuevo y sin descuento', () => {
    expect(puntajeDe(vacio)).toBe(0)
    expect(nivelDePuntaje(0)).toBe('Nuevo')
    expect(descuentoDe(vacio)).toBe(0)
    expect(sinHistorial(vacio)).toBe(true)
  })
  it('respeta los límites de cada nivel', () => {
    expect(nivelDePuntaje(99)).toBe('Nuevo')
    expect(nivelDePuntaje(100)).toBe('Bronce')
    expect(nivelDePuntaje(299)).toBe('Bronce')
    expect(nivelDePuntaje(300)).toBe('Plata')
    expect(nivelDePuntaje(600)).toBe('Oro')
  })
  it('el puntaje nunca baja de cero', () => {
    expect(puntajeDe({ puntos_positivos: 10, puntos_negativos: 100 })).toBe(0)
    expect(puntajeDe({ puntos_positivos: 400, puntos_negativos: 100 })).toBe(300)
  })
  it('da descuento por nivel, pero no con mora sin saldar', () => {
    const plata = { ...vacio, puntos_positivos: 300 }
    expect(descuentoDe(plata)).toBe(25)
    expect(descuentoDe({ ...plata, veces_moroso: 1 })).toBe(0)
    expect(descuentoDe({ ...plata, veces_moroso: 1, deudas_saldadas: 1 })).toBe(25)
    expect(descuentoDe({ ...vacio, puntos_positivos: 600 })).toBe(50)
  })
  it('dice cuánto falta para el siguiente nivel', () => {
    expect(siguienteNivel(0)).toEqual({ nombre: 'Bronce', faltan: 100 })
    expect(siguienteNivel(110)).toEqual({ nombre: 'Plata', faltan: 190 })
    expect(siguienteNivel(600)).toBeNull()
  })
})

describe('desglose', () => {
  it('solo muestra lo que no es cero, en singular o plural', () => {
    expect(desglose(vacio)).toEqual([])
    expect(desglose({ ...vacio, cuotas_a_tiempo: 12, cuotas_tarde: 1, veces_moroso: 1, tandas_cumplidas: 2 })).toEqual([
      '12 cuotas pagadas a tiempo',
      '1 cuota pagada tarde',
      '2 tandas terminadas sin atrasos',
      '1 vez en mora',
    ])
  })
})

describe('esDireccion', () => {
  it('acepta G... y C... de 56 caracteres', () => {
    expect(esDireccion('GB2NSL6RGGWODEWQLUP4MD3LC7PMJ775RLGI7TCPT3NJBE2FOUED5BNK')).toBe(true)
    expect(esDireccion('GB2NSL6')).toBe(false)
    expect(esDireccion('G' + 'A'.repeat(55))).toBe(false) // forma correcta, código de verificación no
    expect(esDireccion('hola')).toBe(false)
  })
})

describe('problemaApodo (mismas reglas que el contrato)', () => {
  it('acepta nombres comunes con tildes y ñ', () => {
    for (const a of ['Ana', 'Jo', 'Doña Ñeca', 'José_23', 'a.b-c', 'Mamá Rosa', 'x'.repeat(24)]) {
      expect(problemaApodo(a), a).toBeNull()
    }
  })
  it('explica qué está mal', () => {
    expect(problemaApodo('A')).toMatch(/al menos 2/)
    expect(problemaApodo('x'.repeat(25))).toMatch(/máximo 24/)
    expect(problemaApodo(' Ana')).toMatch(/espacios del inicio/)
    expect(problemaApodo('Ana  Bo')).toMatch(/dos espacios/)
    expect(problemaApodo('ana@x')).toMatch(/solo letras/)
    expect(problemaApodo('аna')).toMatch(/solo letras/) // "а" cirílica
    expect(problemaApodo('😀😀')).toMatch(/solo letras/)
  })
})
