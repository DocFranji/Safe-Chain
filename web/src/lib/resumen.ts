// La tanda en palabras de la gente: cada cuánto se paga, el resumen de "Crear" y el mensaje de invitación.
// Lógica pura (sin React ni red): la prueba es resumen.test.ts.
import { duracion } from './formato'
import { dinero } from './glosario'

const DIA = 86_400

export type Frecuencia = 'semanal' | 'quincenal' | 'mensual'

/** Las tres respuestas de "¿Cada cuánto?" al crear una tanda (1 mes = 30 días, como en toda la app). */
export const FRECUENCIAS: { id: Frecuencia; boton: string; segundos: number }[] = [
  { id: 'semanal', boton: 'Semanal', segundos: 7 * DIA },
  { id: 'quincenal', boton: 'Quincenal', segundos: 15 * DIA },
  { id: 'mensual', boton: 'Mensual', segundos: 30 * DIA },
]

export function frecuenciaDe(periodoSeg: number): Frecuencia | null {
  return FRECUENCIAS.find((f) => f.segundos === periodoSeg)?.id ?? null
}

/** "cada semana" · "cada 15 días" · "cada mes" · "cada 2 min" */
export function cadaCuanto(periodoSeg: number): string {
  switch (frecuenciaDe(periodoSeg)) {
    case 'semanal':
      return 'cada semana'
    case 'quincenal':
      return 'cada 15 días'
    case 'mensual':
      return 'cada mes'
    default:
      return `cada ${duracion(periodoSeg)}`
  }
}

/** "por semana" · "cada 15 días" · "por mes" · "cada 2 min" (para "$20 por semana"). */
export function porPeriodo(periodoSeg: number): string {
  const f = frecuenciaDe(periodoSeg)
  return f === 'semanal' ? 'por semana' : f === 'mensual' ? 'por mes' : cadaCuanto(periodoSeg)
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

type Basicos = { cuota: bigint; n: number; periodoSeg: number }

/** "Cada semana, 5 personas ponen $20 y una de ellas recibe $100." */
export function fraseTanda({ cuota, n, periodoSeg }: Basicos): string {
  return `${mayuscula(cadaCuanto(periodoSeg))}, ${n} personas ponen ${dinero(cuota)} y una de ellas recibe ${dinero(cuota * BigInt(n))}.`
}

/** "5 personas · $20 por semana" (para la invitación y las tarjetas). */
export function lineaTanda({ cuota, n, periodoSeg }: Basicos): string {
  return `${n} personas · ${dinero(cuota)} ${porPeriodo(periodoSeg)}`
}

/** El mensaje ya escrito para mandar por WhatsApp. `quien` es el apodo de quien invita, si se conoce. */
export function mensajeInvitacion(t: Basicos & { link: string; quien?: string | null }): string {
  const saludo = t.quien ? `¡Hola! Soy ${t.quien}.` : '¡Hola!'
  return [
    `${saludo} Te invito a mi tanda en Rounda: ${t.n} personas ponemos ${dinero(t.cuota)} ${porPeriodo(t.periodoSeg)} y en cada turno una recibe ${dinero(t.cuota * BigInt(t.n))}.`,
    `Para unirte, abre este enlace: ${t.link}`,
    '(Es con dólares de práctica: no es dinero real.)',
  ].join('\n')
}
