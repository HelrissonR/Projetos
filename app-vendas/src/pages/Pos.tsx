import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { customersRepo, productsRepo, salesRepo } from '../lib/db'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import ReceiptModal from '../components/ReceiptModal'
import { cartSubtotal, cartTotal, canAddQuantity } from '../lib/cart'
import type { CartLine, Customer, Product, SaleItem, Sale } from '../types'

export default function Pos() {
  const { settings, money } = useSettings()
  const notify = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState<string>('')
  const [discount, setDiscount] = useState(0)
  const [payment, setPayment] = useState('')
  const [checkout, setCheckout] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [printOnFinish, setPrintOnFinish] = useState(true)
  const [receipt, setReceipt] = useState<Sale | null>(null)

  const load = async () => {
    const [p, c] = await Promise.all([productsRepo.list(), customersRepo.list()])
    setProducts(p.filter((x) => x.active))
    setCustomers(c)
  }
  useEffect(() => {
    load()
  }, [])

  const enabledPayments = settings.payment_methods.filter((p) => p.enabled)

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.sku ?? '').toLowerCase().includes(search.toLowerCase()),
      ),
    [products, search],
  )

  const subtotal = cartSubtotal(cart)
  const total = cartTotal(cart, discount)

  const addToCart = (product: Product) => {
    setCart((c) => {
      const existing = c.find((l) => l.product.id === product.id)
      const inCart = existing?.quantity ?? 0
      if (!canAddQuantity(inCart, 1, product.stock)) {
        notify(`Estoque insuficiente de "${product.name}"`, 'error')
        return c
      }
      if (existing) {
        return c.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l))
      }
      return [...c, { product, quantity: 1 }]
    })
  }

  const setQty = (id: string, qty: number) => {
    const prod = products.find((p) => p.id === id)
    if (prod && qty > prod.stock) {
      notify(`Máximo em estoque: ${prod.stock}`, 'error')
      qty = prod.stock
    }
    if (qty <= 0) return setCart((c) => c.filter((l) => l.product.id !== id))
    setCart((c) => c.map((l) => (l.product.id === id ? { ...l, quantity: qty } : l)))
  }

  const finish = async () => {
    if (cart.length === 0) return
    if (!payment) return notify('Selecione a forma de pagamento', 'error')
    setProcessing(true)
    try {
      const customer = customers.find((c) => c.id === customerId) ?? null
      const items: SaleItem[] = cart.map((l) => ({
        product_id: l.product.id,
        product_name: l.product.name,
        quantity: l.quantity,
        unit_price: l.product.price,
        subtotal: l.product.price * l.quantity,
      }))
      const sale = await salesRepo.create(
        {
          customer_id: customer?.id ?? null,
          customer_name: customer?.name ?? null,
          total,
          discount,
          payment_method: payment,
          status: 'completed',
        },
        items,
      )
      // Baixa de estoque
      await Promise.all(cart.map((l) => productsRepo.adjustStock(l.product.id, -l.quantity)))
      notify(`Venda finalizada — ${money(total)}`)
      if (printOnFinish) setReceipt({ ...sale, items })
      setCart([])
      setDiscount(0)
      setCustomerId('')
      setPayment('')
      setCheckout(false)
      load()
    } catch (e) {
      notify('Erro ao finalizar: ' + (e as Error).message, 'error')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div>
      <PageHeader title="Vendas / PDV" subtitle="Selecione produtos e finalize a venda" />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Catálogo */}
        <div className="lg:col-span-2">
          <input
            className="input mb-4"
            placeholder="Buscar produto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stock <= 0}
                className="card flex flex-col items-start text-left transition hover:border-brand disabled:opacity-50"
              >
                {p.image && (
                  <img src={p.image} alt={p.name} className="mb-2 h-24 w-full rounded-md object-cover" />
                )}
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-brand">{money(p.price)}</span>
                <span className="mt-1 text-xs text-slate-400">{p.stock} em estoque</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-slate-400">Nenhum produto disponível.</p>}
          </div>
        </div>

        {/* Carrinho */}
        <div className="card sticky top-4 h-fit">
          <h2 className="mb-3 font-semibold">🛒 Carrinho</h2>
          {cart.length === 0 ? (
            <p className="text-sm text-slate-400">Carrinho vazio.</p>
          ) : (
            <ul className="space-y-3">
              {cart.map((l) => (
                <li key={l.product.id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{l.product.name}</div>
                    <div className="text-xs text-slate-400">{money(l.product.price)}</div>
                  </div>
                  <input
                    type="number"
                    className="input w-16 px-2 py-1 text-center"
                    value={l.quantity}
                    onChange={(e) => setQty(l.product.id, Number(e.target.value))}
                  />
                  <button className="btn-ghost px-2 py-1 text-red-600" onClick={() => setQty(l.product.id, 0)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-brand">{money(total)}</span>
            </div>
            <button
              className="btn-primary mt-4 w-full"
              disabled={cart.length === 0}
              onClick={() => setCheckout(true)}
            >
              Finalizar venda
            </button>
          </div>
        </div>
      </div>

      {/* Checkout modal */}
      <Modal
        open={checkout}
        title="Finalizar venda"
        onClose={() => setCheckout(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setCheckout(false)}>
              Voltar
            </button>
            <button className="btn-primary" onClick={finish} disabled={processing}>
              {processing ? 'Processando…' : `Confirmar ${money(total)}`}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Cliente (opcional)</label>
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Consumidor final</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Desconto</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={discount}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div>
            <label className="label">Forma de pagamento *</label>
            <div className="flex flex-wrap gap-2">
              {enabledPayments.map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setPayment(pm.label)}
                  className={payment === pm.label ? 'btn-primary' : 'btn-ghost border border-slate-300 dark:border-slate-700'}
                >
                  {pm.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={printOnFinish} onChange={(e) => setPrintOnFinish(e.target.checked)} />
            Emitir comprovante ao finalizar
          </label>
          <div className="rounded-lg bg-brand-soft p-3 text-center">
            <div className="text-sm text-slate-500">Total a pagar</div>
            <div className="text-2xl font-bold text-brand">{money(total)}</div>
          </div>
        </div>
      </Modal>

      <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />
    </div>
  )
}
