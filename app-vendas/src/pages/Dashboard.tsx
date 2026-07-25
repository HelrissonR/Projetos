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
import { IconWarning } from '../components/icons'
import type { Product, Sale } from '../types'

// Escala de cinza para manter a estética monocromática de alto contraste
const PIE_COLORS = ['#111111', '#404040', '#6b7280', '#9ca3af', '#cbd5e1', '#e2e8f0']

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="truncate text-xs text-slate-500 sm:text-sm">{label}</div>
      <div className="mt-1 text-xl font-bold sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 truncate text-[11px] text-slate-400 sm:text-xs">{hint}</div>}
    </div>
  )
}

type Period = 'today' | '7d' | '30d' | 'all'
const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: 'today', label: 'Hoje', days: 1 },
  { id: '7d', label: '7 dias', days: 7 },
  { id: '30d', label: '30 dias', days: 30 },
  { id: 'all', label: 'Tudo', days: 0 },
]

export default function Dashboard() {
  const { settings, money } = useSettings()
  const [sales, setSales] = useState<Sale[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('30d')

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

  // Custo por produto (para estimar o lucro)
  const costOf = useMemo(() => {
    const m = new Map<string, number>()
    products.forEach((p) => m.set(p.id, p.cost ?? 0))
    return m
  }, [products])

  // Início do período selecionado
  const since = useMemo(() => {
    const days = PERIODS.find((p) => p.id === period)!.days
    if (days === 0) return 0
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (days - 1))
    return d.getTime()
  }, [period])

  const completed = useMemo(
    () =>
      sales.filter((s) => s.status === 'completed' && new Date(s.created_at).getTime() >= since),
    [sales, since],
  )

  const revenue = completed.reduce((s, x) => s + x.total, 0)
  const ticket = completed.length ? revenue / completed.length : 0
  const stockValue = products.reduce((s, p) => s + p.price * p.stock, 0)
  const lowStock = products.filter((p) => p.stock <= settings.low_stock_threshold)

  // Lucro estimado = (preço de venda - custo atual) por item vendido, menos descontos
  const profit = useMemo(() => {
    let gross = 0
    let discount = 0
    completed.forEach((s) => {
      discount += s.discount || 0
      s.items?.forEach((i) => {
        gross += (i.unit_price - (costOf.get(i.product_id) ?? 0)) * i.quantity
      })
    })
    return gross - discount
  }, [completed, costOf])

  // Faturamento por dia dentro do período (mín. 7 barras para leitura)
  const daily = useMemo(() => {
    const n = period === 'all' ? 30 : Math.max(PERIODS.find((p) => p.id === period)!.days, 7)
    const map = new Map<string, number>()
    for (let i = n - 1; i >= 0; i--) {
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
  }, [completed, settings.locale, period])

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
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral do seu negócio"
        action={
          <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm dark:border-slate-700">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 ${period === p.id ? 'bg-brand text-white dark:text-black' : 'bg-transparent text-slate-600 dark:text-slate-300'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Faturamento" value={money(revenue)} hint={`${completed.length} venda(s)`} />
        <Kpi label="Lucro estimado" value={money(profit)} hint="preço − custo atual" />
        <Kpi label="Ticket médio" value={money(ticket)} />
        <Kpi label="Valor em estoque" value={money(stockValue)} hint={`${products.length} produto(s)`} />
        <Kpi label="Estoque baixo" value={String(lowStock.length)} hint="abaixo do limite" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 font-semibold">Faturamento por dia</h2>
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
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-red-600"><IconWarning /> Produtos com estoque baixo</h2>
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
