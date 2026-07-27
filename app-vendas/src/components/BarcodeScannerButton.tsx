import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { useToast } from '../context/ToastContext'

interface Props {
  onDetect: (code: string) => void
  /** Rótulo do botão. Padrão: ícone de câmera. */
  label?: string
}

/**
 * Botão que abre a câmera e lê QR Code / código de barras (EAN, UPC, Code128
 * etc.) usando ZXing — decodificação local, funciona offline. Pede a câmera
 * traseira com foco contínuo (quando suportado) para focar corretamente em
 * códigos de perto. Se a câmera não estiver disponível, oferece entrada
 * manual do código.
 */
export default function BarcodeScannerButton({ onDetect, label }: Props) {
  const [open, setOpen] = useState(false)
  const [manual, setManual] = useState('')
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const notify = useToast()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)

    import('@zxing/browser')
      .then(async ({ BrowserMultiFormatReader }) => {
        if (cancelled) return
        const reader = new BrowserMultiFormatReader()
        try {
          const controls = await reader.decodeFromConstraints(
            {
              audio: false,
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            videoRef.current!,
            (result) => {
              if (result && !cancelled) {
                const text = result.getText()
                notify(`Código lido: ${text}`)
                onDetect(text)
                controls.stop()
                setOpen(false)
              }
            },
          )
          controlsRef.current = controls

          // Força foco contínuo/automático na track, quando o navegador suporta
          // (essencial para ler códigos de perto — sem isso a câmera trava no
          // foco inicial e a imagem fica desfocada).
          const stream = videoRef.current?.srcObject as MediaStream | undefined
          const track = stream?.getVideoTracks()[0]
          const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined
          if (track && caps?.focusMode?.includes('continuous')) {
            track
              .applyConstraints({ advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet] })
              .catch(() => {})
          }
        } catch (e) {
          if (!cancelled) setError('Não foi possível acessar a câmera. Digite o código manualmente.')
        }
      })
      .catch(() => {
        if (!cancelled) setError('Leitor indisponível neste dispositivo. Digite o código manualmente.')
      })

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submitManual = () => {
    if (!manual.trim()) return
    onDetect(manual.trim())
    setManual('')
    setOpen(false)
  }

  // Toca de novo no vídeo para forçar o navegador a reavaliar o foco
  // (alguns Androids só refocam após um toque na área de preview).
  const tapToFocus = () => {
    const stream = videoRef.current?.srcObject as MediaStream | undefined
    const track = stream?.getVideoTracks()[0]
    track
      ?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet] })
      .catch(() => {})
  }

  return (
    <>
      <button
        type="button"
        className="btn-ghost border border-slate-300 px-3 dark:border-slate-700"
        onClick={() => setOpen(true)}
        aria-label="Ler código de barras / QR"
        title="Ler código de barras / QR"
      >
        📷
      </button>

      <Modal open={open} title={label ?? 'Ler código'} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          {!error ? (
            <div className="overflow-hidden rounded-lg bg-black" onClick={tapToFocus}>
              <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline autoPlay />
            </div>
          ) : (
            <p className="text-sm text-amber-600">{error}</p>
          )}
          <p className="text-center text-xs text-slate-500">
            Aponte a câmera para o código, a ~10–15 cm de distância. Toque na imagem se não focar.
          </p>
          <div className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <input
              className="input"
              placeholder="Ou digite o código"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitManual()}
            />
            <button className="btn-primary" onClick={submitManual}>
              OK
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
