import { beforeEach, describe, expect, it, vi } from 'vitest'

// -------- Ambiente: localStorage e navigator em memória (test env = node) --------
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  clear() {
    this.m.clear()
  }
}

const nav = { onLine: true }
;(globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage()
// navigator é um getter somente-leitura no Node — sobrescreve via defineProperty.
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true })

// Import depois de definir os globais (o módulo usa em runtime, não no import).
const {
  cacheGet,
  cacheSet,
  writeThrough,
  flush,
  pendingCount,
  isNetworkError,
  cachedRead,
} = await import('./offline')

// -------- Fake Supabase --------
type Behavior = 'ok' | 'network' | 'dberror'
function makeFakeSupabase() {
  const calls: { table?: string; kind: string; arg?: unknown }[] = []
  let behavior: Behavior = 'ok'
  const setBehavior = (b: Behavior) => (behavior = b)
  const result = () => {
    if (behavior === 'network') return Promise.reject(new TypeError('Failed to fetch'))
    if (behavior === 'dberror') return Promise.resolve({ error: { code: '23505', message: 'duplicate' } })
    return Promise.resolve({ error: null })
  }
  const supabase = {
    from(table: string) {
      return {
        upsert(arg: unknown) {
          calls.push({ table, kind: 'upsert', arg })
          return result()
        },
        delete() {
          return {
            eq(_c: string, id: string) {
              calls.push({ table, kind: 'delete', arg: id })
              return result()
            },
          }
        },
        update(patch: unknown) {
          return {
            eq(_c: string, id: string) {
              calls.push({ table, kind: 'update', arg: { id, patch } })
              return result()
            },
          }
        },
      }
    },
    rpc(fn: string, args: unknown) {
      calls.push({ kind: 'rpc', arg: { fn, args } })
      return result()
    },
  }
  return { supabase, calls, setBehavior }
}

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: MemStorage }).localStorage.clear()
  nav.onLine = true
  vi.restoreAllMocks()
})

describe('isNetworkError', () => {
  it('trata offline como erro de rede', () => {
    nav.onLine = false
    expect(isNetworkError(new Error('qualquer'))).toBe(true)
    nav.onLine = true
  })
  it('classifica TypeError/fetch como rede', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError({ message: 'network timeout' })).toBe(true)
  })
  it('não trata erro do banco (com code) como rede', () => {
    expect(isNetworkError({ code: '23505', message: 'duplicate key' })).toBe(false)
  })
})

describe('writeThrough', () => {
  it('online: envia ao supabase e atualiza cache, sem outbox', async () => {
    const { supabase, calls } = makeFakeSupabase()
    await writeThrough(
      supabase as never,
      { id: 'op1', kind: 'upsert', table: 'products', record: { id: 'p1', name: 'X' } },
      () => cacheSet('products', [{ id: 'p1', name: 'X' }]),
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'products', kind: 'upsert' })
    expect(pendingCount()).toBe(0)
    expect(cacheGet('products', [])).toEqual([{ id: 'p1', name: 'X' }])
  })

  it('offline: NÃO chama supabase, atualiza cache e enfileira', async () => {
    const { supabase, calls } = makeFakeSupabase()
    nav.onLine = false
    await writeThrough(
      supabase as never,
      { id: 'op2', kind: 'upsert', table: 'products', record: { id: 'p2', name: 'Y' } },
      () => cacheSet('products', [{ id: 'p2', name: 'Y' }]),
    )
    expect(calls).toHaveLength(0)
    expect(pendingCount()).toBe(1)
    expect(cacheGet('products', [])).toEqual([{ id: 'p2', name: 'Y' }])
  })

  it('erro real do banco: propaga (página trata) e não enfileira', async () => {
    const { supabase, setBehavior } = makeFakeSupabase()
    setBehavior('dberror')
    await expect(
      writeThrough(
        supabase as never,
        { id: 'op3', kind: 'delete', table: 'products', rowId: 'p3' },
        () => {},
      ),
    ).rejects.toBeDefined()
    expect(pendingCount()).toBe(0)
  })
})

describe('flush', () => {
  it('drena o outbox em ordem quando volta a ficar online', async () => {
    const { supabase, calls } = makeFakeSupabase()
    // enfileira 3 ops offline
    nav.onLine = false
    for (const p of ['a', 'b', 'c']) {
      await writeThrough(
        supabase as never,
        { id: 'op-' + p, kind: 'upsert', table: 'products', record: { id: p, name: p } },
        () => {},
      )
    }
    expect(pendingCount()).toBe(3)
    // volta online e drena
    nav.onLine = true
    await flush(supabase as never)
    expect(pendingCount()).toBe(0)
    expect(calls.map((c) => (c.arg as { id: string }).id)).toEqual(['a', 'b', 'c'])
  })

  it('para na falha de rede e preserva as operações', async () => {
    const { supabase, setBehavior } = makeFakeSupabase()
    nav.onLine = false
    await writeThrough(
      supabase as never,
      { id: 'op-net', kind: 'upsert', table: 'products', record: { id: 'z', name: 'z' } },
      () => {},
    )
    nav.onLine = true
    setBehavior('network')
    await flush(supabase as never)
    expect(pendingCount()).toBe(1) // continua na fila para tentar depois
  })

  it('descarta operação com erro não recuperável (poison) sem travar a fila', async () => {
    const { supabase, setBehavior } = makeFakeSupabase()
    nav.onLine = false
    await writeThrough(
      supabase as never,
      { id: 'op-poison', kind: 'upsert', table: 'products', record: { id: 'bad' } },
      () => {},
    )
    nav.onLine = true
    setBehavior('dberror')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await flush(supabase as never)
    expect(pendingCount()).toBe(0) // removida para não travar a fila
  })
})

describe('cachedRead', () => {
  it('retorna dados do servidor e atualiza o cache', async () => {
    const data = [{ id: '1', name: 'A' }]
    const out = await cachedRead('products', () => Promise.resolve({ data, error: null }), [])
    expect(out).toEqual(data)
    expect(cacheGet('products', [])).toEqual(data)
  })

  it('em falha de rede, serve o cache anterior', async () => {
    cacheSet('products', [{ id: '9', name: 'cacheado' }])
    const out = await cachedRead(
      'products',
      () => Promise.reject(new TypeError('Failed to fetch')),
      [],
    )
    expect(out).toEqual([{ id: '9', name: 'cacheado' }])
  })
})
