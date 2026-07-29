import type { Sale, Settings } from '../types'
import { money, dateTime } from './format'
import { saveOrShareBlob, canvasToPngBlob } from './fileSave'

// BR 3x5 = 10x15 cm (proporção 2:3). 1200x1800 px ≈ 300 dpi.
export const RECEIPT_W = 1200
export const RECEIPT_H = 1800

/**
 * Desenha o comprovante da venda num canvas no formato BR 3x5 (10x15 cm),
 * preto sobre branco. Usado tanto para impressão quanto para salvar imagem.
 */
export function renderReceiptCanvas(sale: Sale, settings: Settings): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = RECEIPT_W
  c.height = RECEIPT_H
  const ctx = c.getContext('2d')!
  const fmt = (v: number) => money(v, settings.currency, settings.locale)

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, RECEIPT_W, RECEIPT_H)
  ctx.fillStyle = '#000'

  const M = 80 // margem
  let y = 120

  const center = (text: string, size: number, bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px 'Courier New', monospace`
    ctx.textAlign = 'center'
    ctx.fillText(text, RECEIPT_W / 2, y)
  }
  const row = (left: string, right: string, size = 34, bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px 'Courier New', monospace`
    ctx.textAlign = 'left'
    ctx.fillText(left, M, y)
    ctx.textAlign = 'right'
    ctx.fillText(right, RECEIPT_W - M, y)
  }
  const dashed = () => {
    ctx.textAlign = 'left'
    ctx.font = `34px 'Courier New', monospace`
    ctx.fillText('-'.repeat(34), M, y)
  }

  center(settings.company_name, 56, true)
  y += 60
  center('COMPROVANTE DE VENDA', 30)
  y += 40
  center(dateTime(sale.created_at, settings.locale), 28)
  y += 50
  dashed()
  y += 55

  row('Cliente:', '', 32, true)
  ctx.textAlign = 'right'
  ctx.fillText(sale.customer_name ?? 'Consumidor final', RECEIPT_W - M, y)
  y += 45
  row('Pagamento:', sale.payment_method, 32)
  y += 55
  dashed()
  y += 55

  for (const it of sale.items ?? []) {
    const name = it.product_name.length > 22 ? it.product_name.slice(0, 21) + '…' : it.product_name
    row(`${it.quantity}x ${name}`, fmt(it.subtotal), 32)
    y += 48
    if (y > RECEIPT_H - 320) break
  }

  y += 10
  dashed()
  y += 60

  const subtotal = (sale.items ?? []).reduce((s, i) => s + i.subtotal, 0)
  row('Subtotal', fmt(subtotal), 34)
  y += 50
  if (sale.discount > 0) {
    row('Desconto', `- ${fmt(sale.discount)}`, 34)
    y += 50
  }
  row('TOTAL', fmt(sale.total), 48, true)
  y += 90

  center('Obrigado pela preferência!', 30)

  return c
}

async function isNativePlatform(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function receiptFileName(sale: Sale): string {
  return `comprovante-${sale.created_at.slice(0, 10)}-${sale.id.slice(0, 6)}.png`
}

/** Impressão/compartilhamento do comprovante (10x15 cm). */
export async function printReceiptCanvas(canvas: HTMLCanvasElement, settings: Settings): Promise<void> {
  if (await isNativePlatform()) {
    // No Android, a impressão é feita pela folha de compartilhamento do sistema
    // (a opção "Imprimir" aparece lá). window.print() não funciona na WebView.
    const blob = await canvasToPngBlob(canvas)
    await saveOrShareBlob(blob, `comprovante-${Date.now()}.png`, 'Imprimir ou salvar comprovante')
    return
  }
  const url = canvas.toDataURL('image/png')
  const w = window.open('', '_blank', 'width=420,height=600')
  if (!w) {
    alert('Permita pop-ups para imprimir o comprovante.')
    return
  }
  w.document.open()
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comprovante</title>
    <style>
      @page { size: 10cm 15cm; margin: 0; }
      html,body{margin:0;padding:0}
      img{width:10cm;height:15cm;display:block}
    </style></head><body>
    <img src="${url}" alt="comprovante ${settings.company_name}">
    <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)};<\/script>
    </body></html>`)
  w.document.close()
}

/** Salva o comprovante como imagem PNG (10x15). */
export async function downloadReceiptImage(canvas: HTMLCanvasElement, sale: Sale): Promise<void> {
  const blob = await canvasToPngBlob(canvas)
  await saveOrShareBlob(blob, receiptFileName(sale), 'Salvar ou compartilhar comprovante')
}
