import { useEffect, useReducer, useRef, useState } from 'react'
import {
  onSyncChange,
  pendingCount,
  isSyncing,
  failedCount,
  getFailed,
  retryFailed,
  clearFailed,
  describeOp,
} from '../lib/offline'
import { supabase } from '../lib/supabase'

/**
 * Faixa de estado da sincronização. Informa, sem poluir a interface:
 *  • offline → alterações serão enviadas ao voltar;
 *  • pendências → quantas alterações aguardam envio / "Sincronizando…";
 *  • falhas → operações que o servidor recusou (ex.: estoque insuficiente),
 *    com o motivo e um botão para tentar de novo — nada some em silêncio;
 *  • acabou de sincronizar → confirmação breve "Tudo sincronizado".
 */
export default function SyncIndicator() {
  const [, rerender] = useReducer((x) => x + 1, 0)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [justSynced, setJustSynced] = useState(false)
  const [showFailed, setShowFailed] = useState(false)
  const prevPending = useRef(pendingCount())

  useEffect(() => {
    const off = onSyncChange(() => {
      // Transição de "tinha pendências" → "zerou" e sem falhas: confirma sucesso.
      const now = pendingCount()
      if (prevPending.current > 0 && now === 0 && failedCount() === 0) {
        setJustSynced(true)
        setTimeout(() => setJustSynced(false), 3000)
      }
      prevPending.current = now
      rerender()
    })
    const goOnline = () => {
      setOnline(true)
      rerender()
    }
    const goOffline = () => {
      setOnline(false)
      rerender()
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      off()
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const pending = pendingCount()
  const failed = failedCount()

  // Prioridade: falhas > offline > sincronizando/pendências > confirmação.
  if (failed > 0) {
    const items = getFailed()
    return (
      <div className="rounded-md bg-red-100 px-3 py-2 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
          <span className="flex-1 font-medium">{failed} alteração(ões) não sincronizada(s)</span>
          <button className="underline" onClick={() => setShowFailed((s) => !s)}>
            {showFailed ? 'ocultar' : 'detalhes'}
          </button>
          {online && (
            <button
              className="rounded bg-red-600 px-2 py-0.5 font-semibold text-white hover:bg-red-700"
              onClick={() => supabase && retryFailed(supabase)}
            >
              Tentar novamente
            </button>
          )}
          <button className="underline" onClick={clearFailed}>
            descartar
          </button>
        </div>
        {showFailed && (
          <ul className="mt-2 space-y-1 border-t border-red-200 pt-2 dark:border-red-800">
            {items.map((f, i) => (
              <li key={i} className="flex flex-col">
                <span className="font-medium">{describeOp(f.op)}</span>
                <span className="text-red-600 dark:text-red-300">{f.error}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  if (online && pending === 0) {
    if (!justSynced) return null
    return (
      <div
        className="flex items-center gap-2 rounded-md bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
        role="status"
      >
        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
        <span className="truncate">Tudo sincronizado</span>
      </div>
    )
  }

  const label = !online
    ? 'Sem conexão — suas alterações serão sincronizadas ao voltar'
    : isSyncing()
      ? 'Sincronizando…'
      : `${pending} alteração(ões) aguardando sincronização`

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ${
        !online
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
          : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
      }`}
      role="status"
    >
      <span
        className={`h-2 w-2 flex-shrink-0 rounded-full ${
          !online ? 'bg-amber-500' : 'animate-pulse bg-sky-500'
        }`}
      />
      <span className="truncate">{label}</span>
    </div>
  )
}
