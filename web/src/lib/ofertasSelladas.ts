// Ofertas selladas en la subasta (misión M3): el sello que se manda al contrato y la "sal" que guarda
// este navegador para poder revelar la oferta después. Mismo cálculo que `revelar_oferta` en el
// contrato: sello = sha256(descuento_bps en 4 bytes big-endian ‖ sal de 32 bytes).
// No importa config.ts: la clave de guardado recibe el id del contrato (así se prueba sin navegador).

/** Sello de una oferta: 32 bytes. Sin la sal, nadie puede saber el porcentaje. */
export async function calcularSello(descuentoBps: number, sal: Uint8Array): Promise<Uint8Array> {
  const datos = new Uint8Array(4 + sal.length)
  new DataView(datos.buffer).setUint32(0, descuentoBps, false)
  datos.set(sal, 4)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', datos))
}

/** 32 bytes al azar: la clave que vuelve imposible adivinar la oferta desde el sello. */
export function nuevaSal(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

export const aHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
export const desdeHex = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)))

/** Lo que el navegador guarda de una oferta sellada (el porcentaje y la sal en hexadecimal). */
export type OfertaGuardada = { bps: number; sal: string }

/** Una oferta por contrato, tanda, ronda y persona. */
export const claveOferta = (contrato: string, id: number, ronda: number, quien: string) =>
  `rounda:oferta-sellada:${contrato}:${id}:${ronda}:${quien}`

export function guardarOferta(clave: string, o: OfertaGuardada): boolean {
  try {
    localStorage.setItem(clave, JSON.stringify(o))
    return true
  } catch {
    return false
  }
}

export function borrarOferta(clave: string): void {
  try {
    localStorage.removeItem(clave)
  } catch {
    // sin almacenamiento no hay nada que borrar
  }
}

export function leerOferta(clave: string): OfertaGuardada | null {
  try {
    const v = localStorage.getItem(clave)
    if (!v) return null
    const o = JSON.parse(v) as Partial<OfertaGuardada>
    return typeof o.bps === 'number' && typeof o.sal === 'string' && /^[0-9a-f]{64}$/.test(o.sal)
      ? { bps: o.bps, sal: o.sal }
      : null
  } catch {
    return null
  }
}

export type FaseSellada = 'sellar' | 'revelar' | 'cerrada'

/** Primera parte de la ronda: se sella. Después, hasta que vence: se revela. */
export function faseSellada(ahora: number, finSellado: number, vence: number): FaseSellada {
  if (ahora < finSellado) return 'sellar'
  if (ahora <= vence) return 'revelar'
  return 'cerrada'
}
