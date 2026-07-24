import { supabase } from './supabase'
import type {
  Category,
  Customer,
  Product,
  Sale,
  SaleItem,
  Settings,
} from '../types'

/**
 * Camada de acesso a dados. Se o Supabase estiver configurado usa o banco real;
 * caso contrário cai num fallback em localStorage para permitir uso em modo demo.
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

const useDb = () => supabase !== null

// ---------- Settings ----------
export const settingsRepo = {
  async get(): Promise<Settings | null> {
    if (useDb()) {
      const { data } = await supabase!.from('settings').select('*').limit(1).maybeSingle()
      return (data as Settings) ?? null
    }
    return lsGet<Settings | null>('settings', null)
  },
  async save(s: Settings): Promise<Settings> {
    if (useDb()) {
      const payload = { ...s, id: s.id ?? undefined }
      const { data, error } = await supabase!
        .from('settings')
        .upsert(payload)
        .select()
        .single()
      if (error) throw error
      return data as Settings
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
      const { data } = await supabase!.from('categories').select('*').order('name')
      return (data as Category[]) ?? []
    }
    return lsGet<Category[]>('categories', [])
  },
  async create(name: string): Promise<Category> {
    if (useDb()) {
      const { data, error } = await supabase!
        .from('categories')
        .insert({ name })
        .select()
        .single()
      if (error) throw error
      return data as Category
    }
    const list = lsGet<Category[]>('categories', [])
    const cat = { id: uid(), name }
    lsSet('categories', [...list, cat])
    return cat
  },
  async remove(id: string): Promise<void> {
    if (useDb()) {
      await supabase!.from('categories').delete().eq('id', id)
      return
    }
    lsSet('categories', lsGet<Category[]>('categories', []).filter((c) => c.id !== id))
  },
}

// ---------- Products ----------
export const productsRepo = {
  async list(): Promise<Product[]> {
    if (useDb()) {
      const { data } = await supabase!.from('products').select('*').order('name')
      return (data as Product[]) ?? []
    }
    return lsGet<Product[]>('products', [])
  },
  async save(p: Product): Promise<Product> {
    if (useDb()) {
      const { data, error } = await supabase!.from('products').upsert(p).select().single()
      if (error) throw error
      return data as Product
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
      await supabase!.from('products').delete().eq('id', id)
      return
    }
    lsSet('products', lsGet<Product[]>('products', []).filter((p) => p.id !== id))
  },
  async adjustStock(id: string, delta: number): Promise<void> {
    if (useDb()) {
      const { data } = await supabase!.from('products').select('stock').eq('id', id).single()
      const current = (data?.stock as number) ?? 0
      await supabase!.from('products').update({ stock: current + delta }).eq('id', id)
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
      const { data } = await supabase!.from('customers').select('*').order('name')
      return (data as Customer[]) ?? []
    }
    return lsGet<Customer[]>('customers', [])
  },
  async save(c: Customer): Promise<Customer> {
    if (useDb()) {
      const { data, error } = await supabase!.from('customers').upsert(c).select().single()
      if (error) throw error
      return data as Customer
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
      await supabase!.from('customers').delete().eq('id', id)
      return
    }
    lsSet('customers', lsGet<Customer[]>('customers', []).filter((c) => c.id !== id))
  },
}

// ---------- Sales ----------
export const salesRepo = {
  async list(): Promise<Sale[]> {
    if (useDb()) {
      const { data } = await supabase!
        .from('sales')
        .select('*, items:sale_items(*)')
        .order('created_at', { ascending: false })
      return (data as Sale[]) ?? []
    }
    return lsGet<Sale[]>('sales', []).sort((a, b) => b.created_at.localeCompare(a.created_at))
  },
  async create(sale: Omit<Sale, 'id' | 'created_at'>, items: SaleItem[]): Promise<Sale> {
    if (useDb()) {
      const { data, error } = await supabase!
        .from('sales')
        .insert({
          customer_id: sale.customer_id,
          customer_name: sale.customer_name,
          total: sale.total,
          discount: sale.discount,
          payment_method: sale.payment_method,
          status: sale.status,
        })
        .select()
        .single()
      if (error) throw error
      const saleId = (data as Sale).id
      const rows = items.map((i) => ({ ...i, sale_id: saleId, id: undefined }))
      await supabase!.from('sale_items').insert(rows)
      return { ...(data as Sale), items }
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
  async cancel(id: string): Promise<void> {
    if (useDb()) {
      await supabase!.from('sales').update({ status: 'canceled' }).eq('id', id)
      return
    }
    const list = lsGet<Sale[]>('sales', [])
    const idx = list.findIndex((s) => s.id === id)
    if (idx >= 0) {
      list[idx].status = 'canceled'
      lsSet('sales', list)
    }
  },
}
