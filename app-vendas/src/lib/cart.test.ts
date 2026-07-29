import { describe, expect, it } from 'vitest'
import { cartSubtotal, cartTotal, canAddQuantity } from './cart'
import type { CartLine, Product } from '../types'

const prod = (price: number, stock = 100): Product => ({
  id: 'p', name: 'x', sku: null, category_id: null, price, cost: 0, stock, active: true, image: null, description: null, custom: {},
})
const line = (price: number, quantity: number): CartLine => ({ product: prod(price), quantity })

describe('cartSubtotal', () => {
  it('soma preço × quantidade de todas as linhas', () => {
    expect(cartSubtotal([line(10, 2), line(5, 3)])).toBe(35)
  })
  it('retorna 0 para carrinho vazio', () => {
    expect(cartSubtotal([])).toBe(0)
  })
})

describe('cartTotal', () => {
  it('aplica o desconto sobre o subtotal', () => {
    expect(cartTotal([line(10, 2)], 5)).toBe(15)
  })
  it('nunca fica negativo', () => {
    expect(cartTotal([line(10, 1)], 999)).toBe(0)
  })
  it('ignora desconto negativo', () => {
    expect(cartTotal([line(10, 1)], -50)).toBe(10)
  })
})

describe('canAddQuantity', () => {
  it('permite quando cabe no estoque', () => {
    expect(canAddQuantity(2, 1, 5)).toBe(true)
  })
  it('permite exatamente até o limite', () => {
    expect(canAddQuantity(4, 1, 5)).toBe(true)
  })
  it('bloqueia quando excede o estoque', () => {
    expect(canAddQuantity(5, 1, 5)).toBe(false)
  })
})
