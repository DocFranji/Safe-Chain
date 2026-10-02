// Nombres para mostrar en lugar de direcciones largas (solo para la demo).
// Para ver la dirección de alguien:  stellar keys address ana
//
// Si vuelven a desplegar con llaves nuevas, las direcciones cambian. No hace falta editar este archivo:
// scripts/desplegar_testnet.sh escribe VITE_NOMBRES en web/.env.local (y las imprime para pegarlas en Vercel).
const POR_DEFECTO: Record<string, string> = {
  GADMQOSHB74SMBATS6IF67ZKS2KJPQC4FOM6NDGGWADEUT253XCATVPD: 'Ana',
  GBPDH2E2EX5D7DO76YRIX477LPJWNPB7MJZRTEDJWBKZMS5KTLLRU2LO: 'Beto',
  GDPIB76VVYNDJINI6BRYGVOKTPOTERZABL43OB7DIOCLTXSKEUMJWNUN: 'Carla',
}

/** VITE_NOMBRES es un JSON {"G...": "Ana", ...}. Si viene mal escrito se ignora (y se avisa en la consola). */
export function parsearNombres(crudo: string | undefined): Record<string, string> {
  if (!crudo || !crudo.trim()) return {}
  try {
    const dato: unknown = JSON.parse(crudo)
    if (typeof dato !== 'object' || dato === null || Array.isArray(dato)) throw new Error('no es un objeto')
    return Object.fromEntries(Object.entries(dato).filter(([, nombre]) => typeof nombre === 'string' && nombre.trim() !== ''))
  } catch (e) {
    console.warn('VITE_NOMBRES no es un JSON válido; se ignora.', e)
    return {}
  }
}

export const NOMBRES: Record<string, string> = { ...POR_DEFECTO, ...parsearNombres(import.meta.env.VITE_NOMBRES) }

/** "GADMQO…TVPD" */
export function direccionCorta(direccion: string): string {
  return `${direccion.slice(0, 4)}…${direccion.slice(-4)}`
}

/** El nombre si lo conocemos; si no, la dirección corta. */
export function nombreDe(direccion: string): string {
  return NOMBRES[direccion] ?? direccionCorta(direccion)
}
