import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Necesario en WSL con el proyecto en /mnt/c: sin esto, Vite no detecta los cambios hechos desde Windows
  server: { watch: { usePolling: true } },
})
