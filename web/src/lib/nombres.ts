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

// ---------------------------------------------------------------------------
// Apodos públicos (misión M2, N4): cada persona elige el suyo en su Perfil y queda guardado en el
// contrato de historial. Como cualquiera elige el que quiera, siempre se muestran con la dirección corta.
// Se leen una vez por dirección (al pedir su nombre) y quedan en caché; la app se vuelve a dibujar
// cuando llegan (`suscribirApodos`).
// ---------------------------------------------------------------------------

/** undefined = no se ha pedido; null = no tiene apodo. */
const apodos = new Map<string, string | null>()
let lector: ((dir: string) => Promise<string | null>) | null = null
let version = 0
const oyentes = new Set<() => void>()
let aviso: ReturnType<typeof setTimeout> | null = null

/** La app indica cómo leer un apodo (lib/historial.ts::leerApodo). Sin lector no se piden apodos. */
export function usarLectorDeApodos(f: ((dir: string) => Promise<string | null>) | null): void {
  lector = f
}

export function suscribirApodos(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export function versionApodos(): number {
  return version
}

function avisar() {
  version++
  // Varias lecturas que llegan juntas se dibujan una sola vez.
  if (aviso) return
  aviso = setTimeout(() => {
    aviso = null
    oyentes.forEach((o) => o())
  }, 50)
}

/** Guarda un apodo ya conocido (por ejemplo, el que la persona acaba de poner o quitar). */
export function fijarApodo(direccion: string, apodo: string | null): void {
  apodos.set(direccion, apodo)
  avisar()
}

/** El apodo de `direccion` si ya se leyó (null si no tiene). Si no se ha leído, lo pide. */
export function apodoDe(direccion: string): string | null {
  const a = apodos.get(direccion)
  if (a === undefined && lector) {
    apodos.set(direccion, null) // pedido en curso: no se vuelve a pedir
    lector(direccion)
      .then((x) => {
        if (x) fijarApodo(direccion, x)
      })
      .catch(() => undefined)
  }
  return a ?? null
}

/**
 * Cómo mostrar a alguien: su apodo; si no tiene, el nombre de la demo; si no, la dirección corta.
 * (UX: el apodo va solo, sin la dirección G... al lado. La dirección completa está en su Perfil.)
 */
export function nombreDe(direccion: string): string {
  return apodoDe(direccion) ?? NOMBRES[direccion] ?? direccionCorta(direccion)
}

/** El nombre de alguien solo si se conoce (apodo o nombre de la demo); null si solo hay dirección. */
export function nombreConocido(direccion: string): string | null {
  return apodoDe(direccion) ?? NOMBRES[direccion] ?? null
}
