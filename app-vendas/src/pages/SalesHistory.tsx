import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { salesRepo } from '../lib/db'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { dateTime, money as fmtMoney } from '../lib/format'
import { downloadCsv } from '../lib/csv'
import ReceiptModal from '../components/ReceiptModal'
import { IconReceipt, IconDownload, IconTrash } from '../components/icons'
import { SkeletonCards } from '../components/Skeleton'
import type { Sale } from '../types'

export default function SalesHistory() {
  const { money, settings } = useSettings()
  const notify = useToast()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState<Sale | null>(null)
  const [receipt, setReceipt] = useState<Sale | null>(null)

  // Filtros do histórico
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'all'>('all')
  const [payment, setPayment] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'canceled'>('all')

  const load = async () => {
    setLoading(true)
    setSales(await salesRepo.list())
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  // Formas de pagamento presentes nas vendas (para o seletor de filtro)
  const payments = useMemo(
    () => Array.from(new Set(sales.map((s) => s.payment_method).filter(Boolean))).sort(),
    [sales],
  )

  const since = useMemo(() => {
    if (period === 'all') return 0
    const days = period === 'today' ? 1 : period === '7d' ? 7 : 30
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (days - 1))
    return d.getTime()
  }, [period])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return sales.filter((s) => {
      if (since && new Date(s.created_at).getTime() < since) return false
      if (payment && s.payment_method !== payment) return false
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (q) {
        const inCustomer = (s.customer_name ?? '').toLowerCase().includes(q)
        const inItems = (s.items ?? []).some((i) => i.product_name.toLowerCase().includes(q))
        if (!inCustomer && !inItems) return false
      }
      return true
    })
  }, [sales, since, payment, statusFilter, search])

  // Total faturado no recorte filtrado (só vendas concluídas)
  const filteredRevenue = useMemo(
    () => filtered.filter((s) => s.status === 'completed').reduce((acc, s) => acc + s.total, 0),
    [filtered],
  )

  const hasFilter = search !== '' || period !== 'all' || payment !== '' || statusFilter !== 'all'
  const clearFilters = () => {
    setSearch('')
    setPeriod('all')
    setPayment('')
    setStatusFilter('all')
  }

  const cancel = async (s: Sale) => {
    if (!confirm('Cancelar esta venda? O estoque será devolvido.')) return
    try {
      // Cancela a venda e devolve o estoque na mesma transação (RPC).
      await salesRepo.cancel(s)
      notify('Venda cancelada')
      setViewing(null)
      load()
    } catch (e) {
      notify('Erro ao cancelar: ' + (e as Error).message, 'error')
    }
  }

  const clearHistory = async () => {
    if (
      !confirm(
        'Isto vai APAGAR permanentemente todo o histórico de vendas — use para recomeçar do zero ao sair dos testes. Os produtos, clientes e estoque NÃO são afetados. Deseja continuar?',
      )
    )
      return
    try {
      await salesRepo.clearAll()
      notify('Histórico de vendas apagado')
      load()
    } catch (e) {
      notify('Não foi possível limpar (verifique a conexão): ' + (e as Error).message, 'error')
    }
  }

  const exportCsv = async () => {
    const rows = filtered.map((s) => ({
      data: dateTime(s.created_at, settings.locale),
      cliente: s.customer_name ?? 'Consumidor final',
      pagamento: s.payment_method,
      itens: (s.items ?? []).map((i) => `${i.quantity}x ${i.product_name}`).join(' | '),
      desconto: fmtMoney(s.discount, settings.currency, settings.locale),
      total: fmtMoney(s.total, settings.currency, settings.locale),
      status: s.status === 'completed' ? 'Concluída' : 'Cancelada',
    }))
    if (rows.length === 0) return notify('Nada para exportar', 'error')
    try {
      await downloadCsv(`vendas-${new Date().toISOString().slice(0, 10)}.csv`, rows)
    } catch (e) {
      notify('Não foi possível exportar: ' + (e as Error).message, 'error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Histórico de vendas"
        subtitle={
          hasFilter
            ? `${filtered.length} de ${sales.length} venda(s) · ${money(filteredRevenue)}`
            : `${sales.length} venda(s)`
        }
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={exportCsv}>
              <IconDownload /> Exportar CSV
            </button>
            {sales.length > 0 && (
              <button className="btn-ghost border border-slate-300 text-red-600 dark:border-slate-700" onClick={clearHistory}>
                <IconTrash /> Limpar histórico
              </button>
            )}
          </div>
        }
      />

      {!loading && sales.length > 0 && (
        <div className="card mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="input"
            placeholder="Buscar cliente ou produto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
            <option value="all">Todo o período</option>
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </select>
          <select className="input" value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">Todas as formas</option>
            {payments.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">Todos os status</option>
            <option value="completed">Concluídas</option>
            <option value="canceled">Canceladas</option>
          </select>
          {hasFilter && (
            <button className="btn-ghost justify-self-start text-sm text-brand sm:col-span-2 lg:col-span-4" onClick={clearFilters}>
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {loading ? (
        <SkeletonCards count={5} />
      ) : sales.length === 0 ? (
        <EmptyState icon={<IconReceipt />} text="Nenhuma venda registrada ainda." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<IconReceipt />} text="Nenhuma venda encontrada com esses filtros." />
      ) : (
        <>
          {/* Mobile: cartões (evita corte de conteúdo em telas estreitas) */}
          <div className="stagger grid gap-3 md:hidden">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => setViewing(s)}
                className="card card-interactive flex min-w-0 items-center gap-3 p-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{s.customer_name ?? 'Consumidor final'}</span>
                    <span
                      className={`badge flex-shrink-0 ${
                        s.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      }`}
                    >
                      {s.status === 'completed' ? 'Concluída' : 'Cancelada'}
                    </span>
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {dateTime(s.created_at)} · {s.payment_method}
                  </div>
                </div>
                <span className="flex-shrink-0 font-semibold">{money(s.total)}</span>
              </button>
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="card hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800">
                <tr>
                  <th className="p-3">Data</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Pagamento</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="p-3">{dateTime(s.created_at)}</td>
                    <td className="p-3">{s.customer_name ?? 'Consumidor final'}</td>
                    <td className="p-3 text-slate-500">{s.payment_method}</td>
                    <td className="p-3 text-right font-medium">{money(s.total)}</td>
                    <td className="p-3">
                      <span
                        className={`badge ${
                          s.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        }`}
                      >
                        {s.status === 'completed' ? 'Concluída' : 'Cancelada'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button className="btn-ghost px-2 py-1" onClick={() => setViewing(s)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        open={!!viewing}
        title="Detalhe da venda"
        onClose={() => setViewing(null)}
        footer={
          viewing ? (
            <>
              <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={() => setReceipt(viewing)}>
                <IconReceipt /> Comprovante
              </button>
              {viewing.status === 'completed' && (
                <button className="btn-danger" onClick={() => cancel(viewing)}>
                  Cancelar venda
                </button>
              )}
            </>
          ) : undefined
        }
      >
        {viewing && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>{dateTime(viewing.created_at)}</span>
              <span>{viewing.payment_method}</span>
            </div>
            <div>Cliente: {viewing.customer_name ?? 'Consumidor final'}</div>
            <table className="w-full">
              <tbody>
                {viewing.items?.map((i) => (
                  <tr key={i.id ?? i.product_id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2">
                      {i.quantity}× {i.product_name}
                    </td>
                    <td className="py-2 text-right">{money(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {viewing.discount > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Desconto</span>
                <span>- {money(viewing.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-brand">{money(viewing.total)}</span>
            </div>
          </div>
        )}
      </Modal>

      <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />
    </div>
  )
}
