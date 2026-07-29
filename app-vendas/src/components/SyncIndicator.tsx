import { useEffect, useReducer, useState } from 'react'
import { onSyncChange, pendingCount, isSyncing } from '../lib/offline'

/**
 * Faixa discreta que informa o estado de sincronização, para o usuário não se
 * assustar sem internet: mostra "offline" ou o número de alterações pendentes.
 * Quando tudo está sincronizado e online, não aparece (não polui a interface).
 */
export default function SyncIndicator() {
  const [, rerender] = useReducer((x) => x + 1, 0)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)

  useEffect(() => {
    const off = onSyncChange(rerender)
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
  if (online && pending === 0) return null

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
