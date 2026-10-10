// El botón de unirse a una tanda abierta (pedido 4 del plan v5). Si alguien del grupo tiene un pago pendiente en
// otra tanda, antes de pedir la firma se avisa y se pide confirmar ("Unirme igual"). Lo usan las dos formas de
// unirse: PanelRonda (por orden de llegada) y AccionesTurnos (eligiendo turno).
// Se pregunta en el momento de pulsar, no con lo que ya se dibujó: así nadie se une sin el aviso por tocar el
// botón antes de que termine la primera lectura. Casi siempre es instantáneo (el historial ya está en la caché).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { conPagoPendienteAhora } from '../hooks/useMora'
import { textoConfirmarUnirse } from '../lib/morosos'
import { nombreDe } from '../lib/nombres'
import './mora.css'

type Props = {
  texto: ReactNode
  deshabilitado: boolean
  /** Las personas que ya están en la tanda, en el orden en que se muestran (así los nombres salen siempre igual). */
  miembros: string[]
  /** Pide la firma y se une. */
  unirse: () => void
}

export function BotonUnirse({ texto, deshabilitado, miembros, unirse }: Props) {
  const [revisando, setRevisando] = useState(false)
  // Las personas con un pago pendiente que se encontraron al pulsar. Vacío = no se está preguntando nada.
  const [conPago, setConPago] = useState<string[]>([])
  const boton = useRef<HTMLButtonElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const estabaPreguntando = useRef(false)
  const idTitulo = useId()
  const preguntando = conPago.length > 0

  // El botón y la advertencia se cambian uno por el otro: el foco los sigue, para que quien usa teclado o lector
  // de pantalla no se quede sin lugar.
  useEffect(() => {
    if (preguntando) caja.current?.focus()
    else if (estabaPreguntando.current) boton.current?.focus()
    estabaPreguntando.current = preguntando
  }, [preguntando])

  async function pulsar() {
    setRevisando(true)
    const con = await conPagoPendienteAhora(miembros)
    setRevisando(false)
    if (con.length === 0) unirse()
    else setConPago(con)
  }

  if (preguntando) {
    const t = textoConfirmarUnirse(conPago.map(nombreDe))
    return (
      <div className="confirmar-union" ref={caja} tabIndex={-1} role="group" aria-labelledby={idTitulo}>
        <p className="confirmar-antes">Antes de unirte</p>
        <p className="confirmar-titulo" id={idTitulo}>
          {t.titulo}
        </p>
        <p>{t.detalle}</p>
        <div className="fila-botones">
          <button type="button" className="boton principal" onClick={() => setConPago([])}>
            Mejor no
          </button>
          <button
            type="button"
            className="boton secundario"
            disabled={deshabilitado}
            onClick={() => {
              setConPago([])
              unirse()
            }}
          >
            Unirme igual
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      ref={boton}
      className="boton principal"
      disabled={deshabilitado || revisando}
      onClick={() => void pulsar()}
    >
      {texto}
    </button>
  )
}
