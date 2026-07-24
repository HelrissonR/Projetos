import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import { useSettings } from './context/SettingsContext'
import { useAuth } from './context/AuthContext'

// Code-splitting: cada página vira um chunk carregado sob demanda.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Pos = lazy(() => import('./pages/Pos'))
const Products = lazy(() => import('./pages/Products'))
const Customers = lazy(() => import('./pages/Customers'))
const SalesHistory = lazy(() => import('./pages/SalesHistory'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function Loader() {
  return <div className="flex min-h-screen items-center justify-center text-slate-400">Carregando…</div>
}

export default function App() {
  const { loading: settingsLoading } = useSettings()
  const { user, loading: authLoading, authEnabled } = useAuth()

  if (settingsLoading || authLoading) return <Loader />

  // Se a autenticação estiver ativa (Supabase configurado) e não houver
  // usuário logado, exibe a tela de login.
  if (authEnabled && !user) return <Login />

  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="pdv" element={<Pos />} />
          <Route path="produtos" element={<Products />} />
          <Route path="clientes" element={<Customers />} />
          <Route path="vendas" element={<SalesHistory />} />
          <Route path="configuracoes" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
