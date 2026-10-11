import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { textoRobots } from './src/lib/seo.ts'

/** robots.txt según el entorno de Vercel: solo producción se deja indexar (docs/seo.md). */
function robots(): Plugin {
  return {
    name: 'rounda-robots',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: textoRobots(process.env.VERCEL_ENV) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), robots()],
  // Necesario en WSL con el proyecto en /mnt/c: sin esto, Vite no detecta los cambios hechos desde Windows
  server: { watch: { usePolling: true } },
})
