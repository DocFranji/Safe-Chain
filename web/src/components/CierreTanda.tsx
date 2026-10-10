// Pantalla de cierre (UX, punto 6): "Terminó la tanda. Pusiste $X, recibiste $Y y tu depósito ganó $Z",
// con la insignia de reputación. Solo para quien participó; los montos salen de los eventos de la red.
import type { DatosTanda } from '../hooks/useTanda'
import type { EventoTanda } from '../lib/historia'
import { cierreDe } from '../lib/cierre'
import { dinero } from '../lib/glosario'
import { RUTA_CREAR, RUTA_PERFIL } from '../lib/rutas'
import { InsigniaNivel } from './InsigniaNivel'

type Props = { datos: DatosTanda; yo: string; eventos: EventoTanda[] | null }

export function CierreTanda({ datos, yo, eventos }: Props) {
  const m = datos.miembros.find((x) => x.direccion === yo)
  if (!m) return null
  const c = cierreDe(eventos ?? [], yo, m, datos.tanda.cuota, datos.tanda.n_miembros)

  return (
    <section className="panel cierre" aria-labelledby="cierre-titulo">
      <h2 id="cierre-titulo">Terminó la tanda</h2>
      <p className="cierre-frase">
        {m.moroso
          ? `Quedaste debiendo ${dinero(m.deuda)}. Págalo para ponerte al día y poder unirte a otras tandas.`
          : c.pozo !== null
            ? `Pusiste ${dinero(c.cuotas)} en cuotas y recibiste ${dinero(c.pozo)} de pozo.`
            : `Pusiste ${dinero(c.cuotas)} en cuotas y recibiste tu pozo en tu turno.`}
      </p>
      {c.devuelto !== null && c.ganancia !== null && (
        <p className="cierre-deposito">
          {c.ganancia > 0n ? (
            <>
              Tu depósito de {dinero(c.deposito)} volvió con <strong>{dinero(c.devuelto)}</strong>: ganó{' '}
              <strong>{dinero(c.ganancia)}</strong> de intereses y multas de otros.
            </>
          ) : c.ganancia === 0n ? (
            <>Recuperaste tu depósito completo: {dinero(c.devuelto)}.</>
          ) : (
            <>
              De tu depósito de {dinero(c.deposito)} volvieron {dinero(c.devuelto)}: el resto cubrió cuotas que no se
              pagaron a tiempo.
            </>
          )}
        </p>
      )}
      {eventos !== null && c.devuelto === null && (
        <p className="explica">La red ya no guarda el detalle de lo que se devolvió al final, pero cada quien recibió lo suyo.</p>
      )}
      <p className="cierre-reputacion">
        {m.atrasos === 0 && !m.moroso ? 'Pagaste siempre a tiempo: tu reputación sube.' : 'Tu reputación guarda cómo te fue.'}{' '}
        <InsigniaNivel dir={yo} />
      </p>
      <div className="fila-botones">
        <a className="boton principal" href={RUTA_CREAR}>
          Crear otra tanda
        </a>
        <a className="boton secundario" href={RUTA_PERFIL}>
          Ver mi reputación
        </a>
      </div>
    </section>
  )
}
