import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // host: true binds all interfaces (IPv4 0.0.0.0 + IPv6) so http://localhost,
  // http://127.0.0.1 and the LAN IP all work. The default bound IPv6-only, which
  // broke browsers resolving localhost to 127.0.0.1 ("can't connect").
  server: { host: true, port: 5173 },
})
