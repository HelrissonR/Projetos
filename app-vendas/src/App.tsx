import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Pos from './pages/Pos'
import Products from './pages/Products'
import Customers from './pages/Customers'
import SalesHistory from './pages/SalesHistory'
import SettingsPage from './pages/SettingsPage'
import { useSettings } from './context/SettingsContext'

export default function App() {
  const { loading } = useSettings()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Carregando…
      </div>
    )
  }

  return (
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
  )
}
