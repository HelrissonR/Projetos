import { describe, expect, it } from 'vitest'
import { money } from './format'

describe('money', () => {
  it('formata em BRL por padrão', () => {
    // NBSP entre símbolo e número no locale pt-BR
    expect(money(1234.5, 'BRL', 'pt-BR').replace(/ /g, ' ')).toBe('R$ 1.234,50')
  })
  it('trata valores nulos/undefined como 0', () => {
    expect(money(undefined as unknown as number)).toContain('0,00')
  })
  it('formata em USD', () => {
    expect(money(10, 'USD', 'en-US')).toBe('$10.00')
  })
})
