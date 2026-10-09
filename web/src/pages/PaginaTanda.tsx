// Una tanda: el panel con la siguiente acción, la tarjeta de la rueda (rueda, turno y personas, como el celular de la
// portada) y, según el estado, la invitación (abierta), los intereses (en curso) o el cierre y los resultados (terminada).
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
import { esRecienCreada } from '../lib/recienCreada'
import { nombreConocido } from '../lib/nombres'
import { CierreTanda } from '../components/CierreTanda'

type Props = { id: number; billetera: Billetera; saldo: bigint | null }

export function PaginaTanda({ id, billetera, saldo }: Props) {
  const { datos, error, cargando, recargar } = useTanda(id)
  const ahora = useAhora()
  const historia = useEventos(id)
  const estado = datos?.tanda.estado.tag
  // M4: la moneda de esta tanda (TUSD o USDC de Blend) y el saldo de la persona en esa moneda.
  const moneda = monedaDe(datos?.tanda.token)
  const saldoMoneda = useSaldoEn(moneda, billetera.direccion, saldo)
  const yo = billetera.direccion
  // Mientras la tanda está abierta, para quien ya está adentro (o la creó) lo principal es invitar: va arriba.
  // Quien todavía no está en la tanda no ve la invitación: lo suyo es unirse.
  const adentro = !!datos && yo !== null && (datos.tanda.creador === yo || datos.miembros.some((m) => m.direccion === yo))
  const libres = datos ? datos.tanda.n_miembros - datos.miembros.length : 0
  const invitar = datos && estado === 'Abierta' && libres > 0 && (
    <Invitar
      id={id}
      tanda={datos.tanda}
      libres={libres}
      quien={yo ? nombreConocido(yo) : null}
      recienCreada={adentro && esRecienCreada(id)}
      principal={adentro}
    />
  )

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
      {cargando && !datos && !error && <p className="cargando">Cargando la tanda…</p>}

      {datos && (
        <>
          {adentro && invitar}
          {estado === 'Finalizada' && yo && <CierreTanda datos={datos} yo={yo} eventos={historia.eventos} />}
          <div className="escenario">
            {/* Como el celular de la portada: la rueda, el turno y las personas en una sola tarjeta. */}
            <section className="panel tarjeta-ronda" aria-label="La rueda de la tanda">
              <Rueda datos={datos} ahora={ahora} yo={billetera.direccion} />
              <ListaMiembros datos={datos} yo={billetera.direccion} />
            </section>
            <div className="columna">
              <PanelRonda id={id} datos={datos} billetera={billetera} saldo={saldoMoneda} ahora={ahora} alCambiar={recargar} />
              {(estado === 'Abierta' || estado === 'Activa' || estado === 'PorLiquidar') && <Rendimiento datos={datos} />}
            </div>
          </div>
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
