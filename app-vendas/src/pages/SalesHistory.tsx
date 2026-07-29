import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { productsRepo, salesRepo } from '../lib/db'
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

  const load = async () => {
    setLoading(true)
    setSales(await salesRepo.list())
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const cancel = async (s: Sale) => {
    if (!confirm('Cancelar esta venda? O estoque será devolvido.')) return
    try {
      await salesRepo.cancel(s.id)
      // Devolve estoque
      if (s.items) {
        await Promise.all(s.items.map((i) => productsRepo.adjustStock(i.product_id, i.quantity)))
      }
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
    const rows = sales.map((s) => ({
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
        subtitle={`${sales.length} venda(s)`}
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

      {loading ? (
        <SkeletonCards count={5} />
      ) : sales.length === 0 ? (
        <EmptyState icon={<IconReceipt />} text="Nenhuma venda registrada ainda." />
      ) : (
        <>
          {/* Mobile: cartões (evita corte de conteúdo em telas estreitas) */}
          <div className="stagger grid gap-3 md:hidden">
            {sales.map((s) => (
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
                {sales.map((s) => (
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
