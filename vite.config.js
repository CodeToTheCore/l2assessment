import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleLlmRequest } from './server/llmHandler.js'

// In `npm run dev`, answer /api/llm with the same handler Vercel runs in production.
// GROQ_API_KEY is read from .env here, on the dev server. It has no VITE_ prefix,
// so Vite never puts it in the code sent to the browser.
function devLlmApi(apiKey) {
  return {
    name: 'dev-llm-api',
    configureServer(server) {
      server.middlewares.use('/api/llm', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end(JSON.stringify({ error: 'Use POST.' }))
        }
        let raw = ''
        req.on('data', (chunk) => { raw += chunk })
        req.on('end', async () => {
          let body = {}
          try { body = JSON.parse(raw || '{}') } catch { /* handled as a bad request below */ }
          const result = await handleLlmRequest(body, { apiKey })
          res.statusCode = result.status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result.body))
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), devLlmApi(env.GROQ_API_KEY)],
  }
})
