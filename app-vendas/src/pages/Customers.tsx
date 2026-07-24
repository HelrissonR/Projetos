import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { customersRepo, salesRepo } from '../lib/db'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { dateOnly } from '../lib/format'
import type { Customer, Sale } from '../types'

const empty = (): Customer => ({
  id: '',
  name: '',
  email: '',
  phone: '',
  document: '',
  address: '',
  notes: '',
})

export default function Customers() {
  const { money } = useSettings()
  const notify = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Customer | null>(null)
  const [viewing, setViewing] = useState<Customer | null>(null)

  const load = async () => {
    setLoading(true)
    const [c, s] = await Promise.all([customersRepo.list(), salesRepo.list()])
    setCustomers(c)
    setSales(s)
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(
    () => customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [customers, search],
  )

  const historyFor = (id: string) =>
    sales.filter((s) => s.customer_id === id && s.status === 'completed')

  const save = async () => {
    if (!editing) return
    if (!editing.name.trim()) return notify('Informe o nome', 'error')
    await customersRepo.save(editing)
    notify(editing.id ? 'Cliente atualizado' : 'Cliente criado')
    setEditing(null)
    load()
  }

  const remove = async (c: Customer) => {
    if (!confirm(`Excluir "${c.name}"?`)) return
    await customersRepo.remove(c.id)
    notify('Cliente excluído')
    load()
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={`${customers.length} cliente(s)`}
        action={
          <button className="btn-primary" onClick={() => setEditing(empty())}>
            + Novo cliente
          </button>
        }
      />

      <input
        className="input mb-4 max-w-sm"
        placeholder="Buscar cliente…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="text-slate-400">Carregando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon="👥" text="Nenhum cliente cadastrado." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const h = historyFor(c.id)
            const total = h.reduce((s, x) => s + x.total, 0)
            return (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{c.name}</h3>
                    {c.phone && <p className="text-sm text-slate-500">{c.phone}</p>}
                    {c.email && <p className="text-sm text-slate-500">{c.email}</p>}
                    {c.address && <p className="mt-1 text-xs text-slate-400">📍 {c.address}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-ghost px-2 py-1" onClick={() => setViewing(c)}>
                      🧾
                    </button>
                    <button className="btn-ghost px-2 py-1" onClick={() => setEditing(c)}>
                      ✏️
                    </button>
                    <button className="btn-ghost px-2 py-1 text-red-600" onClick={() => remove(c)}>
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-sm text-slate-500">
                  <span>{h.length} compra(s)</span>
                  <span className="font-medium text-brand">{money(total)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit modal */}
      <Modal
        open={!!editing}
        title={editing?.id ? 'Editar cliente' : 'Novo cliente'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={save}>
              Salvar
            </button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Nome *</label>
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input className="input" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            </div>
            <div>
              <label className="label">CPF / CNPJ</label>
              <input className="input" value={editing.document ?? ''} onChange={(e) => setEditing({ ...editing, document: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Endereço</label>
              <input
                className="input"
                placeholder="Rua, número, bairro, cidade — UF"
                value={editing.address ?? ''}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Observações</label>
              <textarea className="input" rows={3} value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>

      {/* History modal */}
      <Modal open={!!viewing} title={`Histórico — ${viewing?.name ?? ''}`} onClose={() => setViewing(null)}>
        {viewing &&
          (historyFor(viewing.id).length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma compra registrada.</p>
          ) : (
            <ul className="space-y-2">
              {historyFor(viewing.id).map((s) => (
                <li key={s.id} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                  <span>{dateOnly(s.created_at)}</span>
                  <span className="font-medium">{money(s.total)}</span>
                </li>
              ))}
            </ul>
          ))}
      </Modal>
    </div>
  )
}
