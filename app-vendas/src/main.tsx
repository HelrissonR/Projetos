import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import { SettingsProvider } from './context/SettingsContext'
import { ToastProvider } from './context/ToastContext'
import { AuthProvider } from './context/AuthContext'
import './index.css'

// HashRouter permite rodar via file:// (duplo clique no index.html), útil para
// distribuir um pacote offline de testes. Ativado por VITE_HASH_ROUTER=1.
const Router = import.meta.env.VITE_HASH_ROUTER === '1' ? HashRouter : BrowserRouter

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <SettingsProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </SettingsProvider>
      </AuthProvider>
    </Router>
  </React.StrictMode>,
)
