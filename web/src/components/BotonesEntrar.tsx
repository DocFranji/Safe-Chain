// Botones para entrar cuando todavía no hay billetera: con Google (si está configurado) o con Freighter.
// Se usan en el encabezado (chico), en "Crear tanda" y en el panel de cada tanda.
import type { Billetera } from '../hooks/useBilletera'

export function BotonesEntrar({ billetera, chico = false }: { billetera: Billetera; chico?: boolean }) {
  const { google } = billetera
  const clase = chico ? 'boton chico' : 'boton principal'
  const claseFreighter = google ? (chico ? 'boton chico' : 'boton') : clase

  if (google?.conectada && !google.direccion) {
    return (
      <span className="explica" role="status">
        {google.creandoBilletera ? 'Creando tu billetera…' : (google.error ?? 'Preparando tu cuenta…')}
      </span>
    )
  }

  const freighter = billetera.instalada ? (
    <button type="button" className={claseFreighter} onClick={billetera.conectar}>
      {google ? 'Usar Freighter' : 'Conectar billetera'}
    </button>
  ) : (
    <a className={claseFreighter} href="https://freighter.app" target="_blank" rel="noreferrer">
      Instalar Freighter
    </a>
  )

  if (!google) return freighter

  return (
    <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" className={clase} onClick={google.entrar} disabled={!google.lista}>
        Entrar con Google
      </button>
      {/* Sin Freighter instalada no ofrecemos instalarla aquí: con Google basta. */}
      {billetera.instalada && freighter}
    </span>
  )
}
