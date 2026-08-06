/**
 * Placeholders de carregamento com brilho (shimmer). Dão a sensação de que o
 * conteúdo "está chegando", em vez de um texto "Carregando…" parado.
 */
export function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`skeleton h-4 ${className}`} />
}

/** Grade de cartões-esqueleto (ex.: lista de produtos carregando). */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card flex items-center gap-3 p-3">
          <div className="skeleton h-14 w-14 flex-shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Linha de KPIs-esqueleto (Dashboard). */
export function SkeletonKpis({ count = 5 }: { count?: number }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-2 p-4">
          <div className="skeleton h-3 w-2/3" />
          <div className="skeleton h-6 w-1/2" />
        </div>
      ))}
    </div>
  )
}
