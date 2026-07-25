import type { ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export default function Modal({ open, title, onClose, children, footer, wide }: Props) {
  if (!open) return null
  return (
    <div
      className="anim-fade fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={`card anim-sheet w-full rounded-b-none sm:anim-pop sm:rounded-b-lg ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        } max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="btn-ghost px-2 py-1" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div>{children}</div>
        {footer && (
          <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>
  )
}
