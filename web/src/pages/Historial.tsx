// Historial crediticio público de una dirección (misión M2): #/historial/<dirección>.
// Cualquiera con el enlace lo ve. Sin dirección en la URL muestra el de quien está conectado.
import { useState } from 'react'
import type { Billetera } from '../hooks/useBilletera'
import { useDireccionHistorial, useHistorial } from '../hooks/useHistorial'
import { BotonesEntrar } from '../components/BotonesEntrar'
import { BotonAmigo } from '../components/BotonAmigo'
import { Insignia } from '../components/InsigniaNivel'
import { Mensaje } from '../components/Mensaje'
import {
  CUOTA_MINIMA_TUSD,
  NIVELES,
  REGLAS_PUNTOS,
  TOPE_POR_TANDA,
  desglose,
  descuentoDe,
  esDireccion,
  nivelDePuntaje,
  puntajeDe,
  siguienteNivel,
  sinHistorial,
  tieneMoraPendiente,
  type Historial as DatosHistorial,
} from '../lib/historial'
import { fechaLarga } from '../lib/formato'
import { dinero } from '../lib/glosario'
import { direccionCorta, nombreDe, NOMBRES } from '../lib/nombres'
import { RUTA_LOBBY, irA, rutaHistorial } from '../lib/rutas'
import { EXPLORADOR } from '../config'
import '../components/historial.css'

type Props = { dir: string | null; billetera: Billetera }

export function Historial({ dir, billetera }: Props) {
  const quien = dir ?? billetera.direccion
  const estado = useHistorial(quien)
  const esMio = quien !== null && quien === billetera.direccion

  return (
    <section className="historial" aria-labelledby="historial-titulo">
      <p className="migas">
        <a href={RUTA_LOBBY}>← Todas las tandas</a>
      </p>

      {!quien ? (
        <>
          <h1 id="historial-titulo">Historial crediticio</h1>
          <p>Entra o conecta tu billetera para ver tu historial, o busca el de cualquier dirección.</p>
          <BotonesEntrar billetera={billetera} />
        </>
      ) : !esDireccion(quien) ? (
        <Mensaje titulo="Esa dirección no es válida">
          Revisa que esté completa: una dirección de Stellar empieza con G y tiene 56 caracteres.
        </Mensaje>
      ) : estado.tipo === 'cargando' ? (
        <p className="cargando" role="status">
          Leyendo el historial…
        </p>
      ) : estado.tipo === 'sin-contrato' ? (
        <Mensaje titulo="El historial todavía no está activo">
          Esta versión de Rounda aún no tiene conectado el contrato de historial crediticio.
        </Mensaje>
      ) : estado.tipo === 'error' ? (
        <p className="aviso error" role="alert">
          {estado.texto}
        </p>
      ) : (
        <FichaHistorial dir={quien} h={estado.historial} esMio={esMio} esGoogle={esMio && billetera.tipo === 'google'} />
      )}

      {quien && !esMio && esDireccion(quien) && (
        <div className="perfil-amigo">
          <BotonAmigo dir={quien} yo={billetera.direccion} />
        </div>
      )}

      <Buscar />
      <ComoSeCalcula />
    </section>
  )
}

type PropsFicha = {
  dir: string
  h: DatosHistorial
  esMio: boolean
  esGoogle: boolean
  /** Dentro del Perfil: el título es un h2 (la página ya tiene su h1). */
  enPerfil?: boolean
}

/** La ficha del historial de una dirección. La usan esta página y el Perfil (N4). */
export function FichaHistorial({ dir, h, esMio, esGoogle, enPerfil = false }: PropsFicha) {
  const Titulo = enPerfil ? 'h2' : 'h1'
  const puntaje = puntajeDe(h)
  const nivel = nivelDePuntaje(puntaje)
  const sig = siguienteNivel(puntaje)
  const actual = NIVELES.find((n) => n.nombre === nivel)!
  const avance = sig ? ((puntaje - actual.desde) / (sig.faltan + puntaje - actual.desde)) * 100 : 100
  const descuento = descuentoDe(h)
  const nombre = esMio ? 'Tu historial' : `Historial de ${NOMBRES[dir] ? nombreDe(dir) : direccionCorta(dir)}`
  const lineas = desglose(h)
  const contrato = useDireccionHistorial()

  return (
    <>
      <div className={`historial-cabeza nivel-${nivel.toLowerCase()}`}>
        <div className="historial-nivel" aria-hidden="true">
          <div>
            <strong>{puntaje}</strong>
            <span>{nivel}</span>
          </div>
        </div>
        <div className="historial-resumen">
          <Titulo id="historial-titulo">
            {nombre} <Insignia nivel={nivel} puntaje={puntaje} />
          </Titulo>
          <p className="historial-dir">{dir}</p>
          <p>
            <strong>{puntaje} puntos</strong> · nivel {nivel}
            {descuento > 0 && <> · {descuento} % menos de depósito en las tandas que lo ofrecen</>}
          </p>
          <div className="historial-barra" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(100, avance))}%` }} />
          </div>
          <p className="explica">
            {sig ? `Faltan ${sig.faltan} puntos para ${sig.nombre}.` : 'Nivel máximo.'}
          </p>
        </div>
      </div>

      {tieneMoraPendiente(h) && (
        <p className="aviso error">
          {esMio
            ? 'Tienes una deuda sin saldar en alguna tanda. Mientras no la pagues no puedes unirte a otra tanda ni recibir beneficios.'
            : 'Tiene una deuda sin saldar en alguna tanda. Mientras no la pague no puede unirse a otra tanda ni recibir beneficios, aunque su puntaje dé un nivel.'}
        </p>
      )}

      {sinHistorial(h) ? (
        <p className="explica">
          {esMio ? 'Todavía no tienes historial.' : 'Esta dirección todavía no tiene historial.'} Todo historial empieza
          en cero y crece con cada cuota pagada a tiempo y cada tanda terminada.
        </p>
      ) : (
        <>
          <h2>Qué ha hecho</h2>
          <ul className="historial-lista">
            {lineas.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="explica">
            Ha pagado {dinero(h.monto_pagado)} en cuotas. Primera actividad:{' '}
            {fechaLarga(Number(h.primera_actividad))} · última: {fechaLarga(Number(h.ultima_actividad))}.
          </p>
          <p className="explica">
            Puntos ganados: {h.puntos_positivos} · puntos perdidos: {h.puntos_negativos}. Lo negativo no se borra:
            saldar una deuda suma puntos, pero la mora queda registrada.
          </p>
        </>
      )}

      {esGoogle && (
        <p className="explica">
          Entraste con Google: tu historial es el de la billetera que Rounda creó para tu cuenta. Si un día usas otra
          billetera, su historial empieza en cero.
        </p>
      )}

      <p className="explica">
        Este historial está guardado en Stellar: nadie puede editarlo ni borrarlo, ni siquiera Rounda.{' '}
        {contrato && (
          <a href={`${EXPLORADOR}/contract/${contrato}`} target="_blank" rel="noreferrer">
            Verlo en el explorador
          </a>
        )}
      </p>
    </>
  )
}

function Buscar() {
  const [texto, setTexto] = useState('')
  const limpio = texto.trim().toUpperCase()
  const valido = esDireccion(limpio)
  return (
    <form
      className="historial-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (valido) irA(rutaHistorial(limpio))
      }}
    >
      <h2>Ver el historial de otra persona</h2>
      <div className="historial-buscar">
        <label htmlFor="buscar-dir" className="sr-solo">
          Dirección de Stellar
        </label>
        <input
          id="buscar-dir"
          placeholder="G… (dirección de Stellar)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-invalid={texto !== '' && !valido}
        />
        <button type="submit" className="boton secundario" disabled={!valido}>
          Ver historial
        </button>
      </div>
    </form>
  )
}

function ComoSeCalcula() {
  return (
    <details className="reglas">
      <summary>Cómo se calcula</summary>
      <table className="historial-tabla">
        <tbody>
          {REGLAS_PUNTOS.map((r) => (
            <tr key={r.hecho}>
              <td>{r.hecho}</td>
              <td className={`num ${r.puntos < 0 ? 'menos' : 'mas'}`}>
                {r.puntos > 0 ? '+' : ''}
                {r.puntos}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="explica">
        Puntaje = puntos ganados − puntos perdidos (nunca menos de 0). Niveles:{' '}
        {NIVELES.map((n, i) => `${n.nombre} desde ${n.desde}${n.descuento ? ` (${n.descuento} % menos de depósito)` : ''}${i < NIVELES.length - 1 ? ', ' : '.'}`)}
      </p>
      <p className="explica">
        Para que nadie infle su puntaje: solo suman las tandas con cuota de ${CUOTA_MINIMA_TUSD} o más, cada
        persona gana como mucho {TOPE_POR_TANDA} puntos por tanda, y el puntaje cero no da beneficios (abrir una
        billetera nueva no limpia nada). El depósito con descuento nunca baja de una cuota.
      </p>
    </details>
  )
}
