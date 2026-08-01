import { supabase } from './supabase'
import {
  settingsRepo,
  categoriesRepo,
  productsRepo,
  customersRepo,
  salesRepo,
  ordersRepo,
} from './db'

/**
 * "Aquece" TODOS os caches offline enquanto online, para que o app funcione sem
 * internet mesmo em páginas que o usuário ainda não abriu. Reusa os próprios
 * `list()`/`get()` dos repos — cada um já grava o cache local como efeito
 * colateral (ver cachedRead em offline.ts), então não há query duplicada.
 */
let running = false

export async function prefetchAll(): Promise<void> {
  if (running) return
  if (!supabase) return // modo demonstração (sem Supabase): nada a pré-carregar
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  // Não pré-carregar deslogado: leituras de tabelas com RLS voltariam vazias e
  // sobrescreveriam um cache bom com [].
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
  } catch {
    return
  }

  running = true
  try {
    // allSettled: uma tabela que falhe não aborta as demais; cada leitura já é
    // à prova de erro de rede (cachedRead devolve o cache/fallback).
    await Promise.allSettled([
      settingsRepo.get(),
      categoriesRepo.list(),
      productsRepo.list(),
      customersRepo.list(),
      salesRepo.list(),
      ordersRepo.list(),
    ])
  } finally {
    running = false
  }
}
