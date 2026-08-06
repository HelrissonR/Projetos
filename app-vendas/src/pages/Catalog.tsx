import { useEffect, useMemo, useState } from 'react'
import { categoriesRepo, ordersRepo, productsRepo } from '../lib/db'
import { useSettings } from '../context/SettingsContext'
import { buildOrderMessage, whatsappLink, type OrderContact } from '../lib/whatsapp'
import { isNativeSync, shareFilesNative } from '../lib/fileSave'
import { cartSubtotal } from '../lib/cart'
import { IconCart, IconSearch, IconStore } from '../components/icons'
import type { CartLine, Category, Product } from '../types'

type Sort = 'relevance' | 'price-asc' | 'price-desc' | 'name'
const SORTS: { id: Sort; label: string }[] = [
  { id: 'relevance', label: 'Relevância' },
  { id: 'price-asc', label: 'Menor preço' },
  { id: 'price-desc', label: 'Maior preço' },
  { id: 'name', label: 'Nome (A–Z)' },
]

/**
 * Catálogo público (storefront) premium para compartilhar com clientes:
 * filtro por categoria, ordenação, detalhe do produto e pedido via WhatsApp
 * com as fotos anexadas.
 */
export default function Catalog() {
  const { settings, money } = useSettings()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')
  const [sort, setSort] = useState<Sort>('relevance')
  const [cart, setCart] = useState<CartLine[]>([])
  const [detail, setDetail] = useState<Product | null>(null)
  const [checkout, setCheckout] = useState(false)
  const [contact, setContact] = useState<OrderContact>({})

  useEffect(() => {
    Promise.all([productsRepo.list(), categoriesRepo.list()]).then(([p, c]) => {
      setProducts(p.filter((x) => x.active && x.stock > 0))
      setCategories(c)
      setLoading(false)
    })
  }, [])

  // Só mostra categorias que têm produtos disponíveis.
  const usedCategories = useMemo(() => {
    const ids = new Set(products.map((p) => p.category_id).filter(Boolean))
    return categories.filter((c) => ids.has(c.id))
  }, [products, categories])

  const filtered = useMemo(() => {
    let list = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    if (activeCat !== 'all') list = list.filter((p) => p.category_id === activeCat)
    if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price)
    else if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price)
    else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [products, search, activeCat, sort])

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
  const [imageFiles, setImageFiles] = useState<File[]>([])

  // Pré-carrega as imagens dos itens do carrinho como arquivos (para o
  // navigator.share/Capacitor Share anexá-las sem quebrar o gesto do usuário).
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
    <div className="min-h-screen bg-slate-50 pb-28 dark:bg-slate-950">
      {/* Hero / cabeçalho da loja */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-black">
        <div className="mx-auto max-w-5xl px-4 py-7">
          <div className="flex items-center gap-4">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt="logo"
                className="h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
              />
            ) : (
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white dark:text-black">
                {settings.company_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight">{settings.company_name}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                <IconStore /> {settings.catalog_message || 'Escolha seus produtos e finalize pelo WhatsApp'}
              </p>
            </div>
          </div>

          {/* Busca */}
          <div className="relative mt-5">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <IconSearch />
            </span>
            <input
              className="input pl-10"
              placeholder="Buscar produto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Filtro por categoria (chips roláveis) */}
        {usedCategories.length > 0 && (
          <div className="mx-auto max-w-5xl overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-2">
              {[{ id: 'all', name: 'Todos' }, ...usedCategories].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                    activeCat === c.id
                      ? 'border-brand bg-brand text-white dark:text-black'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-brand dark:border-slate-700 dark:bg-black dark:text-slate-300'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Barra de ordenação */}
        {!loading && filtered.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-sm text-slate-500">{filtered.length} produto(s)</span>
            <select
              className="input w-auto py-1.5 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card p-3">
                <div className="skeleton mb-3 aspect-square w-full rounded-lg" />
                <div className="skeleton mb-2 h-4 w-3/4" />
                <div className="skeleton h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-900">
              <IconStore />
            </div>
            Nenhum produto encontrado.
          </div>
        ) : (
          <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => {
              const q = qtyOf(p.id)
              return (
                <div
                  key={p.id}
                  className="card group flex flex-col overflow-hidden p-0 transition-shadow hover:shadow-lg"
                >
                  <button
                    onClick={() => setDetail(p)}
                    className="relative block aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-900"
                    aria-label={`Ver ${p.name}`}
                  >
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-4xl text-slate-300">🧴</span>
                    )}
                  </button>
                  <div className="flex flex-1 flex-col p-3">
                    <button onClick={() => setDetail(p)} className="text-left">
                      <div className="line-clamp-2 text-sm font-medium leading-tight">{p.name}</div>
                    </button>
                    <div className="mt-1 text-base font-bold text-brand">{money(p.price)}</div>
                    <div className="mt-3">
                      {q === 0 ? (
                        <button className="btn-primary w-full py-1.5 text-sm" onClick={() => setQty(p, 1)}>
                          Adicionar
                        </button>
                      ) : (
                        <div className="flex items-center justify-between gap-1">
                          <button
                            className="btn-ghost border border-slate-300 px-3 dark:border-slate-700"
                            onClick={() => setQty(p, q - 1)}
                          >
                            −
                          </button>
                          <span className="font-semibold tabular-nums">{q}</span>
                          <button
                            className="btn-ghost border border-slate-300 px-3 dark:border-slate-700"
                            onClick={() => setQty(p, q + 1)}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Barra fixa do carrinho */}
      {count > 0 && (
        <div className="anim-sheet fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-black/95">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div className="text-sm">
              <span className="font-semibold">{count} item(ns)</span>
              <span className="ml-2 text-slate-500">{money(subtotal)}</span>
            </div>
            <button className="btn-primary" onClick={() => setCheckout(true)}>
              <IconCart /> Finalizar pedido
            </button>
          </div>
        </div>
      )}

      {/* Detalhe do produto */}
      {detail && (
        <div
          className="anim-fade fixed inset-0 z-40 overflow-y-auto bg-black/50"
          onClick={() => setDetail(null)}
        >
          <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
            <div
              className="card anim-sheet w-full rounded-b-none p-0 sm:anim-pop sm:max-w-md sm:rounded-b-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-t-lg bg-slate-100 dark:bg-slate-900">
                {detail.image ? (
                  <img
                    src={detail.image}
                    alt={detail.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-6xl text-slate-300">🧴</span>
                )}
                <button
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow dark:bg-black/80 dark:text-slate-200"
                  onClick={() => setDetail(null)}
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
              <div className="p-5">
                <h3 className="text-lg font-bold">{detail.name}</h3>
                <div className="mt-1 text-xl font-bold text-brand">{money(detail.price)}</div>
                {detail.description && (
                  <p className="mt-3 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
                    {detail.description}
                  </p>
                )}
                <p className="mt-3 text-xs text-slate-400">{detail.stock} disponível(is)</p>
                <div className="mt-5">
                  {qtyOf(detail.id) === 0 ? (
                    <button className="btn-primary w-full" onClick={() => setQty(detail, 1)}>
                      Adicionar ao pedido
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-4">
                      <button
                        className="btn-ghost border border-slate-300 px-4 dark:border-slate-700"
                        onClick={() => setQty(detail, qtyOf(detail.id) - 1)}
                      >
                        −
                      </button>
                      <span className="text-lg font-semibold tabular-nums">{qtyOf(detail.id)}</span>
                      <button
                        className="btn-ghost border border-slate-300 px-4 dark:border-slate-700"
                        onClick={() => setQty(detail, qtyOf(detail.id) + 1)}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checkout do cliente */}
      {checkout && (
        <div
          className="anim-fade fixed inset-0 z-40 overflow-y-auto bg-black/50"
          onClick={() => setCheckout(false)}
        >
          <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
            <div
              className="card anim-sheet w-full rounded-b-none sm:anim-pop sm:max-w-md sm:rounded-b-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Seus dados</h3>
                <button className="btn-ghost px-2 py-1" onClick={() => setCheckout(false)}>
                  ✕
                </button>
              </div>

              {/* Resumo do pedido */}
              <div className="mb-4 space-y-1 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
                {cart.map((l) => (
                  <div key={l.product.id} className="flex justify-between gap-2">
                    <span className="truncate text-slate-600 dark:text-slate-300">
                      {l.quantity}× {l.product.name}
                    </span>
                    <span className="flex-shrink-0 font-medium">{money(l.product.price * l.quantity)}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-bold dark:border-slate-800">
                  <span>Total</span>
                  <span>{money(subtotal)}</span>
                </div>
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
              <button className="btn-primary mt-4 w-full" onClick={sendOrder} disabled={sending}>
                {sending ? 'Enviando…' : 'Enviar pedido no WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
