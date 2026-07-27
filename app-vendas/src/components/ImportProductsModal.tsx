import { useRef, useState } from 'react'
import Modal from './Modal'
import { parseProductsCsv, productsCsvTemplate, type ImportedProductRow } from '../lib/csvImport'
import { categoriesRepo, productsRepo } from '../lib/db'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { IconDownload } from './icons'
import type { Category } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
  categories: Category[]
}

export default function ImportProductsModal({ open, onClose, onImported, categories }: Props) {
  const { money } = useSettings()
  const notify = useToast()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ImportedProductRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setText('')
    setRows(null)
  }
  const handleClose = () => {
    reset()
    onClose()
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result ?? '')
      setText(content)
      setRows(parseProductsCsv(content))
    }
    reader.readAsText(file, 'utf-8')
  }

  const preview = () => setRows(parseProductsCsv(text))

  const downloadTemplate = () => {
    const blob = new Blob(['﻿' + productsCsvTemplate()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-produtos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const validRows = (rows ?? []).filter((r) => !r.error)
  const errorCount = (rows ?? []).length - validRows.length

  const doImport = async () => {
    if (validRows.length === 0) return
    setImporting(true)
    try {
      const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
      for (const r of validRows) {
        let categoryId: string | null = null
        if (r.category) {
          const found = catByName.get(r.category.toLowerCase())
          if (found) {
            categoryId = found
          } else {
            const created = await categoriesRepo.create(r.category)
            catByName.set(r.category.toLowerCase(), created.id)
            categoryId = created.id
          }
        }
        await productsRepo.save({
          id: '',
          name: r.name,
          sku: r.sku || null,
          category_id: categoryId,
          price: r.price,
          cost: r.cost,
          stock: r.stock,
          active: r.active,
          image: null,
          custom: {},
        })
      }
      notify(`${validRows.length} produto(s) importado(s)!`)
      onImported()
      handleClose()
    } catch (e) {
      notify('Erro ao importar: ' + (e as Error).message, 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Importar produtos (CSV)"
      onClose={handleClose}
      wide
      footer={
        rows ? (
          <>
            <button className="btn-ghost" onClick={reset}>
              Voltar
            </button>
            <button className="btn-primary" onClick={doImport} disabled={importing || validRows.length === 0}>
              {importing ? 'Importando…' : `Importar ${validRows.length} produto(s)`}
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={handleClose}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={preview} disabled={!text.trim()}>
              Pré-visualizar
            </button>
          </>
        )
      }
    >
      {!rows ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Colunas: <code>nome, sku, categoria, preco, custo, estoque, ativo</code>. Categorias novas são
            criadas automaticamente.
          </p>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onPickFile} />
            <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={() => fileRef.current?.click()}>
              Selecionar arquivo .csv
            </button>
            <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={downloadTemplate}>
              <IconDownload /> Baixar modelo
            </button>
          </div>
          <div>
            <label className="label">Ou cole o conteúdo CSV</label>
            <textarea
              className="input font-mono text-xs"
              rows={10}
              placeholder={productsCsvTemplate()}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {validRows.length} válido(s)
            </span>
            {errorCount > 0 && (
              <span className="badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {errorCount} com erro
              </span>
            )}
          </div>
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 border-b border-slate-200 bg-white text-left text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="p-2">Nome</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2">Categoria</th>
                  <th className="p-2 text-right">Preço</th>
                  <th className="p-2 text-right">Custo</th>
                  <th className="p-2 text-right">Estoque</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${r.error ? 'bg-red-50 dark:bg-red-900/20' : ''}`}
                  >
                    <td className="p-2">{r.name || <span className="text-red-500">—</span>}</td>
                    <td className="p-2 text-slate-500">{r.sku}</td>
                    <td className="p-2 text-slate-500">{r.category}</td>
                    <td className="p-2 text-right">{money(r.price)}</td>
                    <td className="p-2 text-right">{money(r.cost)}</td>
                    <td className="p-2 text-right">{r.stock}</td>
                    <td className="p-2 text-red-500">{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
