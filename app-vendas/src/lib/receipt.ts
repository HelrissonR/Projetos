import type { Sale, Settings } from '../types'
import { money, dateTime } from './format'

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}

/**
 * Gera o HTML de um recibo (estilo cupom 58/80mm) e dispara a impressão
 * numa janela isolada — não interfere no estilo do app.
 */
export function printReceipt(sale: Sale, settings: Settings) {
  const fmt = (v: number) => money(v, settings.currency, settings.locale)
  const rows = (sale.items ?? [])
    .map(
      (i) => `
      <tr>
        <td>${i.quantity}x ${esc(i.product_name)}</td>
        <td class="r">${fmt(i.subtotal)}</td>
      </tr>`,
    )
    .join('')

  const subtotal = (sale.items ?? []).reduce((s, i) => s + i.subtotal, 0)

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo</title>
  <style>
    * { font-family: 'Courier New', monospace; }
    body { width: 280px; margin: 0 auto; padding: 12px; color: #000; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 2px; }
    .muted { text-align: center; font-size: 11px; color: #333; margin: 0 0 8px; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    table { width: 100%; font-size: 12px; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    .r { text-align: right; white-space: nowrap; }
    .total td { font-weight: bold; font-size: 14px; padding-top: 6px; }
    .foot { text-align: center; font-size: 11px; margin-top: 10px; }
    @media print { @page { margin: 0; } }
  </style></head><body>
    <h1>${esc(settings.company_name)}</h1>
    <p class="muted">${dateTime(sale.created_at, settings.locale)}</p>
    <hr>
    <table>
      <tr><td>Cliente</td><td class="r">${esc(sale.customer_name ?? 'Consumidor final')}</td></tr>
      <tr><td>Pagamento</td><td class="r">${esc(sale.payment_method)}</td></tr>
    </table>
    <hr>
    <table>${rows}</table>
    <hr>
    <table>
      <tr><td>Subtotal</td><td class="r">${fmt(subtotal)}</td></tr>
      ${sale.discount > 0 ? `<tr><td>Desconto</td><td class="r">- ${fmt(sale.discount)}</td></tr>` : ''}
      <tr class="total"><td>TOTAL</td><td class="r">${fmt(sale.total)}</td></tr>
    </table>
    <p class="foot">Obrigado pela preferência!</p>
    <script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 300); };<\/script>
  </body></html>`

  const w = window.open('', '_blank', 'width=340,height=600')
  if (!w) {
    alert('Permita pop-ups para imprimir o recibo.')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
