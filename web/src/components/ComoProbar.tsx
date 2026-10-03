// Guía para quien llega por primera vez (por ejemplo, el jurado): qué hacer, en orden, y cuál es el siguiente paso.
// Los pasos se marcan solos según el estado de la billetera y de la cuenta; cuando todo está listo, desaparece.
import type { Billetera } from '../hooks/useBilletera'
import type { Cuenta } from '../hooks/useCuenta'
import { RUTA_CREAR, RUTA_DEMO } from '../lib/rutas'
import { SIMBOLO } from '../config'

type Paso = { titulo: string; detalle: React.ReactNode; hecho: boolean; actual: boolean }

export function ComoProbar({ billetera, cuenta }: { billetera: Billetera; cuenta: Cuenta }) {
  const conectada = billetera.direccion !== null
  const redOk = conectada && billetera.redCorrecta
  const listaCuenta = cuenta.estado !== null && cuenta.estado.existe && cuenta.estado.trustline && (cuenta.saldo ?? 0n) > 0n

  // Ya conectada y con todo listo: la guía no hace falta. Mientras se lee la cuenta, tampoco la mostramos (evita un parpadeo).
  if (redOk && (listaCuenta || (cuenta.estado === null && !cuenta.error))) return null

  const pasoTusd: Paso = {
    titulo: `Consigue ${SIMBOLO} de prueba`,
    detalle: `Aparecerá una barra con los pasos: activar tu cuenta, aceptar ${SIMBOLO} y pedir ${SIMBOLO} gratis. Son dos clics.`,
    hecho: listaCuenta,
    actual: redOk && !listaCuenta,
  }

  // Con "entrar con Google" configurado, el camino corto no necesita Freighter.
  const pasosGoogle: Paso[] = [
    {
      titulo: 'Entra con Google',
      detalle: 'Usa el botón «Entrar con Google» de arriba a la derecha. Te creamos una billetera de pruebas al instante. (Si ya usas Freighter, también puedes conectarla.)',
      hecho: conectada,
      actual: !conectada,
    },
    pasoTusd,
  ]

  const pasosFreighter: Paso[] = [
    {
      titulo: 'Instala Freighter',
      detalle: (
        <>
          Es la billetera de Stellar, una extensión para el navegador de escritorio (Chrome, Brave, Edge o Firefox).{' '}
          <a href="https://freighter.app" target="_blank" rel="noreferrer">
            Descargar Freighter
          </a>
          .
        </>
      ),
      hecho: billetera.comprobada && billetera.instalada,
      actual: billetera.comprobada && !billetera.instalada,
    },
    {
      titulo: 'Cámbiala a Testnet',
      detalle: 'Abre Freighter, toca el nombre de la red en la parte de arriba y elige «Test Net». Es dinero de mentira: no cuesta nada.',
      hecho: redOk,
      actual: conectada && !billetera.redCorrecta,
    },
    {
      titulo: 'Conecta tu billetera',
      detalle: 'Usa el botón «Conectar billetera» de arriba a la derecha y acepta en Freighter.',
      hecho: conectada,
      actual: billetera.comprobada && billetera.instalada && !conectada,
    },
    pasoTusd,
  ]

  const pasos = billetera.google ? pasosGoogle : pasosFreighter

  return (
    <section className="como-probar" aria-labelledby="como-titulo">
      <div className="como-cabeza">
        <div>
          <h2 id="como-titulo">Pruébalo en {pasos.length} pasos</h2>
          <p className="explica">
            {billetera.google ? 'Solo necesitas una cuenta de Google.' : 'Necesitas la billetera Freighter.'} Si solo quieres
            mirar cómo funciona, abre la demo en vivo: no pide nada.
          </p>
        </div>
        <div className="como-botones">
          <a className="boton principal" href={RUTA_DEMO}>
            Ver la demo en vivo
          </a>
        </div>
      </div>

      <ol className="pasos">
        {pasos.map((p, i) => (
          <li key={p.titulo} className={p.hecho ? 'paso hecho' : p.actual ? 'paso actual' : 'paso'}>
            <span className="paso-numero" aria-hidden="true">
              {p.hecho ? '✓' : i + 1}
            </span>
            <div>
              <p className="paso-titulo">
                {p.titulo}
                {p.hecho && <span className="sr-solo"> (listo)</span>}
              </p>
              <p className="paso-detalle">{p.detalle}</p>
            </div>
          </li>
        ))}
      </ol>

      {listaCuenta === false && redOk && (
        <p className="explica">
          Cuando termines, <a href={RUTA_CREAR}>crea tu propia tanda</a> o únete a una abierta de la lista.
        </p>
      )}
    </section>
  )
}
