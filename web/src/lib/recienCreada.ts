// "¿Esta tanda la acaba de crear esta persona, en este navegador?" Así la página de la tanda la recibe con
// "¡Tu tanda está lista!" en vez del saludo de siempre. Vive en sessionStorage: se borra al cerrar la pestaña.
// Si el navegador no deja guardar (modo privado, por ejemplo), simplemente no se muestra el saludo.
const CLAVE = 'rounda:recien-creada'

export function marcarRecienCreada(id: number): void {
  try {
    sessionStorage.setItem(CLAVE, String(id))
  } catch {
    // Sin almacenamiento: no pasa nada.
  }
}

export function esRecienCreada(id: number): boolean {
  try {
    return sessionStorage.getItem(CLAVE) === String(id)
  } catch {
    return false
  }
}
