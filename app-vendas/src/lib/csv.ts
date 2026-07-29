import { saveOrShareBlob } from './fileSave'

/** Converte linhas (objetos) em CSV e salva/compartilha (funciona no APK). */
export async function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [
    headers.join(';'),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(';')),
  ].join('\n')
  // BOM para o Excel reconhecer acentuação UTF-8
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  await saveOrShareBlob(blob, filename, 'Salvar ou compartilhar CSV')
}
