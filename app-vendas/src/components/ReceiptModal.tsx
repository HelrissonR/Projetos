import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import {
  downloadReceiptImage,
  printReceiptCanvas,
  renderReceiptCanvas,
} from '../lib/receipt'
import { IconImage, IconPrinter } from './icons'
import type { Sale } from '../types'

/**
 * Exibe o comprovante da venda no formato BR 3x5 (10x15 cm) com opções de
 * imprimir ou salvar como imagem.
 */
export default function ReceiptModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { settings } = useSettings()
  const notify = useToast()
  const [preview, setPreview] = useState<string | null>(null)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSave = async () => {
    if (!canvas || !sale) return
    setBusy(true)
    try {
      await downloadReceiptImage(canvas, sale)
    } catch (e) {
      notify('Não foi possível salvar a imagem: ' + (e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const handlePrint = async () => {
    if (!canvas) return
    setBusy(true)
    try {
      await printReceiptCanvas(canvas, settings)
    } catch (e) {
      notify('Não foi possível imprimir: ' + (e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!sale) {
      setPreview(null)
      setCanvas(null)
      return
    }
    const c = renderReceiptCanvas(sale, settings)
    setCanvas(c)
    setPreview(c.toDataURL('image/png'))
  }, [sale, settings])

  return (
    <Modal
      open={!!sale}
      title="Comprovante (BR 3×5)"
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Fechar
          </button>
          <button
            className="btn-ghost border border-slate-300 dark:border-slate-700"
            onClick={handleSave}
            disabled={busy || !canvas}
          >
            <IconImage /> Salvar imagem
          </button>
          <button className="btn-primary" onClick={handlePrint} disabled={busy || !canvas}>
            <IconPrinter /> Imprimir
          </button>
        </>
      }
    >
      <div className="flex justify-center">
        {preview && (
          <img
            src={preview}
            alt="Prévia do comprovante"
            className="max-h-[60vh] rounded-md border border-slate-200 shadow-sm dark:border-slate-800"
            style={{ aspectRatio: '2 / 3' }}
          />
        )}
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">
        Formato 10×15 cm. Ao imprimir, selecione papel/foto 10×15 (3×5).
      </p>
    </Modal>
  )
}
