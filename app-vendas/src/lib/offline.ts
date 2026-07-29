import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Camada offline-first para o app conectado ao Supabase.
 *
 * Objetivo: o app funciona conectado (mesmos dados do site), mas continua
 * utilizável sem internet e sincroniza sozinho ao voltar online.
 *
 * Estratégia:
 *  • LEITURA  → tenta o Supabase; em sucesso atualiza um cache local
 *               (localStorage); em falha de rede serve o cache.
 *  • ESCRITA  → aplica a mudança no cache imediatamente (a UI reflete on/off)
 *               e tenta o Supabase; em falha de rede enfileira a operação num
 *               "outbox" para reenvio posterior.
 *  • SYNC     → ao voltar a ficar online (evento `online`, retomada do app ou
 *               início), o outbox é drenado em ordem (FIFO).
 *
 * Decisões de robustez (antecipando falhas):
 *  • IDs gerados no cliente (UUID) para toda criação → o upsert de reenvio é
 *    idempotente (reenviar a mesma operação não duplica registros).
 *  • Drenagem serial e remoção do outbox só após sucesso confirmado.
 *  • Erros de rede pausam a drenagem (tenta de novo depois); erros NÃO
 *    recuperáveis (ex.: violação de RLS/constraint) são descartados com log,
 *    para não travar a fila num item "envenenado".
 *  • Ajuste de estoque é enviado como DELTA (soma), preservando concorrência
 *    entre dispositivos. Observação: delta não é idempotente — no caso raro de
 *    perda do ACK exatamente após o commit, poderia reaplicar; a drenagem
 *    serial + remoção-após-sucesso minimiza a janela.
 */

const CACHE_PREFIX = 'appvendas:cache:'
const OUTBOX_KEY = 'appvendas:outbox'

export type OutboxOp =
  | { id: string; kind: 'upsert'; table: string; record: Record<string, unknown> }
  | { id: string; kind: 'upsertMany'; table: string; rows: Record<string, unknown>[] }
  | { id: string; kind: 'delete'; table: string; rowId: string }
  | { id: string; kind: 'update'; table: string; rowId: string; patch: Record<string, unknown> }
  | { id: string; kind: 'rpc'; fn: string; args: Record<string, unknown> }

// -------- Cache local (por entidade) --------
export function cacheGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
export function cacheSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch {
    // localStorage cheio (ex.: muitas imagens em base64) — ignora o cache
    // em vez de quebrar a operação principal.
  }
}

// -------- Outbox (fila de escrita pendente) --------
function loadOutbox(): OutboxOp[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    return raw ? (JSON.parse(raw) as OutboxOp[]) : []
  } catch {
    return []
  }
}
function saveOutbox(ops: OutboxOp[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops))
  } catch {
    // se não couber, mantém o que já estava — melhor perder o novo item do
    // que corromper toda a fila.
  }
}
function enqueue(op: OutboxOp): void {
  saveOutbox([...loadOutbox(), op])
  notify()
}
export function pendingCount(): number {
  return loadOutbox().length
}

// -------- Notificação de estado (para o indicador de sync na UI) --------
type Listener = () => void
const listeners = new Set<Listener>()
export function onSyncChange(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function notify(): void {
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* um listener com erro não deve derrubar os demais */
    }
  }
}

// -------- Detecção de erro de rede vs. erro real --------
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const err = e as { message?: string; name?: string; code?: string } | null
  // PostgrestError (erro real do banco) tem `code`; não tratamos como rede.
  if (err?.code) return false
  const msg = (err?.message ?? '').toLowerCase()
  return (
    err?.name === 'TypeError' ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('failed to')
  )
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

// -------- Leitura online-first com fallback de cache --------
/** Tempo máximo que uma leitura espera a rede antes de cair no cache — evita a
 *  tela "Carregando…" travar quando o servidor está inacessível/lento. */
const READ_TIMEOUT_MS = 8000

export async function cachedRead<T>(
  cacheKey: string,
  // Aceita o "thenable" do supabase-js (PostgrestBuilder), não só Promise.
  run: () => PromiseLike<{ data: T | null; error: unknown }>,
  fallback: T,
): Promise<T> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('read timeout')), READ_TIMEOUT_MS),
    )
    const { data, error } = await Promise.race([Promise.resolve(run()), timeout])
    if (error) {
      // Erro do servidor estando online: mantém o app usável servindo o cache
      // e registra para diagnóstico.
      console.error(`Erro de leitura (${cacheKey}), usando cache:`, error)
      return cacheGet(cacheKey, fallback)
    }
    const value = (data ?? fallback) as T
    cacheSet(cacheKey, value)
    return value
  } catch (e) {
    if (isNetworkError(e)) return cacheGet(cacheKey, fallback)
    console.error(`Falha de leitura (${cacheKey}):`, e)
    return cacheGet(cacheKey, fallback)
  }
}

// -------- Escrita "write-through" com outbox --------
/**
 * Aplica `optimistic` no cache (para a UI refletir imediatamente) e tenta
 * enviar ao Supabase. Em falha de rede, enfileira para sync posterior. Em erro
 * real do banco, propaga (a página mostra o erro); o cache diverge apenas até a
 * próxima leitura online, que o corrige.
 */
export async function writeThrough(
  supabase: SupabaseClient,
  op: OutboxOp,
  optimistic: () => void,
): Promise<void> {
  optimistic()
  if (!online()) {
    enqueue(op)
    return
  }
  try {
    await applyOp(supabase, op)
    // Aproveita a conexão para drenar qualquer pendência acumulada.
    void flush(supabase)
  } catch (e) {
    if (isNetworkError(e)) {
      enqueue(op)
      return
    }
    throw e
  }
}

async function applyOp(supabase: SupabaseClient, op: OutboxOp): Promise<void> {
  if (op.kind === 'upsert') {
    const { error } = await supabase.from(op.table).upsert(op.record)
    if (error) throw error
  } else if (op.kind === 'upsertMany') {
    if (op.rows.length === 0) return
    const { error } = await supabase.from(op.table).upsert(op.rows)
    if (error) throw error
  } else if (op.kind === 'delete') {
    const { error } = await supabase.from(op.table).delete().eq('id', op.rowId)
    if (error) throw error
  } else if (op.kind === 'update') {
    const { error } = await supabase.from(op.table).update(op.patch).eq('id', op.rowId)
    if (error) throw error
  } else if (op.kind === 'rpc') {
    const { error } = await supabase.rpc(op.fn, op.args)
    if (error) throw error
  }
}

// -------- Drenagem do outbox --------
let syncing = false
export async function flush(supabase: SupabaseClient): Promise<void> {
  if (syncing || !online()) return
  syncing = true
  notify()
  try {
    // Processa serialmente, re-lendo a fila a cada passo (para preservar
    // operações enfileiradas concorrentemente durante a drenagem).
    // Limite de segurança para evitar laço infinito caso algo inesperado ocorra.
    for (let guard = 0; guard < 10000; guard++) {
      if (!online()) break
      const ops = loadOutbox()
      if (ops.length === 0) break
      const op = ops[0]
      try {
        await applyOp(supabase, op)
      } catch (e) {
        if (isNetworkError(e)) break // volta a tentar mais tarde
        // Erro não recuperável: descarta este item para não travar a fila.
        console.error('Operação de sync descartada (erro não recuperável):', op, e)
      }
      // Remove o item processado por id (re-lendo para não sobrescrever novos).
      saveOutbox(loadOutbox().filter((o) => o.id !== op.id))
      notify()
    }
  } finally {
    syncing = false
    notify()
  }
}

export function isSyncing(): boolean {
  return syncing
}
