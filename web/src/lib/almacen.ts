// El almacenamiento del navegador (localStorage), o null si no se puede usar. Acceder a `window.localStorage` ya
// puede lanzar un error (ventana privada, datos del sitio bloqueados), así que se pide aquí, dentro de un try.
// Quien lo usa recibe `null` y sigue sin guardar nada.
export type Almacen = Pick<Storage, 'getItem' | 'setItem'>

export function almacenLocal(): Almacen | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
