// "Mis tandas": con sesión empieza en las tandas de quien mira; también se pueden ver las abiertas y todas.
// Búsqueda y filtros (pedido 5 del plan v5): la lógica está en lib/filtros.ts. Los filtros van en la URL
// (#/tandas?cuota=10-50…) para compartirlos y se recuerdan en este navegador.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTandas } from '../hooks/useTandas'
import { useAhora } from '../hooks/useTanda'
import { useReputaciones } from '../hooks/useReputaciones'
import type { Billetera } from '../hooks/useBilletera'
import type { Cuenta } from '../hooks/useCuenta'
import { TarjetaTanda } from '../components/TarjetaTanda'
import { ComoProbar } from '../components/ComoProbar'
import { RUTA_CREAR } from '../lib/rutas'
import { nombreConocido, suscribirApodos, versionApodos } from '../lib/nombres'
import { MODOS } from '../lib/turnos'
import {
  busquedaDelHash,
  cuantosExtra,
  DURACIONES,
  ESTADOS,
  estadoEfectivo,
  filtrar,
  filtrosDeBusqueda,
  filtrosGuardados,
  guardarFiltros,
  hashDeLista,
  hayFiltros,
  SIN_FILTROS,
  type Filtros,
} from '../lib/filtros'

/** Al entrar: lo que diga la URL (un enlace compartido); si no dice nada, lo último que se usó aquí. */
function filtrosIniciales(): Filtros {
  const qs = busquedaDelHash(window.location.hash)
  return qs ? filtrosDeBusqueda(qs) : (filtrosGuardados() ?? SIN_FILTROS)
}

/** "" -> null; "12,5" -> 12.5 (lo que no es un número se ignora). */
function cuotaDe(texto: string): number | null {
  const n = Number(texto.replace(',', '.'))
  return texto.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n
}

const NIVELES_MINIMOS = [
  { id: 'Bronce', texto: 'Bronce o más' },
  { id: 'Plata', texto: 'Plata o más' },
  { id: 'Oro', texto: 'Oro' },
] as const

export function Lobby({ billetera, cuenta }: { billetera: Billetera; cuenta: Cuenta }) {
  const { total, lista, error, listo, hayMas, verMas } = useTandas()
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciales)
  const [masAbierto, setMasAbierto] = useState(() => cuantosExtra(filtros) > 0)
  const yo = billetera.direccion
  const estado = estadoEfectivo(filtros, yo)
  const ahora = useAhora()
  // Los apodos llegan de a poco: al llegar, la búsqueda por apodo se vuelve a hacer.
  useSyncExternalStore(suscribirApodos, versionApodos)
  const reputaciones = useReputaciones(lista, filtros.nivel !== null)

  const cambiar = (cambios: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...cambios }))

  // La URL y el navegador siempre muestran los filtros de la pantalla.
  const actuales = useRef(filtros)
  useEffect(() => {
    actuales.current = filtros
    const hash = hashDeLista(filtros)
    if (window.location.hash !== hash) history.replaceState(null, '', hash)
    guardarFiltros(filtros)
  }, [filtros])

  // Un enlace con filtros pegado estando ya en la lista, o el menú que vuelve a "#/tandas".
  useEffect(() => {
    const alCambiar = () => {
      const qs = busquedaDelHash(window.location.hash)
      if (qs) setFiltros(filtrosDeBusqueda(qs))
      else if (window.location.hash.startsWith('#/tandas')) history.replaceState(null, '', hashDeLista(actuales.current))
    }
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])

  const visibles = filtrar(lista, filtros, {
    yo,
    // Pedir el apodo de cada persona solo cuando se busca por texto.
    nombreDe: (d) => (filtros.q.trim() ? nombreConocido(d) : null),
    nivelDe: reputaciones.nivelDe,
    pendientesDe: reputaciones.pendientesDe,
  })
  const extra = cuantosExtra(filtros)
  const filtrando = hayFiltros(filtros)
  const quitar = () => setFiltros((f) => ({ ...SIN_FILTROS, estado: f.estado }))

  return (
    <section className="lobby" aria-labelledby="lobby-titulo">
      <div className="selector">
        <h1 id="lobby-titulo">{yo ? 'Mis tandas' : 'Tandas'}</h1>
        <a className="boton principal" href={RUTA_CREAR}>
          Crear una tanda
        </a>
      </div>
      <p className="explica lobby-intro">
        Ahorra en grupo sin miedo a que alguien desaparezca: Rounda guarda el dinero, y si alguien no paga, su depósito
        de seguridad cubre su cuota. Crea la tuya o únete a una con el enlace que te manden.
      </p>
      <ComoProbar billetera={billetera} cuenta={cuenta} />

      {error && !lista.length && (
        <p className="aviso error" role="alert">
          {error}
        </p>
      )}
      {!listo && <p className="cargando">Cargando las tandas…</p>}

      {listo && total === 0 && (
        <div className="vacio">
          <h2>Todavía no hay tandas</h2>
          <p>Sé la primera persona: crea una tanda, comparte el link y empieza cuando se unan todos.</p>
          <a className="boton principal" href={RUTA_CREAR}>
            Crear la primera tanda
          </a>
        </div>
      )}

      {listo && total !== null && total > 0 && (
        <>
          <div className="buscador" role="search">
            <label htmlFor="buscar-tandas" className="sr-solo">
              Buscar tandas
            </label>
            <input
              id="buscar-tandas"
              type="search"
              value={filtros.q}
              onChange={(e) => cambiar({ q: e.target.value })}
              placeholder="Busca por nombre, persona o número"
              title="Nombre de la tanda, número, apodo o dirección de alguien"
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
            />
          </div>

          <div className="filtros" role="group" aria-label="Filtrar tandas">
            {ESTADOS.map((e) => (
              <button
                key={e.id}
                type="button"
                className={estado === e.id ? 'filtro activo' : 'filtro'}
                aria-pressed={estado === e.id}
                onClick={() => cambiar({ estado: e.id })}
              >
                {e.texto}
              </button>
            ))}
            <button
              type="button"
              className="filtro mas-filtros"
              aria-expanded={masAbierto}
              aria-controls="panel-filtros"
              onClick={() => setMasAbierto((a) => !a)}
            >
              Más filtros{extra > 0 ? ` (${extra})` : ''}
            </button>
          </div>

          {masAbierto && (
            <div id="panel-filtros" className="panel-filtros">
              <div className="campo">
                <label htmlFor="filtro-tipo">Turnos</label>
                <select
                  id="filtro-tipo"
                  value={filtros.tipo ?? ''}
                  onChange={(e) => cambiar({ tipo: MODOS.find((m) => m.modo === e.target.value)?.modo ?? null })}
                >
                  <option value="">Cualquier forma</option>
                  {MODOS.map((m) => (
                    <option key={m.modo} value={m.modo}>
                      {m.titulo}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset className="campo filtro-cuota">
                <legend>Cuota</legend>
                <div className="rango">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    placeholder="Desde $"
                    value={filtros.cuotaMin ?? ''}
                    onChange={(e) => cambiar({ cuotaMin: cuotaDe(e.target.value) })}
                    aria-label="Cuota desde, en dólares"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    placeholder="Hasta $"
                    value={filtros.cuotaMax ?? ''}
                    onChange={(e) => cambiar({ cuotaMax: cuotaDe(e.target.value) })}
                    aria-label="Cuota hasta, en dólares"
                  />
                </div>
              </fieldset>
              <div className="campo">
                <label htmlFor="filtro-duracion">Duración</label>
                <select
                  id="filtro-duracion"
                  value={filtros.duracion ?? ''}
                  onChange={(e) => cambiar({ duracion: DURACIONES.find((d) => d.id === e.target.value)?.id ?? null })}
                >
                  <option value="">Cualquier duración</option>
                  {DURACIONES.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.texto}
                    </option>
                  ))}
                </select>
              </div>
              {reputaciones.conHistorial && (
                <div className="campo">
                  <label htmlFor="filtro-nivel">Reputación de quien la creó</label>
                  <select
                    id="filtro-nivel"
                    value={filtros.nivel ?? ''}
                    onChange={(e) => cambiar({ nivel: NIVELES_MINIMOS.find((n) => n.id === e.target.value)?.id ?? null })}
                  >
                    <option value="">Cualquier reputación</option>
                    {NIVELES_MINIMOS.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.texto}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="filtro-casillas">
                <label className="casilla">
                  <input type="checkbox" checked={filtros.sinPendientes} onChange={(e) => cambiar({ sinPendientes: e.target.checked })} />
                  <span>Sin personas con pagos pendientes</span>
                </label>
                <label className="casilla">
                  <input type="checkbox" checked={filtros.canceladas} onChange={(e) => cambiar({ canceladas: e.target.checked })} />
                  <span>Mostrar canceladas</span>
                </label>
              </div>
            </div>
          )}

          {filtrando && (
            <p className="resultado-filtros" aria-live="polite">
              <span>
                {visibles.length === 1 ? '1 tanda' : `${visibles.length} tandas`}
                {reputaciones.revisando && (filtros.nivel || filtros.sinPendientes) ? ' · revisando reputaciones…' : ''}
              </span>
              <button type="button" className="enlace-boton" onClick={quitar}>
                Quitar filtros
              </button>
            </p>
          )}

          {estado === 'mias' && !yo && (
            <p className="explica">Entra (arriba a la derecha) para ver las tandas en las que participas.</p>
          )}

          {visibles.length === 0 && estado === 'mias' && yo && !filtrando ? (
            <div className="vacio">
              <h2>Todavía no estás en ninguna tanda</h2>
              <p>Crea una y manda el enlace a tu grupo, o únete a una con el enlace que te manden.</p>
              <div className="fila-botones">
                <a className="boton principal" href={RUTA_CREAR}>
                  Crear una tanda
                </a>
                <button type="button" className="boton secundario" onClick={() => cambiar({ estado: 'abiertas' })}>
                  Ver tandas abiertas
                </button>
              </div>
            </div>
          ) : visibles.length === 0 ? (
            <p className="explica sin-resultados">
              {filtrando
                ? `Ninguna tanda coincide${hayMas ? ' entre las más recientes. Prueba con "Ver tandas más antiguas" o' : '.'} quita algún filtro.`
                : 'No hay tandas en esta categoría por ahora.'}
            </p>
          ) : (
            <ul className="tarjetas">
              {visibles.map((r) => (
                <TarjetaTanda key={r.id} resumen={r} yo={yo} ahora={ahora} pendientes={reputaciones.pendientesDe(r)} />
              ))}
            </ul>
          )}

          {hayMas && (
            <button type="button" className="boton chico ver-mas" onClick={verMas}>
              Ver tandas más antiguas
            </button>
          )}
        </>
      )}
    </section>
  )
}
