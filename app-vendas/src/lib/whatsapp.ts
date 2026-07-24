import type { CartLine, Settings } from '../types'
import { money } from './format'

export interface OrderContact {
  name?: string
  phone?: string
  address?: string
  note?: string
}

/** Monta a mensagem de pedido em texto para o WhatsApp. */
export function buildOrderMessage(
  lines: CartLine[],
  settings: Settings,
  contact: OrderContact,
): string {
  const fmt = (v: number) => money(v, settings.currency, settings.locale)
  const total = lines.reduce((s, l) => s + l.product.price * l.quantity, 0)
  const items = lines
    .map((l) => `• ${l.quantity}x ${l.product.name} — ${fmt(l.product.price * l.quantity)}`)
    .join('\n')

  const parts = [
    `*Novo pedido — ${settings.company_name}*`,
    '',
    items,
    '',
    `*Total: ${fmt(total)}*`,
  ]
  if (contact.name) parts.push('', `Cliente: ${contact.name}`)
  if (contact.phone) parts.push(`Telefone: ${contact.phone}`)
  if (contact.address) parts.push(`Endereço: ${contact.address}`)
  if (contact.note) parts.push(`Obs: ${contact.note}`)
  return parts.join('\n')
}

/** Gera o link wa.me com a mensagem. Se não houver número, abre o compositor sem destino. */
export function whatsappLink(message: string, phoneDigits: string): string {
  const digits = (phoneDigits || '').replace(/\D/g, '')
  const text = encodeURIComponent(message)
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`
}
