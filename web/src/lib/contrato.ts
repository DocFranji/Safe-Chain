// Todo lo que habla con el contrato de la tanda pasa por aquí.
//
//  - clienteLectura(): para CONSULTAR (get_tanda, get_miembros...). No pide firma ni cuesta nada.
//  - clienteFirma(dir): para ACCIONES (unirse, pagar_cuota...). Firma Freighter o la cuenta de Google (firmante.ts).
//  - leer(tx) / enviar(tx): ejecutan la llamada y convierten los errores a mensajes en español.
import { Client } from 'tanda'
import type { ClientOptions as ContractClientOptions } from '@stellar/stellar-sdk/contract'
import { rpc } from '@stellar/stellar-sdk'
import type { contract } from '@stellar/stellar-sdk'
import { firmarTransaccion } from './firmante'
import { NETWORK_PASSPHRASE, RPC_URL, TANDA_ID } from '../config'

const base = { contractId: TANDA_ID, networkPassphrase: NETWORK_PASSPHRASE, rpcUrl: RPC_URL }

export function clienteLectura(): Client {
  return new Client(base)
}

export function clienteFirma(direccion: string): Client {
  // `restore`: si algún dato de la tanda se archivó (Stellar archiva lo que nadie toca por meses) y la
  // red no puede restaurarlo sola dentro de la misma transacción, el SDK manda antes una restauración.
  // Esa firma extra también pasa por `firmarTransaccion`: sirve con Freighter y con la cuenta de Google.
  const opciones: ContractClientOptions & Pick<contract.MethodOptions, 'restore'> = {
    ...base,
    publicKey: direccion,
    signTransaction: (xdr, opciones) => firmarTransaccion(xdr, { ...opciones, address: direccion }),
    restore: true,
  }
  return new Client(opciones)
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
  10: 'Tienes una deuda pendiente en esta tanda. Págala con «Pagar mi deuda» para volver a pagar tus cuotas.',
  11: 'Tu dirección todavía no está verificada.',
  12: 'Esta billetera no tiene permiso para hacer esto.',
  13: 'El contrato todavía no se ha configurado.',
  // M3: turnos
  30: 'Revisa las opciones de turnos: algún valor está fuera de los límites.',
  31: 'Esta tanda no usa ese mecanismo de turnos.',
  32: 'Ese turno no existe en esta tanda.',
  33: 'Alguien ya eligió ese turno. Elige otro.',
  34: 'La oferta debe superar la mejor oferta actual sin pasar del máximo permitido.',
  35: 'Solo puede ofertar quien todavía no tiene turno y está al día.',
  36: 'En este momento no hay subasta abierta (la ronda ya venció o es la última).',
  37: 'Ese intercambio no es posible: los dos turnos deben ser futuros y nadie puede estar en mora.',
  38: 'Ya tienes una propuesta de intercambio abierta. Retírala antes de hacer otra.',
  39: 'No hay una propuesta de intercambio pendiente entre ustedes.',
  // M1: pagar deudas
  14: 'Esa persona no tiene deuda en esta tanda.',
  15: 'Ese monto es mayor que la deuda. Revisa cuánto falta por pagar.',
  16: 'Escribe un monto mayor que cero.',
  // Errores de la bóveda simulada (contrato aparte, mismo rango de M1)
  17: 'La bóveda no aceptó ese monto.',
  18: 'La bóveda no tiene suficientes participaciones para ese retiro. Avísanos: no debería pasar.',
}

// A veces el SDK entrega el NOMBRE del error del contrato en vez del código.
const CODIGO_POR_NOMBRE: Record<string, number> = {
  YaInicializado: 1,
  NoEncontrada: 2,
  EstadoInvalido: 3,
  ParametroInvalido: 4,
  YaEsMiembro: 5,
  TandaLlena: 6,
  NoEsMiembro: 7,
  YaPago: 8,
  RondaNoVencida: 9,
  MiembroMoroso: 10,
  NoVerificado: 11,
  NoAutorizado: 12,
  NoInicializado: 13,
  OpcionesInvalidas: 30,
  ModoNoPermite: 31,
  TurnoInvalido: 32,
  TurnoOcupado: 33,
  OfertaInvalida: 34,
  NoPuedeOfertar: 35,
  SinSubasta: 36,
  IntercambioInvalido: 37,
  PropuestaExistente: 38,
  SinPropuesta: 39,
  SinDeuda: 14,
  PagoExcesivo: 15,
  MontoInvalido: 16,
}

/** Convierte cualquier error (del contrato, de Freighter o de la red) en una frase clara. */
export function traducirError(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e)

  const porNombre = CODIGO_POR_NOMBRE[texto.trim()]
  if (porNombre) return MENSAJES[porNombre]

  // Stellar archiva los datos que nadie toca por un tiempo; hay que restaurarlos antes de leerlos.
  if (/restore some contract state|ExpiredState/i.test(texto)) {
    return 'Los datos de esta tanda expiraron por inactividad en la red y hay que restaurarlos antes de poder verla.'
  }

  // Errores del token TUSD: se revisan primero porque también usan "Error(Contract, #N)".
  if (/trustline/i.test(texto)) return 'Esta cuenta todavía no acepta TUSD. Agrega el activo TUSD en Freighter.'
  if (/balance is not sufficient|insufficient balance/i.test(texto)) return 'No tienes suficiente TUSD para esta operación.'

  const codigo = texto.match(/Error\(Contract, #(\d+)\)/)
  if (codigo) return MENSAJES[Number(codigo[1])] ?? `El contrato rechazó la operación (código ${codigo[1]}).`

  if (/declin|reject|cancel/i.test(texto)) return 'Cancelaste la firma en Freighter. No se hizo ningún cambio.'
  if (/account not found|Account not found/i.test(texto)) return 'Tu cuenta todavía no está activada en testnet. Usa el botón «Activar con Friendbot» de la barra de arriba.'
  if (/failed to fetch|networkerror|network error|timeout|timed out/i.test(texto)) return 'No pudimos conectarnos con la red de Stellar. Revisa tu internet e intenta de nuevo.'
  return `No se pudo completar la operación: ${texto.slice(0, 180)}`
}

// ---------------------------------------------------------------------------
// Ejecutar llamadas
// ---------------------------------------------------------------------------

type Simulada = { simulation?: rpc.Api.SimulateTransactionResponse }

/** Si la simulación ya falló (por ejemplo, "ya pagaste"), lanza el error antes de pedir firma. */
export function revisarSimulacion(tx: Simulada): void {
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

/**
 * Para acciones: pide la firma en Freighter, envía a la red y espera la confirmación.
 * Devuelve lo que respondió el contrato (por ejemplo, el número de la tanda recién creada).
 */
export async function enviar<T>(tx: Simulada & contract.AssembledTransaction<T>): Promise<T> {
  revisarSimulacion(tx)
  const enviada = await tx.signAndSend()
  return enviada.result
}
