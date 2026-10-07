// Perfil de quien está conectado (misión M2, N4): apodo público, cuenta, historial crediticio,
// "Mis deudas" y "Cerrar sesión" (también con Freighter).
import type { Billetera } from '../hooks/useBilletera'
import { useDireccionHistorial, useHistorial } from '../hooks/useHistorial'
import { BotonesEntrar } from '../components/BotonesEntrar'
import { EditarApodo } from '../components/EditarApodo'
import { MisDeudas } from '../components/MisDeudas'
import { FichaHistorial } from './Historial'
import { RUTA_LOBBY, rutaHistorial } from '../lib/rutas'
import '../components/historial.css'

export function Perfil({ billetera }: { billetera: Billetera }) {
  const yo = billetera.direccion
  const contrato = useDireccionHistorial()
  const historial = useHistorial(yo)

  if (!yo) {
    return (
      <section className="historial perfil" aria-labelledby="perfil-titulo">
        <h1 id="perfil-titulo">Tu perfil</h1>
        <p>Entra para ver tu perfil: tu apodo, tu historial y tus deudas.</p>
        <BotonesEntrar billetera={billetera} />
      </section>
    )
  }

  const google = billetera.tipo === 'google' ? billetera.google : null

  return (
    <section className="historial perfil" aria-labelledby="perfil-titulo">
      <p className="migas">
        <a href={RUTA_LOBBY}>← Todas las tandas</a>
      </p>
      <h1 id="perfil-titulo">Tu perfil</h1>

      <section className="perfil-cuenta" aria-labelledby="cuenta-titulo">
        <h2 id="cuenta-titulo">Tu cuenta</h2>
        {contrato ? (
          <EditarApodo yo={yo} contrato={contrato} />
        ) : (
          <p className="explica">El apodo estará disponible cuando esta versión tenga el historial conectado.</p>
        )}
        <p className="historial-dir">{yo}</p>
        <p className="explica">
          {google
            ? `Entraste con Google${google.correo ? ` (${google.correo})` : ''}: Rounda creó esta billetera para tu cuenta.`
            : 'Entraste con Freighter.'}
        </p>
      </section>

      <MisDeudas yo={yo} />

      <section aria-labelledby="historial-titulo">
        {historial.tipo === 'listo' ? (
          <>
            <FichaHistorial dir={yo} h={historial.historial} esMio esGoogle={!!google} enPerfil />
            <p>
              <a href={rutaHistorial(yo)}>Ver tu página pública de historial</a> (puedes compartir el enlace)
            </p>
          </>
        ) : historial.tipo === 'error' ? (
          <p className="aviso error">{historial.texto}</p>
        ) : historial.tipo === 'cargando' ? (
          <p className="cargando" role="status">
            Leyendo tu historial…
          </p>
        ) : null}
      </section>

      <section className="perfil-salir" aria-labelledby="salir-titulo">
        <h2 id="salir-titulo">Cerrar sesión</h2>
        <p className="explica">
          {google
            ? 'Sales de tu cuenta de Google en este navegador.'
            : 'Este navegador deja de usar tu cuenta de Freighter hasta que vuelvas a pulsar «Conectar billetera». Para quitarle el permiso a Rounda del todo, hazlo desde Freighter (Configuración → Sitios conectados).'}
        </p>
        <button type="button" className="boton secundario" onClick={() => void billetera.salir()}>
          Cerrar sesión
        </button>
      </section>
    </section>
  )
}
