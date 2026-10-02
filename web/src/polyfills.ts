// El SDK de Stellar usa `Buffer`, que existe en Node pero no en el navegador.
// Este archivo se importa PRIMERO en main.tsx para que esté disponible desde el inicio.
import { Buffer } from 'buffer'

const g = globalThis as unknown as { Buffer?: typeof Buffer; global?: typeof globalThis }
g.Buffer ??= Buffer
g.global ??= globalThis
