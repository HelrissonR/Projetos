import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { customersRepo, productsRepo, salesRepo } from '../lib/db'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import ReceiptModal from '../components/ReceiptModal'
import BarcodeScannerButton from '../components/BarcodeScannerButton'
import { IconCart } from '../components/icons'
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
  const [received, setReceived] = useState('') // valor recebido em dinheiro (p/ troco)
  const [split, setSplit] = useState(false) // pagamento dividido em duas formas
  const [payment2, setPayment2] = useState('')
  const [amount2, setAmount2] = useState('') // valor pago na 2ª forma
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

  // Troco (só faz sentido quando o valor recebido supera o total)
  const receivedNum = Number(received) || 0
  const change = receivedNum > total ? receivedNum - total : 0
  // Pagamento dividido: a 2ª forma cobre `amount2`; a 1ª cobre o restante.
  const amount2Num = Number(amount2) || 0
  const amount1 = Math.max(0, total - amount2Num)

  const addToCart = (product: Product) => {
    setCart((c) => {
      const existing = c.find((l) => l.product.id === product.id)
      const inCart = existing?.quantity ?? 0
      if (!canAddQuantity(inCart, 1, product.stock)) {
        // Já está com todo o estoque disponível no carrinho (não é falta real).
        notify(
          inCart > 0
            ? `"${product.name}" já está no carrinho com todo o estoque disponível (${product.stock})`
            : `Estoque insuficiente de "${product.name}"`,
          'error',
        )
        return c
      }
      const qty = inCart + 1
      // Confirmação visível (no celular o carrinho fica fora da tela).
      notify(`${product.name} · ${qty} no carrinho`)
      if (existing) {
        return c.map((l) => (l.product.id === product.id ? { ...l, quantity: qty } : l))
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
    if (split) {
      if (!payment2) return notify('Selecione a segunda forma de pagamento', 'error')
      if (payment2 === payment) return notify('Escolha duas formas diferentes', 'error')
      if (amount2Num <= 0 || amount2Num >= total)
        return notify('O valor da 2ª forma deve ser maior que zero e menor que o total', 'error')
    }
    // Forma de pagamento registrada: composta quando dividido.
    const paymentLabel = split
      ? `${payment} (${money(amount1)}) + ${payment2} (${money(amount2Num)})`
      : payment
    setProcessing(true)
    try {
      const customer = customers.find((c) => c.id === customerId) ?? null
      const items: SaleItem[] = cart.map((l) => ({
        product_id: l.product.id,
        product_name: l.product.name,
        quantity: l.quantity,
        unit_price: l.product.price,
        subtotal: l.product.price * l.quantity,
        cost: l.product.cost ?? 0, // custo histórico (snapshot no momento da venda)
      }))
      const sale = await salesRepo.create(
        {
          customer_id: customer?.id ?? null,
          customer_name: customer?.name ?? null,
          total,
          discount,
          payment_method: paymentLabel,
          status: 'completed',
        },
        items,
      )
      // A baixa de estoque acontece junto da venda, na mesma transação (RPC).
      notify(change > 0 ? `Venda finalizada — troco ${money(change)}` : `Venda finalizada — ${money(total)}`)
      if (printOnFinish) setReceipt({ ...sale, items })
      setCart([])
      setDiscount(0)
      setCustomerId('')
      setPayment('')
      setReceived('')
      setSplit(false)
      setPayment2('')
      setAmount2('')
      setCheckout(false)
      load()
    } catch (e) {
      notify('Erro ao finalizar: ' + (e as Error).message, 'error')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader title="Vendas / PDV" subtitle="Selecione produtos e finalize a venda" />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Catálogo */}
        <div className="lg:col-span-2">
          <div className="mb-4 flex gap-2">
            <input
              className="input"
              placeholder="Buscar produto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <BarcodeScannerButton
              label="Ler código do produto"
              onDetect={(code) => {
                const found = products.find((p) => p.sku === code)
                if (found) {
                  addToCart(found)
                  notify(`${found.name} adicionado ao carrinho`)
                  setSearch('')
                } else {
                  setSearch(code)
                  notify('Nenhum produto com esse código', 'error')
                }
              }}
            />
          </div>
          <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stock <= 0}
                className="card card-interactive flex flex-col items-start text-left disabled:opacity-50"
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
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><IconCart /> Carrinho</h2>
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

      {/* Barra fixa de carrinho no celular (o carrinho lateral fica fora da tela) */}
      {cart.length > 0 && (
        <button
          onClick={() => setCheckout(true)}
          className="btn-primary fixed inset-x-3 bottom-3 z-30 flex items-center justify-between shadow-lg lg:hidden"
        >
          <span className="flex items-center gap-2">
            <IconCart />
            {cart.reduce((n, l) => n + l.quantity, 0)} item(ns)
          </span>
          <span className="font-bold">{money(total)} · Finalizar</span>
        </button>
      )}

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

          {/* Troco (dinheiro): valor recebido → mostra o troco a devolver */}
          {!split && (
            <div>
              <label className="label">Valor recebido (para troco)</label>
              <input
                type="number"
                step="0.01"
                className="input"
                placeholder="opcional"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
              />
              {change > 0 && (
                <div className="mt-1 flex justify-between rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <span>Troco</span>
                  <span>{money(change)}</span>
                </div>
              )}
            </div>
          )}

          {/* Pagamento dividido em duas formas */}
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
              Dividir em duas formas de pagamento
            </label>
            {split && (
              <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex flex-wrap gap-2">
                  {enabledPayments
                    .filter((pm) => pm.label !== payment)
                    .map((pm) => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setPayment2(pm.label)}
                        className={
                          payment2 === pm.label
                            ? 'btn-primary'
                            : 'btn-ghost border border-slate-300 dark:border-slate-700'
                        }
                      >
                        {pm.label}
                      </button>
                    ))}
                </div>
                <div>
                  <label className="label">Valor na 2ª forma{payment2 ? ` (${payment2})` : ''}</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={amount2}
                    onChange={(e) => setAmount2(e.target.value)}
                  />
                </div>
                <div className="flex justify-between text-sm text-slate-500">
                  <span>{payment || '1ª forma'}</span>
                  <span>{money(amount1)}</span>
                </div>
              </div>
            )}
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
