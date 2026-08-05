import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { SkeletonKpis } from '../components/Skeleton'
import { productsRepo, salesRepo } from '../lib/db'
import { useSettings } from '../context/SettingsContext'
import { dateOnly } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'
import { IconWarning } from '../components/icons'
import type { Product, Sale } from '../types'

// Paleta categórica acessível (validada para daltonismo/contraste em claro e
// escuro). Os produtos são identidades distintas → cores categóricas, não uma
// escala de cinza (que era difícil de distinguir na pizza). A pizza traz rótulo
// direto + legenda, o que satisfaz a regra de contraste no tema claro.
const PIE_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']
const PIE_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']

function Kpi({
  label,
  value,
  format,
  hint,
  onClick,
}: {
  label: string
  value: number
  format: (n: number) => string
  hint?: string
  onClick?: () => void
}) {
  const shown = useCountUp(value)
  const content = (
    <>
      <div className="truncate text-xs text-slate-500 sm:text-sm">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{format(shown)}</div>
      {hint && <div className="mt-1 truncate text-[11px] text-slate-400 sm:text-xs">{hint}</div>}
    </>
  )
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="card card-interactive p-4 text-left focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        {content}
      </button>
    )
  }
  return <div className="card p-4">{content}</div>
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
  const navigate = useNavigate()
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

  const isDark = settings.theme === 'dark'
  const pieColors = isDark ? PIE_DARK : PIE_LIGHT
  // Fresta de 2px na cor da superfície entre as fatias (separação premium).
  const pieStroke = isDark ? '#1a1a19' : '#ffffff'

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
  // Estoque baixo: só produtos ATIVOS (inativos não geram alarme), usando o
  // mínimo do produto quando definido, senão o limite global. Ordena do mais
  // crítico (esgotado primeiro, depois menor estoque) para priorizar reposição.
  const lowStock = useMemo(() => {
    const min = (p: Product) => p.min_stock ?? settings.low_stock_threshold
    return products
      .filter((p) => p.active && p.stock <= min(p))
      .sort((a, b) => a.stock - b.stock)
  }, [products, settings.low_stock_threshold])
  const outOfStock = lowStock.filter((p) => p.stock <= 0)
  // Quantos badges mostrar antes de resumir com "+N mais" (evita a parede de avisos).
  const LOW_STOCK_SHOWN = 15
  const lowStockShown = lowStock.slice(0, LOW_STOCK_SHOWN)

  // Lucro estimado = (preço de venda - custo atual) por item vendido, menos descontos
  const profit = useMemo(() => {
    let gross = 0
    let discount = 0
    completed.forEach((s) => {
      discount += s.discount || 0
      s.items?.forEach((i) => {
        // Custo histórico (gravado na venda) quando disponível; senão, cai no
        // custo atual do produto — mantém compatível com vendas antigas.
        const unitCost = i.cost ?? costOf.get(i.product_id) ?? 0
        gross += (i.unit_price - unitCost) * i.quantity
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

  if (loading)
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Visão geral do seu negócio" />
        <SkeletonKpis />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card"><div className="skeleton h-64 w-full" /></div>
          <div className="card"><div className="skeleton h-64 w-full" /></div>
        </div>
      </div>
    )

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

      <div className="stagger mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Faturamento" value={revenue} format={money} hint={`${completed.length} venda(s)`} />
        <Kpi label="Lucro estimado" value={profit} format={money} hint="preço − custo atual" />
        <Kpi label="Ticket médio" value={ticket} format={money} />
        <Kpi label="Valor em estoque" value={stockValue} format={money} hint={`${products.length} produto(s)`} />
        <Kpi
          label="Estoque baixo"
          value={lowStock.length}
          format={(n) => String(Math.round(n))}
          hint={
            outOfStock.length > 0
              ? `${outOfStock.length} esgotado(s) · toque`
              : lowStock.length > 0
                ? 'toque para ver'
                : 'tudo em dia'
          }
          onClick={lowStock.length > 0 ? () => navigate('/produtos?estoque=baixo') : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 font-semibold">Faturamento por dia</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2c2c2a' : '#e1e0d9'} />
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
                <Pie
                  data={topProducts}
                  dataKey="qty"
                  nameKey="name"
                  outerRadius={90}
                  label
                  stroke={pieStroke}
                  strokeWidth={2}
                >
                  {topProducts.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
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
          <h2 className="mb-1 flex flex-wrap items-center gap-2 font-semibold text-red-600">
            <IconWarning /> Produtos com estoque baixo
            <span className="text-xs font-normal text-slate-500">
              ({lowStock.length}
              {outOfStock.length > 0 ? ` · ${outOfStock.length} esgotado(s)` : ''})
            </span>
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Ordenados do mais crítico. Toque em um produto para abri-lo e repor o estoque.
          </p>
          <div className="flex flex-wrap gap-2">
            {lowStockShown.map((p) => {
              const gone = p.stock <= 0
              return (
                <button
                  key={p.id}
                  onClick={() => navigate('/produtos?busca=' + encodeURIComponent(p.name))}
                  className={`badge transition ${
                    gone
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/70'
                  }`}
                >
                  {p.name} — {gone ? 'esgotado' : `${p.stock} un`}
                </button>
              )
            })}
            {lowStock.length > LOW_STOCK_SHOWN && (
              <button
                onClick={() => navigate('/produtos?estoque=baixo')}
                className="badge bg-slate-200 text-slate-700 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                +{lowStock.length - LOW_STOCK_SHOWN} mais — ver todos
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
