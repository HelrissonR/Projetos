import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import { SettingsProvider } from './context/SettingsContext'
import { ToastProvider } from './context/ToastContext'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { initSync } from './lib/syncManager'
import './index.css'

// HashRouter permite rodar via file:// (duplo clique no index.html), útil para
// distribuir um pacote offline de testes. Ativado por VITE_HASH_ROUTER=1.
const Router = import.meta.env.VITE_HASH_ROUTER === '1' ? HashRouter : BrowserRouter

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <SettingsProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </SettingsProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  </React.StrictMode>,
)

// Inicia a sincronização offline (drena o outbox ao reconectar/retomar).
initSync()

// Registro do service worker (PWA). Só em http/https e fora do build single-file.
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && import.meta.env.VITE_HASH_ROUTER !== '1') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
