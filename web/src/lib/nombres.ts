// Nombres para mostrar en lugar de direcciones largas (solo para la demo).
// Para ver la dirección de alguien:  stellar keys address ana
// Agreguen aquí las wallets del equipo si quieren que aparezcan con nombre.
export const NOMBRES: Record<string, string> = {
  GADMQOSHB74SMBATS6IF67ZKS2KJPQC4FOM6NDGGWADEUT253XCATVPD: 'Ana',
  GBPDH2E2EX5D7DO76YRIX477LPJWNPB7MJZRTEDJWBKZMS5KTLLRU2LO: 'Beto',
  GDPIB76VVYNDJINI6BRYGVOKTPOTERZABL43OB7DIOCLTXSKEUMJWNUN: 'Carla',
}

/** "GADMQO…TVPD" */
export function direccionCorta(direccion: string): string {
  return `${direccion.slice(0, 4)}…${direccion.slice(-4)}`
}

/** El nombre si lo conocemos; si no, la dirección corta. */
export function nombreDe(direccion: string): string {
  return NOMBRES[direccion] ?? direccionCorta(direccion)
}
