// Botones para entrar cuando todavía no hay cuenta. "Entrar con Google" es el principal (si está configurado);
// Freighter queda como "Ya tengo billetera Stellar", para quien ya la usa.
// Se usan en el encabezado (chico), en "Crear tanda" y en el panel de cada tanda.
import type { Billetera } from '../hooks/useBilletera'

type Props = {
  billetera: Billetera
  chico?: boolean
  /** Texto del botón de Google, por ejemplo "Entrar con Google y unirme". */
  textoGoogle?: string
}

export function BotonesEntrar({ billetera, chico = false, textoGoogle = 'Entrar con Google' }: Props) {
  const { google } = billetera

  if (google?.conectada && !google.direccion) {
    return (
      <span className="explica" role="status">
        {google.creandoBilletera ? 'Creando tu cuenta…' : (google.error ?? 'Preparando tu cuenta…')}
      </span>
    )
  }

  // Sin Google configurado, Freighter es la única forma de entrar: va como botón principal.
  if (!google) {
    const clase = chico ? 'boton chico' : 'boton principal'
    return billetera.instalada ? (
      <button type="button" className={clase} onClick={billetera.conectar}>
        Conectar billetera Stellar
      </button>
    ) : (
      <a className={clase} href="https://freighter.app" target="_blank" rel="noreferrer">
        Instalar Freighter
      </a>
    )
  }

  const yaTengo = billetera.instalada ? (
    <button type="button" className="enlace-boton" onClick={billetera.conectar}>
      Ya tengo billetera Stellar
    </button>
  ) : null

  return (
    <span className={chico ? 'entrar entrar-chico' : 'entrar'}>
      <button type="button" className={chico ? 'boton chico' : 'boton principal grande'} onClick={google.entrar} disabled={!google.lista}>
        {textoGoogle}
      </button>
      {yaTengo}
    </span>
  )
}
