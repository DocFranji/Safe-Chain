// Lo que lee la campanita de la red (pedido 3 del plan v5), sin multiplicar consultas:
//  - se revisan solo las tandas más recientes (VENTANA) y se recuerda de cuáles es la persona, para no volver a
//    preguntar por las que ya no cambian: una terminada o cancelada, o una en curso donde la persona no está
//    (a una tanda en curso nadie más puede unirse);
//  - de las tandas de la persona que siguen vivas se lee el estado en cada vuelta (3 consultas) y, de las abiertas
//    donde no está, cada minuto (para los avisos de invitación);
//  - los eventos (la tanda empezó, terminó, te pagaron una deuda) son los de `leerEventos`, los mismos de la página
//    de la tanda: se piden por tramos y solo lo nuevo, y la red los comparte si dos lugares piden la misma tanda.
// Una lectura que falla se salta: se sigue con lo último que se sabía y no se escribe nada en la consola.
import type { EventoTanda } from './historia'
import { clienteLectura, leer } from './contrato'
import { esTerminal, leerTotal, ordenarMiembros, type EstadoTag } from './lectura'
import type { TandaParaAvisos } from './notificaciones'
import { leerEventos } from './rpc'

/** Cuántas tandas recientes se revisan (el lobby muestra 12 y pide 12 más). */
export const VENTANA = 24
const CONCURRENCIA = 4
/** Una tanda abierta donde la persona no está se vuelve a leer cada tanto (solo sirve para las invitaciones). */
const RELEER_AJENAS_S = 60
/** La red guarda los eventos unos 7 días: pasado ese tiempo no vale la pena buscar los de una tanda terminada. */
const RETENCION_EVENTOS_S = 7 * 86_400
const RELEER_EVENTOS_TERMINADAS_S = 60

type Entrada = {
  datos: TandaParaAvisos
  mia: boolean
  /** No va a cambiar más (para lo que le importa a la campanita): no se vuelve a leer. */
  fija: boolean
  leidaEn: number
}

export type Lectura = {
  /** Las tandas de la persona (la creó o está en ellas), de la más nueva a la más vieja. */
  mias: TandaParaAvisos[]
  /** Todas las que se leyeron, también las ajenas (para las invitaciones). */
  porId: Map<number, TandaParaAvisos>
  /** Los eventos de las tandas de la persona que siguen vivas o terminaron hace poco. */
  eventos: Map<number, EventoTanda[]>
}

const modos = new Map<number, Promise<string>>()
/** El modo de turnos no cambia después de crear la tanda: se lee una sola vez. */
function modoDe(id: number): Promise<string> {
  let m = modos.get(id)
  if (!m) {
    m = clienteLectura()
      .get_opciones({ id })
      .then(leer)
      .then((o) => o.modo.tag as string)
      .catch(() => 'Llegada')
    modos.set(id, m)
  }
  return m
}

async function leerDatos(id: number): Promise<Omit<TandaParaAvisos, 'pagaron' | 'vence' | 'modo'>> {
  const c = clienteLectura()
  const [tanda, lista] = await Promise.all([c.get_tanda({ id }).then(leer), c.get_miembros({ id }).then(leer)])
  return { id, tanda, miembros: ordenarMiembros(lista) }
}

async function completarRonda(base: Omit<TandaParaAvisos, 'pagaron' | 'vence' | 'modo'>): Promise<TandaParaAvisos> {
  const [ronda, modo] = await Promise.all([clienteLectura().get_ronda({ id: base.id }).then(leer), modoDe(base.id)])
  return { ...base, pagaron: ronda[2], vence: Number(ronda[1]), modo }
}

/** Corre `fn` sobre cada elemento, pero solo `limite` a la vez, y se salta los que fallan. */
async function conLimite<T>(items: T[], limite: number, fn: (x: T) => Promise<void>): Promise<void> {
  let siguiente = 0
  async function trabajador() {
    while (siguiente < items.length) {
      const x = items[siguiente++]
      try {
        await fn(x)
      } catch {
        // Esta no se pudo leer: se sigue con las demás y se reintenta en la próxima vuelta.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador))
}

/**
 * ¿Hay que volver a leer esta tanda en esta vuelta? Las de la persona y las de sus invitaciones, siempre (así el
 * aviso desaparece pronto cuando se une); las demás tandas abiertas, cada minuto.
 */
export function hayQueReleer(e: Pick<Entrada, 'mia' | 'fija' | 'leidaEn'> | undefined, ahora: number, invitada = false): boolean {
  if (!e) return true
  if (e.fija) return false
  return e.mia || invitada || ahora - e.leidaEn >= RELEER_AJENAS_S
}

/** ¿Ya no puede entrar nadie nuevo ni cambiar nada que le importe a la campanita? */
export function esFija(estado: EstadoTag, mia: boolean): boolean {
  return esTerminal(estado) || ((estado === 'Activa' || estado === 'PorLiquidar') && !mia)
}

/** ¿Vale la pena buscar los eventos de esta tanda de la persona? Las abiertas no los necesitan. */
export function conEventos(t: TandaParaAvisos, ahora: number): boolean {
  const estado = t.tanda.estado.tag
  if (estado === 'Activa' || estado === 'PorLiquidar') return true
  if (estado !== 'Finalizada') return false
  return ahora - Number(t.tanda.inicio_ronda + t.tanda.periodo_seg) < RETENCION_EVENTOS_S
}

/** Un lector para una persona: guarda lo ya leído entre vueltas. */
export function crearLector(yo: string) {
  const entradas = new Map<number, Entrada>()
  const eventosLeidos = new Map<number, { cuando: number; lista: EventoTanda[] }>()

  async function refrescar(id: number, ahora: number) {
    const base = await leerDatos(id)
    const mia = base.tanda.creador === yo || base.miembros.some((m) => m.direccion === yo)
    const estado = base.tanda.estado.tag
    // La ronda (quién pagó y cuándo vence) solo importa en las tandas vivas de la persona.
    const datos = mia && (estado === 'Activa' || estado === 'PorLiquidar') ? await completarRonda(base) : { ...base, pagaron: [], vence: 0, modo: 'Llegada' }
    entradas.set(id, { datos, mia, fija: esFija(estado, mia), leidaEn: ahora })
  }

  return {
    /** `extras`: más tandas que revisar, además de las más recientes (por ejemplo, las de las invitaciones). */
    async leer(ahora: number, extras: number[] = []): Promise<Lectura> {
      const total = await leerTotal()
      const ids = new Set<number>()
      for (let id = total; id >= 1 && ids.size < VENTANA; id--) ids.add(id)
      for (const id of extras) if (id >= 1 && id <= total) ids.add(id)

      await conLimite(
        [...ids].filter((id) => hayQueReleer(entradas.get(id), ahora, extras.includes(id))),
        CONCURRENCIA,
        (id) => refrescar(id, ahora),
      )

      const porId = new Map<number, TandaParaAvisos>()
      const mias: TandaParaAvisos[] = []
      for (const id of [...ids].sort((a, b) => b - a)) {
        const e = entradas.get(id)
        if (!e) continue
        porId.set(id, e.datos)
        if (e.mia) mias.push(e.datos)
      }

      const eventos = new Map<number, EventoTanda[]>()
      await conLimite(
        mias.filter((t) => conEventos(t, ahora)),
        CONCURRENCIA,
        async (t) => {
          const previo = eventosLeidos.get(t.id)
          const terminada = t.tanda.estado.tag === 'Finalizada'
          if (previo && terminada && ahora - previo.cuando < RELEER_EVENTOS_TERMINADAS_S) {
            eventos.set(t.id, previo.lista)
            return
          }
          try {
            const lista = await leerEventos(t.id)
            eventosLeidos.set(t.id, { cuando: ahora, lista })
            eventos.set(t.id, lista)
          } catch (e) {
            // Si falla, se sigue con lo último que se leyó de esta tanda.
            if (previo) eventos.set(t.id, previo.lista)
            else throw e
          }
        },
      )
      return { mias, porId, eventos }
    },
  }
}
