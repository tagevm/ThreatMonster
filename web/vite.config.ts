import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In development the API runs on :5203 (dotnet run) and Vite proxies /api to it.
// `npm run build` writes the SPA into the API's wwwroot so `dotnet run` serves everything.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:5203',
    },
  },
  build: {
    outDir: '../src/ThreatMonster.Api/wwwroot',
    emptyOutDir: true,
  },
})
