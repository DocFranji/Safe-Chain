// "Agregar a mi calendario" (misión M1): un archivo .ics con las fechas de pago de una tanda, para el
// calendario del teléfono o Google Calendar, con un recordatorio el día antes. Ataca la causa más común
// de la mora: olvidarse. Como el contrato ancla las fechas, no se corren aunque una ronda se cierre tarde.
// Puro (sin red ni navegador): se prueba solo. Formato: RFC 5545 (iCalendar).
import { dinero } from './glosario'

export type DatosCalendario = {
  /** Número de la tanda. */
  id: number
  /** Contrato de la tanda: hace únicos los eventos aunque otro despliegue repita los números de tanda. */
  contrato: string
  nMiembros: number
  rondaActual: number
  periodoSeg: number
  /** Cuándo vence la ronda actual (segundos Unix). */
  vence: number
  cuota: bigint
  /** Quién cobra cada ronda: `cobra[r]` es el nombre (o null si todavía no se sabe, como en una subasta). */
  cobra: (string | null)[]
  /** Ronda (0, 1, ...) en la que cobra quien descarga el archivo, o null si no se sabe. */
  miRonda: number | null
  /** Enlace a la tanda en la web. */
  enlace: string
}

/** Un evento por ronda que todavía no vence. */
export type EventoPago = { ronda: number; vence: number; titulo: string; descripcion: string }

/** Las rondas que todavía no vencen, con su fecha límite, título y descripción. */
export function eventosDePago(d: DatosCalendario, ahora: number): EventoPago[] {
  const eventos: EventoPago[] = []
  for (let r = d.rondaActual; r < d.nMiembros; r++) {
    const vence = d.vence + (r - d.rondaActual) * d.periodoSeg
    if (vence <= ahora) continue
    const cuota = dinero(d.cuota)
    const cobro = d.miRonda === r
    const titulo = cobro
      ? `Tanda ${d.id}: pagas tu cuota y cobras tu pozo (turno ${r + 1} de ${d.nMiembros})`
      : `Tanda ${d.id}: paga tu cuota de ${cuota} (turno ${r + 1} de ${d.nMiembros})`
    const quien = d.cobra[r]
    const descripcion = [
      `Tu cuota de ${cuota} vence al terminar este evento: págala antes para que no cuente como atraso.`,
      cobro
        ? 'Este turno cobras tú: cuando venza el plazo, abre la tanda y toca "Tu pozo está listo: cóbralo".'
        : quien
          ? `Este turno cobra ${quien}.`
          : null,
      `Abre la tanda: ${d.enlace}`,
    ]
      .filter(Boolean)
      .join('\n')
    eventos.push({ ronda: r, vence, titulo, descripcion })
  }
  return eventos
}

/** 20261103T140000Z */
function fechaUtc(segundos: number): string {
  return new Date(segundos * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Escapa un texto para iCalendar: barras, comas, punto y coma y saltos de línea. */
export function escapar(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Parte una línea en trozos de máximo 75 bytes (las siguientes empiezan con un espacio), sin cortar letras. */
export function plegar(linea: string): string {
  const bytes = (s: string) => new TextEncoder().encode(s).length
  const partes: string[] = []
  let actual = ''
  for (const letra of linea) {
    const limite = partes.length === 0 ? 75 : 74 // las siguientes llevan el espacio inicial
    if (bytes(actual + letra) > limite) {
      partes.push(actual)
      actual = letra
    } else {
      actual += letra
    }
  }
  partes.push(actual)
  return partes.join('\r\n ')
}

/**
 * El archivo .ics completo. Cada evento es la última hora para pagar (termina en la fecha límite), con
 * dos recordatorios: un día antes y al empezar esa última hora.
 */
export function generarIcs(d: DatosCalendario, ahora: number): string {
  const ahoraUtc = fechaUtc(ahora)
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rounda//Tandas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  lineas.push(`X-WR-CALNAME:${escapar(`Rounda · Tanda ${d.id}`)}`)
  for (const e of eventosDePago(d, ahora)) {
    lineas.push(
      'BEGIN:VEVENT',
      // Mismo UID al volver a descargarlo: los calendarios que lo respetan actualizan en vez de repetir.
      `UID:rounda-${d.contrato}-${d.id}-${e.ronda}@rounda`,
      `DTSTAMP:${ahoraUtc}`,
      `DTSTART:${fechaUtc(e.vence - 60 * 60)}`,
      `DTEND:${fechaUtc(e.vence)}`,
      `SUMMARY:${escapar(e.titulo)}`,
      `DESCRIPTION:${escapar(e.descripcion)}`,
      `URL:${d.enlace}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-P1D',
      `DESCRIPTION:${escapar(`Mañana vence tu cuota de la tanda ${d.id}`)}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:PT0M',
      `DESCRIPTION:${escapar(`En una hora vence tu cuota de la tanda ${d.id}`)}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lineas.push('END:VCALENDAR')
  return lineas.map(plegar).join('\r\n') + '\r\n'
}
