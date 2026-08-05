import { supabase } from './supabase'
import { cachedRead, writeThrough, cacheGet, cacheSet } from './offline'
import type {
  Category,
  Customer,
  Order,
  Product,
  Sale,
  SaleItem,
  Settings,
} from '../types'

/**
 * Camada de acesso a dados.
 *  • Supabase configurado → modo conectado com suporte offline (ver offline.ts):
 *    lê do servidor com cache local de fallback e enfileira escritas quando sem
 *    internet, sincronizando ao reconectar.
 *  • Sem Supabase → fallback simples em localStorage (modo demonstração).
 */

const LS_PREFIX = 'appvendas:'

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function lsSet<T>(key: string, value: T) {
  localStorage.setItem(LS_PREFIX + key, JSON.stringify(value))
}
function uid() {
  return crypto.randomUUID()
}

// String vazia de chave estrangeira opcional → null (Postgres rejeita '' em uuid).
const emptyToNull = (v: string | null | undefined): string | null => (v === '' || v == null ? null : v)
// Converte um registro tipado num row genérico para o outbox/Supabase.
const asRow = (rec: object): Record<string, unknown> => rec as Record<string, unknown>

const useDb = () => supabase !== null

// Aplica um conjunto de deltas de estoque no cache de produtos de uma só vez
// (usado no efeito otimista de venda/cancelamento/aprovação). Ignora ids nulos.
function applyStockDelta(deltas: { id: string | null; delta: number }[]): void {
  const list = cacheGet<Product[]>('products', [])
  let changed = false
  for (const { id, delta } of deltas) {
    if (!id || !delta) continue
    const idx = list.findIndex((p) => p.id === id)
    if (idx >= 0) {
      list[idx] = { ...list[idx], stock: list[idx].stock + delta }
      changed = true
    }
  }
  if (changed) cacheSet('products', list)
}

// ---------- Settings ----------
export const settingsRepo = {
  async get(): Promise<Settings | null> {
    if (useDb()) {
      return cachedRead<Settings | null>(
        'settings',
        () => supabase!.from('settings').select('*').limit(1).maybeSingle(),
        null,
      )
    }
    return lsGet<Settings | null>('settings', null)
  },
  async save(s: Settings): Promise<Settings> {
    if (useDb()) {
      const rec: Settings = { ...s, id: s.id ?? uid() }
      await writeThrough(supabase!, { id: uid(), kind: 'upsert', table: 'settings', record: asRow(rec) }, () => {
        cacheSet('settings', rec)
      })
      return rec
    }
    const withId = { ...s, id: s.id ?? uid() }
    lsSet('settings', withId)
    return withId
  },
}

// ---------- Categories ----------
export const categoriesRepo = {
  async list(): Promise<Category[]> {
    if (useDb()) {
      return cachedRead<Category[]>(
        'categories',
        () => supabase!.from('categories').select('*').order('name'),
        [],
      )
    }
    return lsGet<Category[]>('categories', [])
  },
  async create(name: string): Promise<Category> {
    if (useDb()) {
      const rec: Category = { id: uid(), name }
      await writeThrough(supabase!, { id: uid(), kind: 'upsert', table: 'categories', record: asRow(rec) }, () => {
        const list = cacheGet<Category[]>('categories', [])
        cacheSet('categories', [...list, rec].sort((a, b) => a.name.localeCompare(b.name)))
      })
      return rec
    }
    const list = lsGet<Category[]>('categories', [])
    const cat = { id: uid(), name }
    lsSet('categories', [...list, cat])
    return cat
  },
  async remove(id: string): Promise<void> {
    if (useDb()) {
      await writeThrough(supabase!, { id: uid(), kind: 'delete', table: 'categories', rowId: id }, () => {
        cacheSet('categories', cacheGet<Category[]>('categories', []).filter((c) => c.id !== id))
      })
      return
    }
    lsSet('categories', lsGet<Category[]>('categories', []).filter((c) => c.id !== id))
  },
}

// ---------- Products ----------
export const productsRepo = {
  async list(): Promise<Product[]> {
    if (useDb()) {
      return cachedRead<Product[]>('products', () => supabase!.from('products').select('*').order('name'), [])
    }
    return lsGet<Product[]>('products', [])
  },
  async save(p: Product): Promise<Product> {
    if (useDb()) {
      const rec: Product = { ...p, id: p.id || uid(), category_id: emptyToNull(p.category_id) }
      await writeThrough(supabase!, { id: uid(), kind: 'upsert', table: 'products', record: asRow(rec) }, () => {
        const list = cacheGet<Product[]>('products', [])
        const idx = list.findIndex((x) => x.id === rec.id)
        if (idx >= 0) list[idx] = rec
        else list.push(rec)
        cacheSet('products', list)
      })
      return rec
    }
    const list = lsGet<Product[]>('products', [])
    const rec = { ...p, id: p.id || uid() }
    const idx = list.findIndex((x) => x.id === rec.id)
    if (idx >= 0) list[idx] = rec
    else list.push(rec)
    lsSet('products', list)
    return rec
  },
  async remove(id: string): Promise<void> {
    if (useDb()) {
      await writeThrough(supabase!, { id: uid(), kind: 'delete', table: 'products', rowId: id }, () => {
        cacheSet('products', cacheGet<Product[]>('products', []).filter((p) => p.id !== id))
      })
      return
    }
    lsSet('products', lsGet<Product[]>('products', []).filter((p) => p.id !== id))
  },
  // Ajuste de estoque como DELTA (preserva concorrência). Online usa a função
  // atômica no banco; offline, aplica no cache e enfileira o mesmo delta.
  async adjustStock(id: string, delta: number): Promise<void> {
    if (useDb()) {
      await writeThrough(
        supabase!,
        { id: uid(), kind: 'rpc', fn: 'adjust_product_stock', args: { p_id: id, p_delta: delta } },
        () => {
          const list = cacheGet<Product[]>('products', [])
          const idx = list.findIndex((p) => p.id === id)
          if (idx >= 0) {
            list[idx] = { ...list[idx], stock: list[idx].stock + delta }
            cacheSet('products', list)
          }
        },
      )
      return
    }
    const list = lsGet<Product[]>('products', [])
    const idx = list.findIndex((p) => p.id === id)
    if (idx >= 0) {
      list[idx].stock += delta
      lsSet('products', list)
    }
  },
}

// ---------- Customers ----------
export const customersRepo = {
  async list(): Promise<Customer[]> {
    if (useDb()) {
      return cachedRead<Customer[]>('customers', () => supabase!.from('customers').select('*').order('name'), [])
    }
    return lsGet<Customer[]>('customers', [])
  },
  async save(c: Customer): Promise<Customer> {
    if (useDb()) {
      const rec: Customer = { ...c, id: c.id || uid() }
      await writeThrough(supabase!, { id: uid(), kind: 'upsert', table: 'customers', record: asRow(rec) }, () => {
        const list = cacheGet<Customer[]>('customers', [])
        const idx = list.findIndex((x) => x.id === rec.id)
        if (idx >= 0) list[idx] = rec
        else list.push(rec)
        cacheSet('customers', list)
      })
      return rec
    }
    const list = lsGet<Customer[]>('customers', [])
    const rec = { ...c, id: c.id || uid() }
    const idx = list.findIndex((x) => x.id === rec.id)
    if (idx >= 0) list[idx] = rec
    else list.push(rec)
    lsSet('customers', list)
    return rec
  },
  async remove(id: string): Promise<void> {
    if (useDb()) {
      await writeThrough(supabase!, { id: uid(), kind: 'delete', table: 'customers', rowId: id }, () => {
        cacheSet('customers', cacheGet<Customer[]>('customers', []).filter((c) => c.id !== id))
      })
      return
    }
    lsSet('customers', lsGet<Customer[]>('customers', []).filter((c) => c.id !== id))
  },
}

// ---------- Sales ----------
export const salesRepo = {
  async list(): Promise<Sale[]> {
    if (useDb()) {
      const data = await cachedRead<Sale[]>(
        'sales',
        () => supabase!.from('sales').select('*, items:sale_items(*)').order('created_at', { ascending: false }),
        [],
      )
      return data
    }
    return lsGet<Sale[]>('sales', []).sort((a, b) => b.created_at.localeCompare(a.created_at))
  },
  // Cria venda + itens + baixa de estoque numa ÚNICA transação no banco
  // (RPC create_sale_tx). Se qualquer parte falhar, nada é gravado — evita
  // venda sem itens ou estoque baixado sem venda. Offline: enfileira a mesma
  // RPC (idempotente pelo id) e aplica o efeito otimista no cache (venda no
  // topo + estoque de cada item decrementado).
  async create(sale: Omit<Sale, 'id' | 'created_at'>, items: SaleItem[]): Promise<Sale> {
    if (useDb()) {
      const saleId = uid()
      const created_at = new Date().toISOString()
      const rec: Sale = { ...sale, id: saleId, created_at, items: items.map((i) => ({ ...i, id: uid(), sale_id: saleId })) }
      const p_sale: Record<string, unknown> = {
        id: saleId,
        customer_id: emptyToNull(sale.customer_id),
        customer_name: sale.customer_name,
        total: sale.total,
        discount: sale.discount,
        payment_method: sale.payment_method,
        status: sale.status,
        created_at,
      }
      const p_items = rec.items!.map((i) => asRow(i))
      await writeThrough(
        supabase!,
        { id: uid(), kind: 'rpc', fn: 'create_sale_tx', args: { p_sale, p_items } },
        () => {
          cacheSet('sales', [rec, ...cacheGet<Sale[]>('sales', [])])
          applyStockDelta(items.map((i) => ({ id: i.product_id, delta: -i.quantity })))
        },
      )
      return rec
    }
    const rec: Sale = {
      ...sale,
      id: uid(),
      created_at: new Date().toISOString(),
      items: items.map((i) => ({ ...i, id: uid() })),
    }
    const list = lsGet<Sale[]>('sales', [])
    lsSet('sales', [...list, rec])
    return rec
  },
  // Cancela a venda e DEVOLVE o estoque atomicamente (RPC cancel_sale_tx).
  // Idempotente: cancelar de novo não devolve estoque em dobro.
  async cancel(sale: Sale): Promise<void> {
    if (useDb()) {
      await writeThrough(
        supabase!,
        { id: uid(), kind: 'rpc', fn: 'cancel_sale_tx', args: { p_id: sale.id } },
        () => {
          const list = cacheGet<Sale[]>('sales', [])
          const idx = list.findIndex((s) => s.id === sale.id)
          // Só devolve estoque no cache se estava 'completed' (espelha o banco).
          if (idx >= 0 && list[idx].status === 'completed') {
            list[idx] = { ...list[idx], status: 'canceled' }
            cacheSet('sales', list)
            applyStockDelta((sale.items ?? []).map((i) => ({ id: i.product_id, delta: i.quantity })))
          }
        },
      )
      return
    }
    const list = lsGet<Sale[]>('sales', [])
    const idx = list.findIndex((s) => s.id === sale.id)
    if (idx >= 0) {
      list[idx].status = 'canceled'
      lsSet('sales', list)
    }
  },
  // Apaga TODO o histórico de vendas (e itens, via cascade no banco). Ação
  // destrutiva e rara → exige conexão (não vai para o outbox) para evitar
  // ambiguidade de sincronização. Lança em caso de erro.
  async clearAll(): Promise<void> {
    if (useDb()) {
      const { error } = await supabase!.from('sales').delete().not('id', 'is', null)
      if (error) throw error
      cacheSet('sales', [])
      return
    }
    lsSet('sales', [])
  },
}

// ---------- Orders (pedidos do catálogo) ----------
export const ordersRepo = {
  async list(): Promise<Order[]> {
    if (useDb()) {
      return cachedRead<Order[]>(
        'orders',
        () => supabase!.from('orders').select('*').order('created_at', { ascending: false }),
        [],
      )
    }
    return lsGet<Order[]>('orders', []).sort((a, b) => b.created_at.localeCompare(a.created_at))
  },
  // Inserção pública (feita pelo cliente no catálogo, sempre online). Não usa
  // .select() porque o visitante anônimo só tem permissão de INSERT em orders.
  async create(order: Omit<Order, 'id' | 'created_at' | 'status'>): Promise<Order> {
    const rec: Order = { ...order, id: uid(), status: 'pending', created_at: new Date().toISOString() }
    if (useDb()) {
      const { error } = await supabase!.from('orders').insert({ ...order, status: 'pending' })
      if (error) throw error
      return rec
    }
    lsSet('orders', [...lsGet<Order[]>('orders', []), rec])
    return rec
  },
  // Aprova o pedido: baixa o estoque e marca 'approved' ATOMICAMENTE (RPC
  // approve_order_tx), impedindo aprovação duplicada e estoque negativo. O
  // efeito otimista decrementa o estoque no cache.
  async approve(order: Order): Promise<void> {
    if (useDb()) {
      const saleId = uid()
      const created_at = new Date().toISOString()
      // Reflete no cache a venda gerada (espelha o que a RPC cria no banco).
      const saleRec: Sale = {
        id: saleId,
        customer_id: null,
        customer_name: order.customer_name,
        total: order.total,
        discount: 0,
        payment_method: 'Catálogo/WhatsApp',
        status: 'completed',
        created_at,
        items: (order.items ?? []).map((i) => ({ ...i, id: uid(), sale_id: saleId })),
      }
      await writeThrough(
        supabase!,
        { id: uid(), kind: 'rpc', fn: 'approve_order_tx', args: { p_id: order.id, p_sale_id: saleId } },
        () => {
          const list = cacheGet<Order[]>('orders', [])
          const idx = list.findIndex((o) => o.id === order.id)
          if (idx >= 0 && list[idx].status === 'pending') {
            list[idx] = { ...list[idx], status: 'approved' }
            cacheSet('orders', list)
            cacheSet('sales', [saleRec, ...cacheGet<Sale[]>('sales', [])])
            applyStockDelta((order.items ?? []).map((i) => ({ id: i.product_id, delta: -i.quantity })))
          }
        },
      )
      return
    }
    const list = lsGet<Order[]>('orders', [])
    const idx = list.findIndex((o) => o.id === order.id)
    if (idx >= 0) {
      list[idx].status = 'approved'
      lsSet('orders', list)
    }
  },
  // Gestão do pedido pelo admin (pode ocorrer offline → enfileira).
  async setStatus(id: string, status: Order['status']): Promise<void> {
    if (useDb()) {
      await writeThrough(
        supabase!,
        { id: uid(), kind: 'update', table: 'orders', rowId: id, patch: { status } },
        () => {
          const list = cacheGet<Order[]>('orders', [])
          const idx = list.findIndex((o) => o.id === id)
          if (idx >= 0) {
            list[idx] = { ...list[idx], status }
            cacheSet('orders', list)
          }
        },
      )
      return
    }
    const list = lsGet<Order[]>('orders', [])
    const idx = list.findIndex((o) => o.id === id)
    if (idx >= 0) {
      list[idx].status = status
      lsSet('orders', list)
    }
  },
  // Apaga TODOS os pedidos do catálogo. Ação destrutiva → exige conexão.
  async clearAll(): Promise<void> {
    if (useDb()) {
      const { error } = await supabase!.from('orders').delete().not('id', 'is', null)
      if (error) throw error
      cacheSet('orders', [])
      return
    }
    lsSet('orders', [])
  },
}
