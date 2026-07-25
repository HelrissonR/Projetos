import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { ordersRepo, productsRepo, salesRepo } from '../lib/db'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { dateTime } from '../lib/format'
import { IconBell, IconPhone, IconPin, IconNote } from '../components/icons'
import type { Order } from '../types'

const STATUS_LABEL: Record<Order['status'], string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
}
const STATUS_CLASS: Record<Order['status'], string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export default function Orders() {
  const { money } = useSettings()
  const notify = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setOrders(await ordersRepo.list())
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const approve = async (o: Order) => {
    setBusy(o.id)
    try {
      // Cria a venda a partir do pedido
      await salesRepo.create(
        {
          customer_id: null,
          customer_name: o.customer_name,
          total: o.total,
          discount: 0,
          payment_method: 'Catálogo/WhatsApp',
          status: 'completed',
        },
        o.items.map((i) => ({
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal,
        })),
      )
      // Baixa de estoque
      await Promise.all(o.items.map((i) => productsRepo.adjustStock(i.product_id, -i.quantity)))
      await ordersRepo.setStatus(o.id, 'approved')
      notify('Pedido aprovado e convertido em venda')
      load()
    } catch (e) {
      notify('Erro ao aprovar: ' + (e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const reject = async (o: Order) => {
    if (!confirm('Rejeitar este pedido?')) return
    await ordersRepo.setStatus(o.id, 'rejected')
    notify('Pedido rejeitado')
    load()
  }

  const pending = orders.filter((o) => o.status === 'pending')

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle={`${pending.length} pendente(s) · ${orders.length} no total`}
      />

      {loading ? (
        <p className="text-slate-400">Carregando…</p>
      ) : orders.length === 0 ? (
        <EmptyState icon={<IconBell />} text="Nenhum pedido recebido pelo catálogo ainda." />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{o.customer_name ?? 'Cliente'}</span>
                    <span className={`badge ${STATUS_CLASS[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">{dateTime(o.created_at)}</div>
                  {o.customer_phone && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <IconPhone className="h-4 w-4" /> {o.customer_phone}
                    </div>
                  )}
                  {o.customer_address && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <IconPin className="h-4 w-4" /> {o.customer_address}
                    </div>
                  )}
                  {o.note && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <IconNote className="h-4 w-4" /> {o.note}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-brand">{money(o.total)}</div>
                </div>
              </div>

              <ul className="mt-3 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
                {o.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between py-0.5">
                    <span>
                      {i.quantity}× {i.product_name}
                    </span>
                    <span className="text-slate-500">{money(i.subtotal)}</span>
                  </li>
                ))}
              </ul>

              {o.status === 'pending' && (
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn-danger" onClick={() => reject(o)} disabled={busy === o.id}>
                    Rejeitar
                  </button>
                  <button className="btn-primary" onClick={() => approve(o)} disabled={busy === o.id}>
                    {busy === o.id ? 'Processando…' : 'Aprovar venda'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
