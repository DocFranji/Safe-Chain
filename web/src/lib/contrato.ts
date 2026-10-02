// Todo lo que habla con el contrato de la tanda pasa por aquí.
//
//  - clienteLectura(): para CONSULTAR (get_tanda, get_miembros...). No pide firma ni cuesta nada.
//  - clienteFirma(dir): para ACCIONES (unirse, pagar_cuota...). Freighter pide confirmar.
//  - leer(tx) / enviar(tx): ejecutan la llamada y convierten los errores a mensajes en español.
import { Client } from 'tanda'
import { rpc } from '@stellar/stellar-sdk'
import type { contract } from '@stellar/stellar-sdk'
import { signTransaction } from '@stellar/freighter-api'
import { NETWORK_PASSPHRASE, RPC_URL, TANDA_ID } from '../config'

const base = { contractId: TANDA_ID, networkPassphrase: NETWORK_PASSPHRASE, rpcUrl: RPC_URL }

export function clienteLectura(): Client {
  return new Client(base)
}

export function clienteFirma(direccion: string): Client {
  return new Client({ ...base, publicKey: direccion, signTransaction })
}

// ---------------------------------------------------------------------------
// Errores: códigos del contrato (lib.rs, enum Error) -> mensajes para la persona
// ---------------------------------------------------------------------------

const MENSAJES: Record<number, string> = {
  1: 'El contrato ya está configurado.',
  2: 'Esa tanda no existe. Revisa el número.',
  3: 'La tanda no está en la etapa correcta para hacer esto.',
  4: 'Revisa los datos de la tanda: algún valor está fuera de los límites.',
  5: 'Esta billetera ya está en la tanda.',
  6: 'La tanda ya está completa.',
  7: 'Esta billetera no es miembro de la tanda.',
  8: 'Ya pagaste la cuota de esta ronda.',
  9: 'La ronda todavía no vence. Espera a que termine el plazo.',
  10: 'Tienes una deuda pendiente en esta tanda, así que no puedes pagar esta ronda.',
  11: 'Tu dirección todavía no está verificada.',
  12: 'Esta billetera no tiene permiso para hacer esto.',
  13: 'El contrato todavía no se ha configurado.',
}

/** Convierte cualquier error (del contrato, de Freighter o de la red) en una frase clara. */
export function traducirError(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e)

  // Errores del token TUSD: se revisan primero porque también usan "Error(Contract, #N)".
  if (/trustline/i.test(texto)) return 'Esta cuenta todavía no acepta TUSD. Agrega el activo TUSD en Freighter.'
  if (/balance is not sufficient|insufficient balance/i.test(texto)) return 'No tienes suficiente TUSD para esta operación.'

  const codigo = texto.match(/Error\(Contract, #(\d+)\)/)
  if (codigo) return MENSAJES[Number(codigo[1])] ?? `El contrato rechazó la operación (código ${codigo[1]}).`

  if (/declin|reject|cancel/i.test(texto)) return 'Cancelaste la firma en Freighter. No se hizo ningún cambio.'
  if (/account not found|Account not found/i.test(texto)) return 'Esta cuenta no existe en testnet. Fondéala con Friendbot desde Freighter.'
  if (/fetch|network|Failed to fetch|timeout/i.test(texto)) return 'No pudimos conectarnos con la red de Stellar. Revisa tu internet e intenta de nuevo.'
  return `No se pudo completar la operación: ${texto.slice(0, 180)}`
}

// ---------------------------------------------------------------------------
// Ejecutar llamadas
// ---------------------------------------------------------------------------

type Simulada = { simulation?: rpc.Api.SimulateTransactionResponse }

/** Si la simulación ya falló (por ejemplo, "ya pagaste"), lanza el error antes de pedir firma. */
function revisarSimulacion(tx: Simulada): void {
  const sim = tx.simulation
  if (sim && rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
}

/** Para consultas: devuelve el valor ya convertido (Tanda, lista de miembros, etc.). */
export async function leer<T>(
  tx: Simulada & { result: contract.Result<T, contract.ErrorMessage> },
): Promise<T> {
  revisarSimulacion(tx)
  const r = tx.result
  if (r.isErr()) throw new Error(r.unwrapErr().message || 'El contrato devolvió un error.')
  return r.unwrap()
}

/** Para acciones: pide la firma en Freighter, envía a la red y espera la confirmación. */
export async function enviar(tx: Simulada & contract.AssembledTransaction<unknown>): Promise<void> {
  revisarSimulacion(tx)
  await tx.signAndSend()
}
