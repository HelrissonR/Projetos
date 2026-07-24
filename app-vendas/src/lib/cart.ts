import type { CartLine } from '../types'

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0)
}

export function cartTotal(lines: CartLine[], discount = 0): number {
  return Math.max(0, cartSubtotal(lines) - Math.max(0, discount))
}

/** Verifica se é possível adicionar `qty` unidades sem exceder o estoque. */
export function canAddQuantity(currentInCart: number, qty: number, stock: number): boolean {
  return currentInCart + qty <= stock
}
