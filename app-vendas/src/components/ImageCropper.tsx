import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'

interface Props {
  src: string // dataURL da imagem original (qualquer resolução)
  onCancel: () => void
  onConfirm: (dataUrl: string) => void
  /** Tamanho de saída em px (quadrado). Padrão 512. */
  output?: number
}

/**
 * Recorte quadrado com zoom e arraste. Aceita qualquer resolução de entrada;
 * o usuário ajusta o enquadramento e o resultado sai como PNG quadrado.
 */
export default function ImageCropper({ src, onCancel, onConfirm, output = 512 }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [box, setBox] = useState(320)
  const [fit, setFit] = useState<'cover' | 'contain'>('cover')
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  // Carrega a imagem e centraliza cobrindo o quadro
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.src = src
  }, [src])

  useEffect(() => {
    const b = boxRef.current?.clientWidth ?? 320
    setBox(b)
    setPos({ x: 0, y: 0 })
    setZoom(1)
  }, [natural, fit])

  // Escala base: "cover" (preenche o quadro) ou "contain" (imagem inteira cabe)
  const baseScale =
    natural.w && natural.h
      ? fit === 'cover'
        ? Math.max(box / natural.w, box / natural.h)
        : Math.min(box / natural.w, box / natural.h)
      : 1
  const scale = baseScale * zoom
  const dispW = natural.w * scale
  const dispH = natural.h * scale

  // Se a imagem cobre o eixo, permite arrastar; senão, centraliza fixo.
  const clamp = (x: number, y: number) => {
    const cx = dispW >= box ? Math.min(0, Math.max(box - dispW, x)) : (box - dispW) / 2
    const cy = dispH >= box ? Math.min(0, Math.max(box - dispH, y)) : (box - dispH) / 2
    return { x: cx, y: cy }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const nx = drag.current.ox + (e.clientX - drag.current.x)
    const ny = drag.current.oy + (e.clientY - drag.current.y)
    setPos(clamp(nx, ny))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  // Reaplica clamp quando o zoom muda
  useEffect(() => {
    setPos((p) => clamp(p.x, p.y))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, box, natural, fit])

  const confirm = () => {
    const img = imgRef.current
    if (!img) return
    const canvas = document.createElement('canvas')
    canvas.width = output
    canvas.height = output
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, output, output)
    // Converte coordenadas do quadro (box px) para a saída (output px)
    const k = output / box
    ctx.drawImage(img, pos.x * k, pos.y * k, dispW * k, dispH * k)
    onConfirm(canvas.toDataURL('image/jpeg', 0.9))
  }

  return (
    <Modal
      open
      title="Ajustar enquadramento"
      onClose={onCancel}
      footer={
        <>
          <button className="btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={confirm}>
            Usar imagem
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Arraste para posicionar e ajuste o zoom.</p>
          <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-300 text-xs dark:border-slate-700">
            <button
              type="button"
              className={`flex-1 px-3 py-1.5 sm:flex-none ${fit === 'cover' ? 'bg-brand text-white dark:text-black' : 'bg-transparent'}`}
              onClick={() => setFit('cover')}
            >
              Preencher
            </button>
            <button
              type="button"
              className={`flex-1 px-3 py-1.5 sm:flex-none ${fit === 'contain' ? 'bg-brand text-white dark:text-black' : 'bg-transparent'}`}
              onClick={() => setFit('contain')}
            >
              Ajustar
            </button>
          </div>
        </div>
        <div
          ref={boxRef}
          className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-lg border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {natural.w > 0 && (
            <img
              src={src}
              alt="preview"
              draggable={false}
              className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
              style={{ width: dispW, height: dispH, transform: `translate(${pos.x}px, ${pos.y}px)` }}
            />
          )}
          {/* Guias de enquadramento */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/30" />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>
      </div>
    </Modal>
  )
}
