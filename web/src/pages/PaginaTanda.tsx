// Una tanda: la rueda de turnos, el panel de acciones, quiénes participan y, según el estado,
// la invitación (abierta), el rendimiento (en curso) o los resultados (terminada).
import { useAhora, useTanda } from '../hooks/useTanda'
import type { Billetera } from '../hooks/useBilletera'
import { Rueda } from '../components/Rueda'
import { PanelRonda } from '../components/PanelRonda'
import { ListaMiembros } from '../components/ListaMiembros'
import { Invitar } from '../components/Invitar'
import { Rendimiento } from '../components/Rendimiento'
import { Resultados } from '../components/Resultados'
import { Mensaje } from '../components/Mensaje'
import { etiquetaEstado } from '../lib/formato'
import { RUTA_LOBBY } from '../lib/rutas'

type Props = { id: number; billetera: Billetera; saldo: bigint | null }

export function PaginaTanda({ id, billetera, saldo }: Props) {
  const { datos, error, cargando, recargar } = useTanda(id)
  const ahora = useAhora()
  const estado = datos?.tanda.estado.tag

  return (
    <>
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
              <PanelRonda id={id} datos={datos} billetera={billetera} saldo={saldo} ahora={ahora} alCambiar={recargar} />
              {estado === 'Abierta' && <Invitar id={id} libres={datos.tanda.n_miembros - datos.miembros.length} />}
              {(estado === 'Abierta' || estado === 'Activa' || estado === 'PorLiquidar') && <Rendimiento datos={datos} />}
            </div>
          </div>
          <ListaMiembros datos={datos} yo={billetera.direccion} />
          {estado === 'Finalizada' && <Resultados id={id} datos={datos} yo={billetera.direccion} />}
        </>
      )}
    </>
  )
}

function claseEstado(estado: string): string {
  switch (estado) {
    case 'Abierta':
      return 'abierta'
    case 'Activa':
      return 'en-curso'
    case 'PorLiquidar':
      return 'por-repartir'
    case 'Finalizada':
      return 'terminada'
    default:
      return 'cancelada'
  }
}
