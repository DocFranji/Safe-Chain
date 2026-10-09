// #/estado: ¿está todo listo para la demo? Se abre un rato antes y se mira de arriba abajo.
import { useCallback, useEffect, useState } from 'react'
import type { Billetera } from '../hooks/useBilletera'
import { ejecutarChequeos, type Chequeo, type Nivel } from '../lib/estado'
import { RUTA_DEMO, RUTA_LOBBY } from '../lib/rutas'
import { TANDA_ID, TOKEN_ID } from '../config'

const ICONO: Record<Nivel, string> = { ok: '✓', aviso: '!', error: '✕' }

/** Lo que solo se sabe desde este navegador: Freighter y su red. */
function chequeosLocales(b: Billetera): Chequeo[] {
  return [
    b.tipo === 'google'
      ? { id: 'freighter', titulo: 'Freighter en este navegador', nivel: 'ok', detalle: 'No hace falta: entraste con Google.' }
      : b.instalada
      ? { id: 'freighter', titulo: 'Freighter en este navegador', nivel: 'ok', detalle: 'Detectada.' }
      : {
          id: 'freighter',
          titulo: 'Freighter en este navegador',
          nivel: 'aviso',
          detalle: 'No se detecta la extensión.',
          solucion: b.google
            ? 'No hace falta si entras con Google. Si prefieres Freighter, instálala desde freighter.app.'
            : 'Instálala desde freighter.app (navegador de escritorio). Para solo proyectar la demo no hace falta.',
        },
    b.direccion === null
      ? {
          id: 'red',
          titulo: 'Billetera conectada y en Testnet',
          nivel: 'aviso',
          detalle: 'No hay ninguna billetera conectada.',
          solucion: 'Para crear o unirte, conéctala con el botón de arriba a la derecha. Para proyectar la demo no hace falta.',
        }
      : b.redCorrecta
        ? { id: 'red', titulo: 'Billetera conectada y en Testnet', nivel: 'ok', detalle: 'Conectada y en la red de pruebas.' }
        : {
            id: 'red',
            titulo: 'Billetera conectada y en Testnet',
            nivel: 'error',
            detalle: 'Freighter está en otra red.',
            solucion: 'Abre Freighter, toca el nombre de la red y elige «Test Net».',
          },
  ]
}

export function Estado({ billetera }: { billetera: Billetera }) {
  const [red, setRed] = useState<Chequeo[] | null>(null)
  const [revisando, setRevisando] = useState(false)
  const [hora, setHora] = useState<Date | null>(null)

  const revisar = useCallback(async () => {
    setRevisando(true)
    const r = await ejecutarChequeos()
    setRed(r)
    setHora(new Date())
    setRevisando(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(revisar, 0)
    return () => clearTimeout(t)
  }, [revisar])

  const todos = red === null ? null : [...red, ...chequeosLocales(billetera)]
  const errores = todos?.filter((c) => c.nivel === 'error').length ?? 0
  const avisos = todos?.filter((c) => c.nivel === 'aviso').length ?? 0
  const base = `${window.location.origin}${window.location.pathname}`

  return (
    <section className="estado-pagina" aria-labelledby="estado-titulo">
      <p className="migas">
        <a href={RUTA_LOBBY}>← Todas las tandas</a>
      </p>
      <div className="selector">
        <h1 id="estado-titulo">Estado del sistema</h1>
        <button className="boton chico" onClick={revisar} disabled={revisando}>
          {revisando ? 'Revisando…' : 'Volver a revisar'}
        </button>
      </div>
      <p className="explica lobby-intro">
        Ábrelo un rato antes de la demo. Si todo está en verde, estás listo; si algo falla, aquí dice qué hacer.
      </p>

      {todos === null ? (
        <p className="cargando">Revisando el contrato, las bóvedas y el faucet…</p>
      ) : (
        <>
          <p className={errores > 0 ? 'estado-resumen error' : avisos > 0 ? 'estado-resumen aviso' : 'estado-resumen ok'} role="status">
            {errores > 0
              ? `${errores === 1 ? 'Hay 1 problema' : `Hay ${errores} problemas`} que resolver antes de la demo.`
              : avisos > 0
                ? `Casi listo: ${avisos === 1 ? '1 aviso' : `${avisos} avisos`} para revisar.`
                : 'Todo listo para la demo.'}
            {hora && <span className="sub"> Revisado a las {hora.toLocaleTimeString('es-CR')}</span>}
          </p>

          <ul className="chequeos">
            {todos.map((c) => (
              <li key={c.id} className={`chequeo ${c.nivel}`}>
                <span className="chequeo-icono" aria-hidden="true">
                  {ICONO[c.nivel]}
                </span>
                <div>
                  <p className="chequeo-titulo">
                    {c.titulo}
                    <span className="sr-solo">: {c.nivel === 'ok' ? 'bien' : c.nivel === 'aviso' ? 'aviso' : 'problema'}</span>
                  </p>
                  <p className="chequeo-detalle">{c.detalle}</p>
                  {c.solucion && <p className="chequeo-solucion">{c.solucion}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="panel enlaces-demo">
        <h2>Enlaces para la demo</h2>
        <dl className="datos">
          <div className="dato">
            <dt>Proyectar (elige sola la tanda en curso)</dt>
            <dd className="enlace-largo">{`${base}${RUTA_DEMO}`}</dd>
          </div>
          <div className="dato">
            <dt>Para el jurado</dt>
            <dd className="enlace-largo">{base}</dd>
          </div>
          <div className="dato">
            <dt>Contrato de la tanda</dt>
            <dd className="enlace-largo">{TANDA_ID}</dd>
          </div>
          <div className="dato">
            <dt>Token</dt>
            <dd className="enlace-largo">{TOKEN_ID}</dd>
          </div>
        </dl>
        <p className="explica">
          Con <code>#/demo/N</code> (por ejemplo <code>{`${RUTA_DEMO}/7`}</code>) la pantalla se queda fija en la tanda N aunque el
          jurado cree otras.
        </p>
      </div>
    </section>
  )
}
