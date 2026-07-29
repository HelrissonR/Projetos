import { useEffect, useMemo, useState } from 'react'
import { ordersRepo, productsRepo } from '../lib/db'
import { useSettings } from '../context/SettingsContext'
import { buildOrderMessage, whatsappLink, type OrderContact } from '../lib/whatsapp'
import { isNativeSync, shareFilesNative } from '../lib/fileSave'
import { cartSubtotal } from '../lib/cart'
import type { CartLine, Product } from '../types'

/**
 * Catálogo público (storefront) para compartilhar com clientes.
 * Os clientes escolhem produtos e enviam o pedido via WhatsApp.
 * Estruturado para evoluir para uma loja online (checkout/pagamento) no futuro.
 */
export default function Catalog() {
  const { settings, money } = useSettings()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [checkout, setCheckout] = useState(false)
  const [contact, setContact] = useState<OrderContact>({})

  useEffect(() => {
    productsRepo.list().then((p) => {
      setProducts(p.filter((x) => x.active && x.stock > 0))
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [products, search],
  )

  const qtyOf = (id: string) => cart.find((l) => l.product.id === id)?.quantity ?? 0
  const setQty = (product: Product, qty: number) => {
    const q = Math.max(0, Math.min(qty, product.stock))
    setCart((c) => {
      const rest = c.filter((l) => l.product.id !== product.id)
      return q > 0 ? [...rest, { product, quantity: q }] : rest
    })
  }
  const count = cart.reduce((s, l) => s + l.quantity, 0)
  const subtotal = cartSubtotal(cart)

  const [sending, setSending] = useState(false)
  // Imagens dos itens do carrinho já convertidas em arquivos, PRÉ-carregadas
  // para poder compartilhá-las no WhatsApp sem quebrar a exigência de "gesto do
  // usuário" do navigator.share (que não permite await antes da chamada).
  const [imageFiles, setImageFiles] = useState<File[]>([])

  useEffect(() => {
    let cancelled = false
    const withImg = cart.filter((l) => l.product.image)
    if (withImg.length === 0) {
      setImageFiles([])
      return
    }
    Promise.all(
      withImg.map(async (l) => {
        try {
          const res = await fetch(l.product.image!)
          const blob = await res.blob()
          const ext = (blob.type.split('/')[1] || 'jpg').split('+')[0]
          const safe = l.product.name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'produto'
          return new File([blob], `${safe}.${ext}`, { type: blob.type || 'image/jpeg' })
        } catch {
          return null
        }
      }),
    ).then((files) => {
      if (!cancelled) setImageFiles(files.filter((f): f is File => f !== null))
    })
    return () => {
      cancelled = true
    }
  }, [cart])

  const registerOrder = async () => {
    try {
      await ordersRepo.create({
        customer_name: contact.name || null,
        customer_phone: contact.phone || null,
        customer_address: contact.address || null,
        note: contact.note || null,
        items: cart.map((l) => ({
          product_id: l.product.id,
          product_name: l.product.name,
          quantity: l.quantity,
          unit_price: l.product.price,
          subtotal: l.product.price * l.quantity,
        })),
        total: subtotal,
        source: 'catalog',
      })
    } catch {
      /* o pedido segue pelo WhatsApp mesmo se o registro falhar */
    }
  }

  const finish = () => {
    setSending(false)
    setCart([])
    setCheckout(false)
    setContact({})
    setImageFiles([])
  }

  const sendOrder = () => {
    if (cart.length === 0) return
    setSending(true)
    const msg = buildOrderMessage(cart, settings, contact)
    const number = settings.whatsapp_number
    const title = `Pedido — ${settings.company_name}`
    const fallbackText = () => window.open(whatsappLink(msg, number), '_blank')

    // 1) App nativo (APK): o navigator.share do WebView do Android NÃO anexa
    //    arquivos — por isso antes ia só texto. Usa o plugin do Capacitor, que
    //    suporta anexos, para enviar as FOTOS + o texto.
    if (isNativeSync() && imageFiles.length > 0) {
      shareFilesNative(imageFiles, msg, title)
        .then((ok) => {
          if (!ok) fallbackText()
        })
        .finally(() => {
          registerOrder()
          finish()
        })
      return
    }

    // 2) Navegador do cliente (celular): Web Share API com arquivos. Chamada
    //    SÍNCRONA (sem await antes) para preservar o gesto do usuário.
    const canShareFiles =
      imageFiles.length > 0 &&
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: imageFiles })

    if (canShareFiles) {
      navigator
        .share({ files: imageFiles, text: msg, title })
        .catch((e: unknown) => {
          if ((e as Error)?.name !== 'AbortError') fallbackText()
        })
        .finally(() => {
          registerOrder()
          finish()
        })
      return
    }

    // 3) Fallback (desktop / sem suporte a arquivos): WhatsApp só com o texto.
    fallbackText()
    registerOrder()
    finish()
  }

  if (settings.catalog_enabled === false) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-slate-500">
        Este catálogo está indisponível no momento.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white pb-28 dark:bg-black">
      {/* Cabeçalho da loja */}
      <header className="border-b border-slate-200 px-4 py-5 dark:border-slate-800">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt="logo" className="h-11 w-11 rounded-lg object-cover" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand text-lg font-bold text-white dark:text-black">
              {settings.company_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold">{settings.company_name}</h1>
            {settings.catalog_message && (
              <p className="text-sm text-slate-500">{settings.catalog_message}</p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <input
          className="input mb-6 max-w-md"
          placeholder="Buscar produto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading ? (
          <p className="text-slate-400">Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-400">Nenhum produto disponível.</p>
        ) : (
          <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => {
              const q = qtyOf(p.id)
              return (
                <div key={p.id} className="card flex flex-col p-3 transition-shadow hover:shadow-md">
                  <div className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-md bg-slate-100 text-3xl text-slate-300 dark:bg-slate-900">
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      '📦'
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium leading-tight">{p.name}</div>
                    <div className="mt-1 font-bold text-brand">{money(p.price)}</div>
                  </div>
                  {q === 0 ? (
                    <button className="btn-primary mt-3 w-full py-1.5 text-sm" onClick={() => setQty(p, 1)}>
                      Adicionar
                    </button>
                  ) : (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <button className="btn-ghost border border-slate-300 px-3 dark:border-slate-700" onClick={() => setQty(p, q - 1)}>
                        −
                      </button>
                      <span className="font-semibold">{q}</span>
                      <button className="btn-ghost border border-slate-300 px-3 dark:border-slate-700" onClick={() => setQty(p, q + 1)}>
                        +
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Barra fixa do carrinho */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-black">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div className="text-sm">
              <span className="font-semibold">{count} item(ns)</span>
              <span className="ml-2 text-slate-500">{money(subtotal)}</span>
            </div>
            <button className="btn-primary" onClick={() => setCheckout(true)}>
              Enviar pedido pelo WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* Checkout do cliente */}
      {checkout && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setCheckout(false)}>
          <div className="card w-full max-w-md rounded-b-none sm:rounded-b-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Seus dados</h3>
              <button className="btn-ghost px-2 py-1" onClick={() => setCheckout(false)}>✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Nome</label>
                <input className="input" value={contact.name ?? ''} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" value={contact.phone ?? ''} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              </div>
              <div>
                <label className="label">Endereço de entrega</label>
                <input className="input" value={contact.address ?? ''} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
              </div>
              <div>
                <label className="label">Observação</label>
                <input className="input" value={contact.note ?? ''} onChange={(e) => setContact({ ...contact, note: e.target.value })} />
              </div>
            </div>
            {imageFiles.length > 0 && (
              <p className="mt-4 text-xs text-slate-500">
                📷 As fotos dos produtos serão anexadas ao pedido no WhatsApp (no celular). Basta escolher a
                conversa da loja ao compartilhar.
              </p>
            )}
            <div className="mt-4 flex items-center justify-between">
              <span className="font-bold">Total: {money(subtotal)}</span>
              <button className="btn-primary" onClick={sendOrder} disabled={sending}>
                {sending ? 'Enviando…' : 'Enviar no WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
