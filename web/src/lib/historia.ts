// Convierte los eventos del contrato en una historia legible ("Ana no pagó: su garantía cubrió 100 TUSD").
// Es lógica pura, sin red ni React: la prueba (historia.test.ts) cubre cada tipo de evento.
import type { ContractEvent } from 'tanda'

/** Un evento ya leído de la red, con el momento en que se cerró su ledger. */
export type EventoTanda = {
  /** Identificador del evento: crece con el tiempo, sirve para ordenar. */
  id: string
  ledger: number
  /** Fecha y hora (ISO) en que la red lo registró. */
  cerradoEn: string
  evento: ContractEvent
}

/** `clave` = los momentos que explican la idea de la tanda (la garantía cubriendo a quien no pagó). */
export type TipoEntrada = 'info' | 'pago' | 'ok' | 'clave' | 'alerta'

export type EntradaHistoria = {
  id: string
  cerradoEn: string
  tipo: TipoEntrada
  titulo: string
  detalle?: string
}

export type Formato = {
  nombre: (direccion: string) => string
  monto: (valor: bigint) => string
  simbolo: string
}

export function ordenar(eventos: EventoTanda[]): EventoTanda[] {
  return [...eventos].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** De cronológico a frases. Un evento al que le falten datos se cuenta con lo que haya. */
export function narrar(eventos: EventoTanda[], f: Formato): EntradaHistoria[] {
  const dinero = (v: bigint | undefined) => (v === undefined ? '—' : `${f.monto(v)} ${f.simbolo}`)
  const quien = (d: string | undefined) => (d === undefined ? 'Alguien' : f.nombre(d))
  const ronda = (r: number | undefined) => (r === undefined ? '' : `Ronda ${r + 1}`)

  return ordenar(eventos).map((e): EntradaHistoria => {
    const base = { id: e.id, cerradoEn: e.cerradoEn }
    const ev = e.evento
    switch (ev.name) {
      case 'EvCreada':
        return {
          ...base,
          tipo: 'info',
          titulo: 'Se creó la tanda',
          detalle: [
            ev.data.n_miembros !== undefined ? `${ev.data.n_miembros} personas` : null,
            ev.data.cuota !== undefined ? `cuota de ${dinero(ev.data.cuota)}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }
      case 'EvUnido':
        return {
          ...base,
          tipo: 'info',
          titulo: `${quien(ev.data.miembro)} se unió`,
          detalle: [
            ev.data.posicion !== undefined ? `Turno ${ev.data.posicion + 1}` : null,
            ev.data.colateral !== undefined ? `dejó ${dinero(ev.data.colateral)} de garantía` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }
      case 'EvIniciada':
        return { ...base, tipo: 'ok', titulo: 'Se completó el cupo: arranca la ronda 1' }
      case 'EvPago':
        return ev.data.tarde
          ? {
              ...base,
              tipo: 'alerta',
              titulo: `${quien(ev.data.miembro)} pagó tarde`,
              detalle: `${ronda(ev.data.ronda)}: se anota una multa que se descuenta de su garantía al final`.replace(/^: /, ''),
            }
          : { ...base, tipo: 'pago', titulo: `${quien(ev.data.miembro)} pagó su cuota`, detalle: ronda(ev.data.ronda) || undefined }
      case 'EvCubierto':
        return {
          ...base,
          tipo: 'clave',
          titulo: `${quien(ev.data.miembro)} no pagó: su garantía cubrió ${dinero(ev.data.monto)}`,
          detalle: `${ronda(ev.data.ronda)}: el grupo no pierde nada y quien cobra recibe la bolsa completa`.replace(/^: /, ''),
        }
      case 'EvMoroso':
        return {
          ...base,
          tipo: 'alerta',
          titulo: `${quien(ev.data.miembro)} quedó en mora`,
          detalle: `Su garantía ya no alcanzó: debe ${dinero(ev.data.deuda)}`,
        }
      case 'EvRonda': {
        const pagado = ev.data.monto_pagado ?? 0n
        return pagado > 0n
          ? {
              ...base,
              tipo: 'ok',
              titulo: `${quien(ev.data.beneficiario)} cobró ${dinero(pagado)}`,
              detalle: `Se cerró la ${ronda(ev.data.ronda).toLowerCase() || 'ronda'}`,
            }
          : {
              ...base,
              tipo: 'alerta',
              titulo: `La bolsa de la ${ronda(ev.data.ronda).toLowerCase() || 'ronda'} quedó retenida`,
              detalle: `${quien(ev.data.beneficiario)} está en mora: se reparte al final entre quienes cumplieron`,
            }
      }
      case 'EvLiquidado':
        return (ev.data.monto ?? 0n) > 0n
          ? { ...base, tipo: 'ok', titulo: `${quien(ev.data.miembro)} recibió ${dinero(ev.data.monto)} al final` }
          : {
              ...base,
              tipo: 'info',
              titulo: `${quien(ev.data.miembro)} no recibió nada al final`,
              detalle: 'Su garantía ya se había usado por completo',
            }
      case 'EvFinalizada':
        return {
          ...base,
          tipo: 'ok',
          titulo: 'Tanda terminada',
          detalle: [
            ev.data.rendimiento !== undefined ? `rendimiento ${dinero(ev.data.rendimiento)}` : null,
            ev.data.fondo_premios !== undefined && ev.data.fondo_premios > 0n ? `multas repartidas ${dinero(ev.data.fondo_premios)}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }
      case 'EvCancelada':
        return { ...base, tipo: 'alerta', titulo: 'La tanda se canceló', detalle: 'Se devolvieron las garantías' }
      // --- M1: pagar deudas ---
      case 'EvDeudaPagada': {
        const restante = ev.data.deuda_restante ?? 0n
        const tercero =
          ev.data.pagador !== undefined && ev.data.pagador !== ev.data.miembro ? `La pagó ${quien(ev.data.pagador)}` : null
        return restante === 0n
          ? {
              ...base,
              tipo: 'clave',
              titulo: `${quien(ev.data.miembro)} pagó ${dinero(ev.data.monto)} y saldó su deuda`,
              detalle: [tercero, 'vuelve a estar al día'].filter(Boolean).join(' · '),
            }
          : {
              ...base,
              tipo: 'pago',
              titulo: `${quien(ev.data.miembro)} pagó ${dinero(ev.data.monto)} de su deuda`,
              detalle: [tercero, `le faltan ${dinero(restante)}`].filter(Boolean).join(' · '),
            }
      }
      case 'EvAbono':
        return ev.data.retenida
          ? {
              ...base,
              tipo: 'info',
              titulo: `${dinero(ev.data.monto)} se sumaron a la bolsa retenida de ${quien(ev.data.acreedor)}`,
              detalle: `Deuda de ${quien(ev.data.deudor)} · ${ronda(ev.data.ronda) || 'ronda'}`,
            }
          : {
              ...base,
              tipo: 'clave',
              titulo: `${quien(ev.data.acreedor)} recibió los ${dinero(ev.data.monto)} que le faltaban`,
              detalle: `${ronda(ev.data.ronda) || 'Una ronda'}: lo pagó ${quien(ev.data.deudor)}`,
            }
      case 'EvBolsaRecuperada': {
        const partes = [
          (ev.data.multas ?? 0n) > 0n ? `se descontaron ${dinero(ev.data.multas)} de multas` : null,
          (ev.data.garantia ?? 0n) > 0n ? `${dinero(ev.data.garantia)} quedan como su garantía para las cuotas que le faltan` : null,
        ].filter(Boolean)
        return {
          ...base,
          tipo: 'ok',
          titulo: `${quien(ev.data.miembro)} recuperó su bolsa: ${dinero(ev.data.monto)}`,
          detalle: partes.length ? partes.join(' · ').replace(/^./, (l) => l.toUpperCase()) : undefined,
        }
      }
      case 'EvBovedaRapida':
        return { ...base, tipo: 'info', titulo: 'Se cambió la bóveda de las tandas de prueba' }
    }
  })
}
