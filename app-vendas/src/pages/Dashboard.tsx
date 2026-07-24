import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import PageHeader from '../components/PageHeader'
import { productsRepo, salesRepo } from '../lib/db'
import { useSettings } from '../context/SettingsContext'
import { dateOnly } from '../lib/format'
import type { Product, Sale } from '../types'

// Escala de cinza para manter a estética monocromática de alto contraste
const PIE_COLORS = ['#111111', '#404040', '#6b7280', '#9ca3af', '#cbd5e1', '#e2e8f0']

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { settings, money } = useSettings()
  const [sales, setSales] = useState<Sale[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([salesRepo.list(), productsRepo.list()]).then(([s, p]) => {
      setSales(s)
      setProducts(p)
      setLoading(false)
    })
  }, [])

  // Cor efetiva do acento (já invertida pelo tema via CSS var --brand)
  const accent = useMemo(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()
    return `rgb(${v || settings.brand_color})`
  }, [settings.theme, settings.brand_color])

  const completed = useMemo(() => sales.filter((s) => s.status === 'completed'), [sales])

  const revenue = completed.reduce((s, x) => s + x.total, 0)
  const ticket = completed.length ? revenue / completed.length : 0
  const stockValue = products.reduce((s, p) => s + p.price * p.stock, 0)
  const lowStock = products.filter((p) => p.stock <= settings.low_stock_threshold)

  // Faturamento por dia (últimos 7 dias)
  const daily = useMemo(() => {
    const map = new Map<string, number>()
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      map.set(d.toISOString().slice(0, 10), 0)
    }
    completed.forEach((s) => {
      const key = s.created_at.slice(0, 10)
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + s.total)
    })
    return Array.from(map.entries()).map(([date, total]) => ({
      dia: dateOnly(date, settings.locale).slice(0, 5),
      total,
    }))
  }, [completed, settings.locale])

  // Top produtos
  const topProducts = useMemo(() => {
    const map = new Map<string, number>()
    completed.forEach((s) =>
      s.items?.forEach((i) => map.set(i.product_name, (map.get(i.product_name) ?? 0) + i.quantity)),
    )
    return Array.from(map.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
  }, [completed])

  if (loading) return <p className="text-slate-400">Carregando…</p>

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral do seu negócio" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Faturamento total" value={money(revenue)} hint={`${completed.length} venda(s)`} />
        <Kpi label="Ticket médio" value={money(ticket)} />
        <Kpi label="Valor em estoque" value={money(stockValue)} hint={`${products.length} produto(s)`} />
        <Kpi label="Estoque baixo" value={String(lowStock.length)} hint="produtos abaixo do limite" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 font-semibold">Faturamento — últimos 7 dias</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="dia" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="total" fill={accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="mb-4 font-semibold">Produtos mais vendidos</h2>
          {topProducts.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sem vendas ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={topProducts} dataKey="qty" nameKey="name" outerRadius={90} label>
                  {topProducts.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="card mt-6">
          <h2 className="mb-3 font-semibold text-red-600">⚠️ Produtos com estoque baixo</h2>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((p) => (
              <span key={p.id} className="badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {p.name} — {p.stock} un
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
