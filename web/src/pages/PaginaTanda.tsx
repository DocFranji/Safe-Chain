// Una tanda: la rueda de turnos, el panel de acciones, quiénes participan y, según el estado,
// la invitación (abierta), el rendimiento (en curso) o los resultados (terminada).
import { useAhora, useTanda } from '../hooks/useTanda'
import { useEventos } from '../hooks/useEventos'
import type { Billetera } from '../hooks/useBilletera'
import { Rueda } from '../components/Rueda'
import { PanelRonda } from '../components/PanelRonda'
import { ListaMiembros } from '../components/ListaMiembros'
import { Calendario } from '../components/Calendario'
import { Invitar } from '../components/Invitar'
import { Rendimiento } from '../components/Rendimiento'
import { Resultados } from '../components/Resultados'
import { LineaDeTiempo } from '../components/LineaDeTiempo'
import { Mensaje } from '../components/Mensaje'
import { claseEstado, etiquetaEstado } from '../lib/formato'
import { RUTA_LOBBY } from '../lib/rutas'
import { monedaDe } from '../lib/monedas'
import { MonedaContexto, useSaldoEn } from '../hooks/useMoneda'

type Props = { id: number; billetera: Billetera; saldo: bigint | null }

export function PaginaTanda({ id, billetera, saldo }: Props) {
  const { datos, error, cargando, recargar } = useTanda(id)
  const ahora = useAhora()
  const historia = useEventos(id)
  const estado = datos?.tanda.estado.tag
  // M4: la moneda de esta tanda (TUSD o USDC de Blend) y el saldo de la persona en esa moneda.
  const moneda = monedaDe(datos?.tanda.token)
  const saldoMoneda = useSaldoEn(moneda, billetera.direccion, saldo)

  return (
    <MonedaContexto.Provider value={moneda}>
      <p className="migas">
        <a href={RUTA_LOBBY}>← Todas las tandas</a>
      </p>
      <div className="selector">
        <h1>Tanda {id}</h1>
        {estado && <span className={`etiqueta grande ${claseEstado(estado)}`}>{etiquetaEstado(estado)}</span>}
      </div>

      {error && !datos && <Mensaje titulo="No pudimos leer esta tanda">{error}</Mensaje>}
      {cargando && !datos && !error && <p className="cargando">Leyendo la tanda desde la red de Stellar…</p>}

      {datos && (
        <>
          <div className="escenario">
            <Rueda datos={datos} ahora={ahora} yo={billetera.direccion} />
            <div className="columna">
              <PanelRonda id={id} datos={datos} billetera={billetera} saldo={saldoMoneda} ahora={ahora} alCambiar={recargar} />
              {estado === 'Abierta' && <Invitar id={id} libres={datos.tanda.n_miembros - datos.miembros.length} />}
              {(estado === 'Abierta' || estado === 'Activa' || estado === 'PorLiquidar') && <Rendimiento datos={datos} />}
            </div>
          </div>
          <ListaMiembros datos={datos} yo={billetera.direccion} />
          <Calendario id={id} datos={datos} ahora={ahora} yo={billetera.direccion} />
          {estado === 'Finalizada' && (
            <Resultados datos={datos} yo={billetera.direccion} eventos={historia.eventos} error={historia.error} />
          )}
          <section className="miembros historia-seccion" aria-labelledby="historia-titulo">
            <h2 id="historia-titulo">Qué ha pasado</h2>
            <LineaDeTiempo eventos={historia.eventos} error={historia.error} />
          </section>
        </>
      )}
    </MonedaContexto.Provider>
  )
}
