// Pagos pendientes de los demás (pedido 4 del plan v5). Antes de que empiece una tanda, quien está adentro (o
// quiere entrar) debe saber si alguien del grupo tiene un pago pendiente en otra tanda: si no paga, su depósito
// podría no alcanzar. Aquí están solo las frases, sin red ni React (prueba en morosos.test.ts). Quién tiene el
// pago pendiente lo lee hooks/useMora.ts del historial.
// Las palabras siguen el glosario: "pago pendiente" (el contrato lo llama mora) y "depósito".

/** Un aviso: la frase en negrita y lo que significa para el grupo. */
export type Aviso = { titulo: string; detalle: string }

/** "Beto" · "Beto y Carla" · "Beto, Carla y Ana". Antes de "i" o "hi" la "y" se escribe "e": "Beto e Irene". */
export function unirNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  const ultimo = nombres[nombres.length - 1]
  const conjuncion = /^h?[ií](?![aeiouáéíóúü])/i.test(ultimo) ? 'e' : 'y'
  return `${nombres.slice(0, -1).join(', ')} ${conjuncion} ${ultimo}`
}

/**
 * El aviso rojo de la página de una tanda abierta. `otros`: los nombres de los demás del grupo que tienen un
 * pago pendiente en otra tanda; `yoTengo`: quien mira también lo tiene. Devuelve cero, uno o dos avisos.
 */
export function avisosDePagoPendiente(otros: string[], yoTengo: boolean): Aviso[] {
  const avisos: Aviso[] = []
  if (otros.length === 1) {
    avisos.push({
      titulo: `${otros[0]} tiene un pago pendiente en otra tanda`,
      detalle: 'Si la tanda empieza y no paga, su depósito podría no alcanzar.',
    })
  } else if (otros.length > 1) {
    avisos.push({
      titulo: `${unirNombres(otros)} tienen pagos pendientes en otras tandas`,
      detalle: 'Si la tanda empieza y no pagan, sus depósitos podrían no alcanzar.',
    })
  }
  if (yoTengo) {
    avisos.push({
      titulo: 'Tienes un pago pendiente en otra tanda',
      detalle: 'Si esta tanda empieza y no pagas, tu depósito podría no alcanzar. Págalo antes de que empiece.',
    })
  }
  return avisos
}

/** Lo que se le dice a quien está por unirse a una tanda donde ya hay alguien con un pago pendiente. */
export function textoConfirmarUnirse(morosos: string[]): Aviso {
  if (morosos.length <= 1) {
    return {
      titulo: `${morosos[0] ?? 'Alguien'} tiene un pago pendiente en otra tanda`,
      detalle:
        'Si la tanda empieza y no paga, su depósito podría no alcanzar y el pozo de algún turno podría llegar incompleto.',
    }
  }
  return {
    titulo: `${unirNombres(morosos)} tienen pagos pendientes en otras tandas`,
    detalle:
      'Si la tanda empieza y no pagan, sus depósitos podrían no alcanzar y el pozo de algún turno podría llegar incompleto.',
  }
}
