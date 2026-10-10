// El estado de la campanita (pedido 3 del plan v5): lee la red cada 15 s (lo mismo que la lista de tandas), arma los
// avisos con lo leído y recuerda cuáles ya se vieron. La lectura y los avisos están en lib/ (con pruebas); aquí solo
// se juntan con React. Si no hay conexión se sigue con lo último que se leyó y no se muestra ningún error: la
// campanita es un extra, nunca estorba.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { TANDA_ID } from '../config'
import { almacenLocal } from '../lib/almacen'
import { leerInvitaciones, type Invitacion } from '../lib/invitaciones'
import { crearLector, type Lectura } from '../lib/lecturaNotificaciones'
import { nombreDe, suscribirApodos, versionApodos } from '../lib/nombres'
import {
  abrirLeidas,
  contarSinLeer,
  estaLeida,
  guardarLeidas,
  marcarLeidas,
  notificacionesDeAccion,
  notificacionesDeEventos,
  notificacionesDeInvitacion,
  notificacionesDePendientes,
  ordenarNotificaciones,
  type Contexto,
  type Leidas,
  type Notificacion,
} from '../lib/notificaciones'
import { useConMora } from './useMora'

const INTERVALO_MS = 15_000

type Leyo = { yo: string; lectura: Lectura; invitaciones: Invitacion[]; ahora: number }
type LeidasDe = { yo: string; leidas: Leidas }

export function useNotificaciones(yo: string | null) {
  const [leyo, setLeyo] = useState<Leyo | null>(null)
  const [guardadas, setGuardadas] = useState<LeidasDe | null>(null)
  const leerRef = useRef<(() => Promise<void>) | null>(null)
  // Los apodos llegan después de las direcciones: al llegar, los avisos se escriben de nuevo con ellos.
  useSyncExternalStore(suscribirApodos, versionApodos)

  useEffect(() => {
    if (!yo || !TANDA_ID) return
    const cuenta: string = yo
    let vivo = true
    const lector = crearLector(cuenta)
    async function leerAhora() {
      try {
        const ahora = Math.floor(Date.now() / 1000)
        const invitaciones = leerInvitaciones(almacenLocal())
        const lectura = await lector.leer(
          ahora,
          invitaciones.map((i) => i.id),
        )
        if (vivo) setLeyo({ yo: cuenta, lectura, invitaciones, ahora })
      } catch {
        // Sin red por ahora: se sigue con lo último que se leyó y se reintenta en la próxima vuelta.
      }
    }
    leerRef.current = leerAhora
    const primera = setTimeout(() => void leerAhora(), 0)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void leerAhora()
    }, INTERVALO_MS)
    return () => {
      vivo = false
      leerRef.current = null
      clearTimeout(primera)
      clearInterval(t)
    }
  }, [yo])

  // Lo ya leído de esta cuenta, en este navegador.
  useEffect(() => {
    if (!yo) return
    const t = setTimeout(() => setGuardadas({ yo, leidas: abrirLeidas(almacenLocal(), yo, Math.floor(Date.now() / 1000)) }), 0)
    return () => clearTimeout(t)
  }, [yo])

  const vigente = leyo !== null && leyo.yo === yo ? leyo : null
  // De las tandas abiertas de la persona: quiénes del grupo tienen un pago pendiente en otra tanda (pedido 4).
  const direcciones = vigente
    ? vigente.lectura.mias
        .filter((t) => t.tanda.estado.tag === 'Abierta')
        .flatMap((t) => t.miembros.map((m) => m.direccion))
        .filter((d) => d !== yo)
    : []
  const conPendiente = useConMora(direcciones)

  let notificaciones: Notificacion[] = []
  if (vigente && yo) {
    const c: Contexto = { yo, ahora: vigente.ahora, nombre: nombreDe, tanda: (id) => `Tanda ${id}` }
    notificaciones = ordenarNotificaciones([
      ...vigente.lectura.mias.flatMap((t) => [...notificacionesDeAccion(t, c), ...notificacionesDePendientes(t, conPendiente, c)]),
      ...[...vigente.lectura.eventos].flatMap(([id, eventos]) => notificacionesDeEventos(id, eventos, c)),
      ...notificacionesDeInvitacion(vigente.invitaciones, vigente.lectura.porId, c),
    ])
  }

  const leidas = yo !== null && guardadas !== null && guardadas.yo === yo ? guardadas.leidas : null
  const sinLeer = leidas ? contarSinLeer(notificaciones, leidas) : 0

  /** Da por leído todo lo que hay ahora (al cerrar el panel o con el botón "Marcar todo como leído"). */
  function marcarTodas() {
    if (!yo || !leidas) return
    const nuevas = marcarLeidas(leidas, notificaciones)
    guardarLeidas(almacenLocal(), yo, nuevas)
    setGuardadas({ yo, leidas: nuevas })
  }

  return {
    notificaciones,
    sinLeer,
    /** Momento (segundos Unix) de la última lectura, para decir "hace 5 min" (0 mientras no haya ninguna: tampoco hay avisos). */
    ahora: vigente?.ahora ?? 0,
    esNueva: (n: Notificacion) => leidas !== null && !estaLeida(n, leidas),
    marcarTodas,
    /** Vuelve a leer ya (por ejemplo, al abrir el panel). */
    recargar: useCallback(() => void leerRef.current?.(), []),
  }
}
