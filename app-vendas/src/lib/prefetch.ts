import { supabase } from './supabase'
import { pendingCount } from './offline'
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
 *
 * Também pré-carrega as IMAGENS dos produtos/logo: sem isso, o service worker só
 * cacheava a imagem depois de ela ser vista uma vez, então produtos ainda não
 * abertos ficavam "sem imagem" offline. Aqui buscamos todas as URLs uma vez
 * (o SW guarda no cache de imagens), de forma silenciosa.
 */
let running = false

/** Dispara o fetch de cada imagem para o SW cachear (silencioso, sem travar). */
function warmImages(urls: string[]): void {
  const unique = Array.from(new Set(urls.filter((u) => /^https?:\/\//i.test(u))))
  for (const url of unique) {
    // no-cors evita erro de CORS no console; o SW ainda cacheia (resposta opaca).
    fetch(url, { mode: 'no-cors' }).catch(() => {})
  }
}

export async function prefetchAll(): Promise<void> {
  if (running) return
  if (!supabase) return // modo demonstração (sem Supabase): nada a pré-carregar
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  // Se há escritas pendentes na fila offline, NÃO pré-carregar ainda: uma leitura
  // do servidor poderia sobrescrever o cache otimista antes do envio sincronizar.
  // O flush roda em paralelo; o próximo gatilho (após esvaziar a fila) aquece.
  if (pendingCount() > 0) return

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
    const results = await Promise.allSettled([
      settingsRepo.get(),
      categoriesRepo.list(),
      productsRepo.list(),
      customersRepo.list(),
      salesRepo.list(),
      ordersRepo.list(),
    ])

    // Aquece as imagens (produtos + logo) para o cache do service worker.
    const settings = results[0].status === 'fulfilled' ? results[0].value : null
    const products = results[2].status === 'fulfilled' ? results[2].value : []
    const urls: string[] = []
    for (const p of products) if (p.image) urls.push(p.image)
    if (settings?.logo_url) urls.push(settings.logo_url)
    warmImages(urls)
  } finally {
    running = false
  }
}
