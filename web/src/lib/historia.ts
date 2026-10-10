// Convierte los eventos del contrato en una historia legible ("Ana no pagó: su depósito cubrió $100").
// Las palabras siguen el glosario (glosario.ts): depósito, pozo, turno, pago pendiente.
// Es lógica pura, sin red ni React: la prueba (historia.test.ts) cubre cada tipo de evento.
import type { ContractEvent } from 'tanda'
import { SIN_TURNO, tituloModo } from './turnos'

/** Un evento ya leído de la red, con el momento en que se cerró su ledger. */
export type EventoTanda = {
  /** Identificador del evento: crece con el tiempo, sirve para ordenar. */
  id: string
  ledger: number
  /** Fecha y hora (ISO) en que la red lo registró. */
  cerradoEn: string
  evento: ContractEvent
}

/** `clave` = los momentos que explican la idea de la tanda (el depósito cubriendo a quien no pagó). */
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
  /** El monto como se muestra: "$100". */
  dinero: (valor: bigint) => string
}

export function ordenar(eventos: EventoTanda[]): EventoTanda[] {
  return [...eventos].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** De cronológico a frases. Un evento al que le falten datos se cuenta con lo que haya. */
export function narrar(eventos: EventoTanda[], f: Formato): EntradaHistoria[] {
  const dinero = (v: bigint | undefined) => (v === undefined ? '-' : f.dinero(v))
  const quien = (d: string | undefined) => (d === undefined ? 'Alguien' : f.nombre(d))
  const ronda = (r: number | undefined) => (r === undefined ? '' : `Turno ${r + 1}`)
  const pct = (bps: number | undefined) => (bps === undefined ? '-' : `${bps / 100} %`)

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
            ev.data.posicion === undefined
              ? null
              : ev.data.posicion === SIN_TURNO
                ? 'turno por decidir'
                : `Turno ${ev.data.posicion + 1}`,
            ev.data.colateral !== undefined ? `dejó ${dinero(ev.data.colateral)} de depósito` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }
      case 'EvIniciada':
        return { ...base, tipo: 'ok', titulo: 'Se completó el grupo: empieza el turno 1' }
      case 'EvPago':
        return ev.data.tarde
          ? {
              ...base,
              tipo: 'alerta',
              titulo: `${quien(ev.data.miembro)} pagó tarde`,
              detalle: `${ronda(ev.data.ronda)}: se anota una multa que se descuenta de su depósito al final`.replace(/^: /, ''),
            }
          : { ...base, tipo: 'pago', titulo: `${quien(ev.data.miembro)} pagó su cuota`, detalle: ronda(ev.data.ronda) || undefined }
      case 'EvCubierto':
        return {
          ...base,
          tipo: 'clave',
          titulo: `${quien(ev.data.miembro)} no pagó: su depósito cubrió ${dinero(ev.data.monto)}`,
          detalle: `${ronda(ev.data.ronda)}: el grupo no pierde nada y quien cobra recibe el pozo completo`.replace(/^: /, ''),
        }
      case 'EvMoroso':
        return {
          ...base,
          tipo: 'alerta',
          titulo: `${quien(ev.data.miembro)} quedó con un pago pendiente`,
          detalle: `Su depósito no alcanza para las cuotas que le quedan y no se usa por ahora: debe ${dinero(ev.data.deuda)}`,
        }
      case 'EvRonda': {
        const pagado = ev.data.monto_pagado ?? 0n
        return pagado > 0n
          ? {
              ...base,
              tipo: 'ok',
              titulo: `${quien(ev.data.beneficiario)} cobró ${dinero(pagado)}`,
              detalle: ronda(ev.data.ronda) || undefined,
            }
          : {
              ...base,
              tipo: 'alerta',
              titulo: `El pozo del ${ronda(ev.data.ronda).toLowerCase() || 'turno'} quedó guardado`,
              detalle: `${quien(ev.data.beneficiario)} tiene un pago pendiente: se reparte al final entre quienes cumplieron`,
            }
      }
      case 'EvLiquidado':
        return (ev.data.monto ?? 0n) > 0n
          ? { ...base, tipo: 'ok', titulo: `${quien(ev.data.miembro)} recibió ${dinero(ev.data.monto)} al final` }
          : {
              ...base,
              tipo: 'info',
              titulo: `${quien(ev.data.miembro)} no recibió nada al final`,
              detalle: 'Su depósito ya se había usado por completo',
            }
      case 'EvFinalizada':
        return {
          ...base,
          tipo: 'ok',
          titulo: 'Tanda terminada',
          detalle: [
            ev.data.rendimiento !== undefined ? `intereses ${dinero(ev.data.rendimiento)}` : null,
            ev.data.fondo_premios !== undefined && ev.data.fondo_premios > 0n ? `multas repartidas ${dinero(ev.data.fondo_premios)}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }
      case 'EvCancelada':
        return { ...base, tipo: 'alerta', titulo: 'La tanda se canceló', detalle: 'Se devolvieron los depósitos' }

      // --- M3: turnos ---
      case 'EvOpciones': {
        const modo = ev.data.modo?.tag
        return {
          ...base,
          tipo: 'info',
          titulo: modo ? `Turnos: ${tituloModo(modo).toLowerCase()}` : 'Se eligió cómo se reparten los turnos',
          detalle: [
            modo === 'PrecioPorTurno' ? `el primer turno paga ${pct(ev.data.prima_max_bps)} del pozo` : null,
            modo === 'Subasta' ? `descuento máximo ${pct(ev.data.descuento_max_bps)}` : null,
            ev.data.permitir_intercambio ? 'se pueden intercambiar turnos' : null,
            ev.data.ofertas_selladas ? 'ofertas selladas' : null,
            ev.data.primeros_con_historial
              ? `${ev.data.primeros_con_historial === 1 ? 'el turno 1 pide' : `los turnos 1 a ${ev.data.primeros_con_historial} piden`} una reputación de ${ev.data.puntaje_primeros} puntos o más`
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }
      }
      case 'EvSorteo':
        return {
          ...base,
          tipo: 'clave',
          titulo: 'Se sorteó el orden de cobro',
          detalle: (ev.data.orden ?? []).map((d, i) => `${i + 1}. ${quien(d)}`).join(' · ') || undefined,
        }
      case 'EvOferta':
        return {
          ...base,
          tipo: 'info',
          titulo: `${quien(ev.data.miembro)} ofrece recibir ${pct(ev.data.descuento_bps)} menos`,
          detalle: `Para cobrar en el ${ronda(ev.data.ronda).toLowerCase() || 'turno'}: ${dinero(ev.data.descuento)} menos si todos pagan`,
        }
      case 'EvSello':
        return {
          ...base,
          tipo: 'info',
          titulo: `${quien(ev.data.miembro)} selló una oferta`,
          detalle: `${ronda(ev.data.ronda) || 'Este turno'}: el porcentaje se verá cuando la revele`,
        }
      case 'EvSubasta': {
        const descuento = ev.data.descuento ?? 0n
        return ev.data.por_respaldo || descuento === 0n
          ? {
              ...base,
              tipo: 'info',
              titulo: `${ronda(ev.data.ronda) || 'Este turno'}: cobra ${quien(ev.data.ganador)}`,
              detalle: 'Nadie ofertó: le tocó según el orden sorteado al empezar',
            }
          : {
              ...base,
              tipo: 'clave',
              titulo: `${quien(ev.data.ganador)} ganó la subasta del ${ronda(ev.data.ronda).toLowerCase() || 'turno'} con ${dinero(descuento)} de descuento`,
              detalle: `Cada uno de los demás recibió ${dinero(ev.data.dividendo)} en su depósito`,
            }
      }
      case 'EvPrima': {
        const prima = ev.data.prima ?? 0n
        return prima >= 0n
          ? {
              ...base,
              tipo: 'info',
              titulo: `${quien(ev.data.miembro)} pagó ${dinero(prima)} por cobrar antes`,
              detalle: `${ronda(ev.data.ronda)}: es para quienes cobran al final`.replace(/^: /, ''),
            }
          : {
              ...base,
              tipo: 'ok',
              titulo: `${quien(ev.data.miembro)} ganó ${dinero(-prima)} por esperar`,
              detalle: `${ronda(ev.data.ronda)}: lo pagaron quienes cobraron antes`.replace(/^: /, ''),
            }
      }
      case 'EvGarantia':
        return {
          ...base,
          tipo: 'info',
          titulo: `Del pozo de ${quien(ev.data.miembro)} se apartaron ${dinero(ev.data.monto)} como su depósito`,
          detalle: 'Cubren las cuotas que aún debe y vuelven al final con intereses',
        }
      case 'EvPropuesta': {
        const c = ev.data.compensacion ?? 0n
        return {
          ...base,
          tipo: 'info',
          titulo: `${quien(ev.data.de)} propone cambiar de turno con ${quien(ev.data.con)}`,
          detalle:
            c > 0n
              ? `${quien(ev.data.de)} ofrece ${dinero(c)}`
              : c < 0n
                ? `${quien(ev.data.de)} pide ${dinero(-c)}`
                : 'Sin compensación',
        }
      }
      case 'EvIntercambio':
        return {
          ...base,
          tipo: 'ok',
          titulo: `${quien(ev.data.de)} y ${quien(ev.data.con)} cambiaron de turno`,
          detalle: [
            ev.data.turno_de !== undefined ? `${quien(ev.data.de)} cobra en el turno ${ev.data.turno_de + 1}` : null,
            ev.data.turno_con !== undefined ? `${quien(ev.data.con)} en el turno ${ev.data.turno_con + 1}` : null,
          ]
            .filter(Boolean)
            .join(' y '),
        }
      case 'EvPropuestaRetirada':
        return {
          ...base,
          tipo: 'info',
          titulo: `Se retiró la propuesta de ${quien(ev.data.de)} a ${quien(ev.data.con)}`,
          detalle: 'Si había dinero de compensación, volvió a quien propuso',
        }
      // --- M1: pagar deudas ---
      case 'EvDeudaPagada': {
        const restante = ev.data.deuda_restante ?? 0n
        const tercero =
          ev.data.pagador !== undefined && ev.data.pagador !== ev.data.miembro ? `La pagó ${quien(ev.data.pagador)}` : null
        return restante === 0n
          ? {
              ...base,
              tipo: 'clave',
              titulo: `${quien(ev.data.miembro)} pagó ${dinero(ev.data.monto)} y se puso al día`,
              detalle: [tercero, 'vuelve a estar al día'].filter(Boolean).join(' · '),
            }
          : {
              ...base,
              tipo: 'pago',
              titulo: `${quien(ev.data.miembro)} pagó ${dinero(ev.data.monto)} de lo que debía`,
              detalle: [tercero, `le faltan ${dinero(restante)}`].filter(Boolean).join(' · '),
            }
      }
      case 'EvAbono':
        return ev.data.retenida
          ? {
              ...base,
              tipo: 'info',
              titulo: `${dinero(ev.data.monto)} se sumaron al pozo guardado de ${quien(ev.data.acreedor)}`,
              detalle: `Lo pagó ${quien(ev.data.deudor)} · ${ronda(ev.data.ronda) || 'turno'}`,
            }
          : {
              ...base,
              tipo: 'clave',
              titulo: `${quien(ev.data.acreedor)} recibió los ${dinero(ev.data.monto)} que le faltaban`,
              detalle: `${ronda(ev.data.ronda) || 'Un turno'}: lo pagó ${quien(ev.data.deudor)}`,
            }
      case 'EvBolsaRecuperada': {
        const partes = [
          (ev.data.multas ?? 0n) > 0n ? `se descontaron ${dinero(ev.data.multas)} de multas` : null,
          (ev.data.garantia ?? 0n) > 0n ? `${dinero(ev.data.garantia)} quedan como su depósito para las cuotas que le faltan` : null,
        ].filter(Boolean)
        return {
          ...base,
          tipo: 'ok',
          titulo: `${quien(ev.data.miembro)} recuperó su pozo: ${dinero(ev.data.monto)}`,
          detalle: partes.length ? partes.join(' · ').replace(/^./, (l) => l.toUpperCase()) : undefined,
        }
      }
      // --- M1 (v4): cerrar antes y pagar deudas después de terminar ---
      case 'EvCierreAnticipado':
        return {
          ...base,
          tipo: 'clave',
          titulo: `Todos pagaron: el pozo del ${ronda(ev.data.ronda).toLowerCase() || 'turno'} se entregó antes`,
          detalle: 'Las fechas no cambian: el turno siguiente ya se puede pagar y vence cuando le tocaba',
        }
      case 'EvAbonoFinal':
        return ev.data.reparto
          ? {
              ...base,
              tipo: 'ok',
              titulo: `${quien(ev.data.hacia)} recibió ${dinero(ev.data.monto)}`,
              detalle: `Su parte de lo que debía ${quien(ev.data.deudor)} a un pozo que se repartió al final`,
            }
          : {
              ...base,
              tipo: 'clave',
              titulo: `${quien(ev.data.hacia)} recibió los ${dinero(ev.data.monto)} que le faltaban`,
              detalle: `Lo pagó ${quien(ev.data.deudor)}, con la tanda ya terminada`,
            }
      case 'EvBovedaRapida':
        return { ...base, tipo: 'info', titulo: 'Se cambió dónde ganan intereses las tandas de prueba' }
      // --- M2: historial crediticio ---
      case 'EvHistorialConfigurado':
        return { ...base, tipo: 'info', titulo: 'Se conectó la reputación' }
      case 'EvRequisitos': {
        const partes = [
          ev.data.puntaje_minimo ? `pide una reputación de ${ev.data.puntaje_minimo} puntos o más` : null,
          ev.data.descuento ? 'da descuento en el depósito por buena reputación' : null,
        ].filter(Boolean)
        return {
          ...base,
          tipo: 'info',
          titulo: partes.length ? 'La tanda usa la reputación' : 'La tanda no usa la reputación',
          detalle: partes.length ? `Esta tanda ${partes.join(' y ')}` : undefined,
        }
      }
      // M4: bóveda por token (evento del admin; no lleva número de tanda)
      case 'EvBovedaToken':
        return { ...base, tipo: 'info', titulo: 'Se cambió dónde ganan intereses las tandas nuevas de una moneda' }
    }
  })
}
