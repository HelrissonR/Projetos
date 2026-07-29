import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import ImageCropper from '../components/ImageCropper'
import ImportProductsModal from '../components/ImportProductsModal'
import BarcodeScannerButton from '../components/BarcodeScannerButton'
import { SkeletonCards } from '../components/Skeleton'
import { IconBox, IconEdit, IconTrash, IconPlus, IconDownload } from '../components/icons'
import { categoriesRepo, productsRepo } from '../lib/db'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import type { Category, Product } from '../types'

const emptyProduct = (): Product => ({
  id: '',
  name: '',
  sku: '',
  category_id: null,
  price: 0,
  cost: 0,
  stock: 0,
  active: true,
  image: null,
  custom: {},
})

export default function Products() {
  const { settings, money } = useSettings()
  const notify = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  // Prefiltro vindo dos avisos do Dashboard: ?busca=<nome> ou ?estoque=baixo
  const [search, setSearch] = useState(searchParams.get('busca') ?? '')
  const lowOnly = searchParams.get('estoque') === 'baixo'
  const [editing, setEditing] = useState<Product | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [catModal, setCatModal] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    const [p, c] = await Promise.all([productsRepo.list(), categoriesRepo.list()])
    setProducts(p)
    setCategories(c)
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        const matchesSearch =
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
        const matchesLow = !lowOnly || p.stock <= settings.low_stock_threshold
        return matchesSearch && matchesLow
      }),
    [products, search, lowOnly, settings.low_stock_threshold],
  )

  // Limpa o prefiltro (mostra todos os produtos de novo)
  const clearFilter = () => {
    setSearch('')
    setSearchParams({}, { replace: true })
  }

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '—'

  const saveProduct = async () => {
    if (!editing) return
    if (!editing.name.trim()) return notify('Informe o nome do produto', 'error')
    try {
      await productsRepo.save(editing)
      notify(editing.id ? 'Produto atualizado' : 'Produto criado')
      setEditing(null)
      load()
    } catch (e) {
      notify('Erro: ' + (e as Error).message, 'error')
    }
  }

  const remove = async (p: Product) => {
    if (!confirm(`Excluir "${p.name}"?`)) return
    try {
      await productsRepo.remove(p.id)
      notify('Produto excluído')
      load()
    } catch (e) {
      notify('Erro ao excluir: ' + (e as Error).message, 'error')
    }
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-selecionar o mesmo arquivo
    if (!file) return
    if (!file.type.startsWith('image/')) return notify('Selecione um arquivo de imagem', 'error')
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result as string)
    reader.readAsDataURL(file)
  }

  const addCategory = async () => {
    if (!newCat.trim()) return
    await categoriesRepo.create(newCat.trim())
    setNewCat('')
    const c = await categoriesRepo.list()
    setCategories(c)
    notify('Categoria criada')
  }

  return (
    <div>
      <PageHeader
        title="Produtos & Estoque"
        subtitle={`${products.length} produto(s) cadastrado(s)`}
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={() => setCatModal(true)}>
              Categorias
            </button>
            <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={() => setImportOpen(true)}>
              <IconDownload /> Importar CSV
            </button>
            <button className="btn-primary" onClick={() => setEditing(emptyProduct())}>
              <IconPlus /> Novo produto
            </button>
          </div>
        }
      />

      <div className="mb-4 flex max-w-lg gap-2">
        <input
          className="input"
          placeholder="Buscar por nome ou SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <BarcodeScannerButton
          onDetect={(code) => {
            setSearch(code)
            const found = products.find((p) => p.sku === code)
            if (found) notify(`Encontrado: ${found.name}`)
            else notify('Nenhum produto com esse código', 'error')
          }}
        />
      </div>

      {(lowOnly || searchParams.get('busca')) && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <span>
            {lowOnly
              ? `Mostrando apenas produtos com estoque baixo (≤ ${settings.low_stock_threshold}).`
              : `Filtrando por “${searchParams.get('busca')}”.`}
          </span>
          <button className="font-semibold underline" onClick={clearFilter}>
            Limpar filtro
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonCards count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<IconBox />} text="Nenhum produto encontrado. Cadastre o primeiro!" />
      ) : (
        <>
          {/* Mobile: cartões */}
          <div className="stagger grid gap-3 sm:grid-cols-2 md:hidden">
            {filtered.map((p) => {
              const low = p.stock <= settings.low_stock_threshold
              return (
                <div key={p.id} className="card flex min-w-0 items-center gap-3 p-3">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800">
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <IconBox />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-slate-400">{catName(p.category_id)}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-semibold">{money(p.price)}</span>
                      <span
                        className={`badge ${
                          low
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        }`}
                      >
                        {p.stock} un
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-col gap-1">
                    <button className="btn-ghost px-2 py-1" onClick={() => setEditing(p)} aria-label="Editar">
                      <IconEdit />
                    </button>
                    <button className="btn-ghost px-2 py-1 text-red-600" onClick={() => remove(p)} aria-label="Excluir">
                      <IconTrash />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop: tabela */}
          <div className="card hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800">
                <tr>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3 text-right">Preço</th>
                  <th className="p-3 text-right">Estoque</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const low = p.stock <= settings.low_stock_threshold
                  return (
                    <tr key={p.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/50">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800">
                            {p.image ? (
                              <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                            ) : (
                              <IconBox />
                            )}
                          </div>
                          <div>
                            <div className="font-medium">{p.name}</div>
                            {p.sku && <div className="text-xs text-slate-400">{p.sku}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-slate-500">{catName(p.category_id)}</td>
                      <td className="p-3 text-right">{money(p.price)}</td>
                      <td className="p-3 text-right">
                        <span
                          className={`badge ${
                            low
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          }`}
                        >
                          {p.stock} un
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button className="btn-ghost px-2 py-1" onClick={() => setEditing(p)} aria-label="Editar">
                          <IconEdit />
                        </button>
                        <button className="btn-ghost px-2 py-1 text-red-600" onClick={() => remove(p)} aria-label="Excluir">
                          <IconTrash />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal produto */}
      <Modal
        open={!!editing}
        title={editing?.id ? 'Editar produto' : 'Novo produto'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={saveProduct}>
              Salvar
            </button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Imagem</label>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-100 text-2xl text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                  {editing.image ? (
                    <img src={editing.image} alt="produto" className="h-full w-full object-cover" />
                  ) : (
                    <IconBox />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
                  <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={() => fileRef.current?.click()}>
                    {editing.image ? 'Trocar imagem' : 'Enviar imagem'}
                  </button>
                  {editing.image && (
                    <button type="button" className="btn-ghost text-red-600" onClick={() => setEditing({ ...editing, image: null })}>
                      Remover
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Nome *</label>
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className="label">SKU / Código</label>
              <div className="flex gap-2">
                <input className="input" value={editing.sku ?? ''} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} />
                <BarcodeScannerButton onDetect={(code) => setEditing({ ...editing, sku: code })} />
              </div>
            </div>
            <div>
              <label className="label">Categoria</label>
              <select
                className="input"
                value={editing.category_id ?? ''}
                onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}
              >
                <option value="">— Sem categoria —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Preço de venda</label>
              <input type="number" step="0.01" className="input" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Custo</label>
              <input type="number" step="0.01" className="input" value={editing.cost ?? 0} onChange={(e) => setEditing({ ...editing, cost: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Estoque</label>
              <input type="number" className="input" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Ativo
              </label>
            </div>

            {/* Campos personalizados */}
            {settings.product_custom_fields.length > 0 && (
              <div className="sm:col-span-2 mt-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <p className="mb-2 text-sm font-medium text-slate-500">Campos personalizados</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {settings.product_custom_fields.map((cf) => (
                    <div key={cf.key}>
                      <label className="label">{cf.label}</label>
                      {cf.type === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={Boolean(editing.custom[cf.key])}
                          onChange={(e) => setEditing({ ...editing, custom: { ...editing.custom, [cf.key]: e.target.checked } })}
                        />
                      ) : (
                        <input
                          type={cf.type === 'number' ? 'number' : 'text'}
                          className="input"
                          value={String(editing.custom[cf.key] ?? '')}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              custom: { ...editing.custom, [cf.key]: cf.type === 'number' ? Number(e.target.value) : e.target.value },
                            })
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal categorias */}
      <Modal open={catModal} title="Categorias" onClose={() => setCatModal(false)}>
        <div className="mb-4 flex gap-2">
          <input className="input" placeholder="Nova categoria" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <button className="btn-primary" onClick={addCategory}>
            Add
          </button>
        </div>
        <ul className="space-y-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
              {c.name}
              <button
                className="btn-ghost text-red-600"
                onClick={async () => {
                  try {
                    await categoriesRepo.remove(c.id)
                    setCategories(await categoriesRepo.list())
                  } catch (e) {
                    notify('Erro ao excluir categoria: ' + (e as Error).message, 'error')
                  }
                }}
              >
                ✕
              </button>
            </li>
          ))}
          {categories.length === 0 && <li className="text-sm text-slate-400">Nenhuma categoria.</li>}
        </ul>
      </Modal>

      {/* Cropper de imagem */}
      {cropSrc && editing && (
        <ImageCropper
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={(dataUrl) => {
            setEditing({ ...editing, image: dataUrl })
            setCropSrc(null)
          }}
        />
      )}

      <ImportProductsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={load}
        categories={categories}
      />
    </div>
  )
}
