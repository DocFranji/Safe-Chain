// Quién firma las transacciones de Stellar.
//
//  - Freighter (la extensión): firma la transacción completa, como siempre.
//  - Privy (entrar con Google): la llave vive en Privy. Solo sabe firmar un "hash" (la huella de 32 bytes
//    de la transacción), así que aquí calculamos ese hash, se lo pasamos y pegamos la firma a la transacción.
//
// contrato.ts y cuenta.ts usan `firmarTransaccion` y no necesitan saber cuál de las dos está activa.
import { TransactionBuilder } from '@stellar/stellar-sdk'
import { signTransaction as firmarConFreighter } from '@stellar/freighter-api'
import { NETWORK_PASSPHRASE } from '../config'

/** Firma 32 bytes con la llave de `direccion` y devuelve la firma ed25519 (64 bytes). */
export type FirmarHash = (direccion: string, hash: Uint8Array) => Promise<Uint8Array>

type FirmantePrivy = { direccion: string; firmarHash: FirmarHash }

let privy: FirmantePrivy | null = null

/** La sesión de Google registra aquí su firmante al entrar y lo quita (null) al salir. */
export function usarFirmantePrivy(f: FirmantePrivy | null): void {
  privy = f
}

/** true si la dirección es la de la sesión de Google (y no una de Freighter). */
export function firmaConPrivy(direccion: string | undefined): boolean {
  return privy !== null && (direccion === undefined || direccion === privy.direccion)
}

type Opciones = { networkPassphrase?: string; address?: string }
type Resultado = { signedTxXdr: string; signerAddress?: string; error?: { message: string; code: number } }

/** Mismo formato que `signTransaction` de Freighter, para poder usarla en su lugar. */
export async function firmarTransaccion(xdr: string, opciones: Opciones = {}): Promise<Resultado> {
  const actual = privy
  if (actual === null || !firmaConPrivy(opciones.address)) return firmarConFreighter(xdr, opciones)

  const red = opciones.networkPassphrase ?? NETWORK_PASSPHRASE
  try {
    return { signedTxXdr: await firmarXdrConHash(xdr, red, actual.direccion, actual.firmarHash), signerAddress: actual.direccion }
  } catch (e) {
    const mensaje = e instanceof Error && e.message ? e.message : 'No se pudo firmar con tu cuenta de Google.'
    return { signedTxXdr: '', error: { message: mensaje, code: -1 } }
  }
}

/** Calcula el hash de la transacción, lo firma con `firmarHash` y devuelve el XDR ya firmado. */
export async function firmarXdrConHash(xdr: string, red: string, direccion: string, firmarHash: FirmarHash): Promise<string> {
  const tx = TransactionBuilder.fromXDR(xdr, red)
  const firma = await firmarHash(direccion, tx.hash())
  if (firma.length !== 64) throw new Error('La firma recibida no tiene el tamaño esperado.')
  // addSignature comprueba que la firma sea válida para esa dirección antes de agregarla.
  tx.addSignature(direccion, Buffer.from(firma).toString('base64'))
  return tx.toXDR()
}

/** Bytes -> "0x..." (formato que pide Privy). */
export function aHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** "0x..." -> bytes (formato en que Privy devuelve la firma). */
export function deHex(hex: string): Uint8Array {
  const limpio = hex.startsWith('0x') ? hex.slice(2) : hex
  if (limpio.length % 2 !== 0 || /[^0-9a-f]/i.test(limpio)) throw new Error('Firma en formato inesperado.')
  const bytes = new Uint8Array(limpio.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(limpio.slice(i * 2, i * 2 + 2), 16)
  return bytes
}
