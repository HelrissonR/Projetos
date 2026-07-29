import { supabase } from './supabase'
import { flush } from './offline'

/**
 * Dispara a sincronização do outbox nos momentos certos:
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

  window.addEventListener('online', doFlush)
  doFlush()

  // Retomada do app no Android (import dinâmico: em web o módulo é no-op).
  import('@capacitor/app')
    .then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) doFlush()
      }).catch(() => {})
      App.addListener('resume', doFlush).catch(() => {})
    })
    .catch(() => {})

  // Rede pode voltar sem evento confiável — tenta drenar periodicamente.
  setInterval(doFlush, 30000)
}
