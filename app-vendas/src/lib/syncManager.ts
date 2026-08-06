import { supabase } from './supabase'
import { flush } from './offline'
import { prefetchAll } from './prefetch'

/**
 * Dispara a sincronização do outbox e o "aquecimento" dos caches offline nos
 * momentos certos:
 *  • ao iniciar o app;
 *  • quando a rede volta (`online`);
 *  • quando o app é retomado (Capacitor, no Android);
 *  • checagem periódica leve (a WebView nem sempre emite o evento `online`).
 * Deve ser chamado uma única vez (main.tsx).
 */
export function initSync(): void {
  if (!supabase) return
  const doFlush = () => {
    if (navigator.onLine) void flush(supabase!)
  }
  // Envia o outbox E baixa todos os dados para o cache (para funcionar offline
  // mesmo em páginas ainda não abertas). O prefetch se auto-protege (online +
  // logado + sem sobreposição).
  const doSync = () => {
    doFlush()
    if (navigator.onLine) void prefetchAll()
  }

  window.addEventListener('online', doSync)
  doSync()

  // Retomada do app no Android (import dinâmico: em web o módulo é no-op).
  import('@capacitor/app')
    .then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) doSync()
      }).catch(() => {})
      App.addListener('resume', doSync).catch(() => {})
    })
    .catch(() => {})

  // Rede pode voltar sem evento confiável — só drena o outbox aqui (barato); o
  // prefetch fica nos gatilhos de transição (online/resume/startup).
  setInterval(doFlush, 30000)
}
