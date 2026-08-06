/** Parser CSV simples (suporta vírgula ou ponto-e-vírgula, campos entre aspas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    if (row.some((f) => f.trim() !== '')) rows.push(row)
    row = []
  }
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',' || c === ';') {
      pushField()
    } else if (c === '\n') {
      pushRow()
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) pushRow()
  return rows
}

export interface ImportedProductRow {
  name: string
  sku: string
  category: string
  price: number
  cost: number
  stock: number
  active: boolean
  raw: string[]
  error?: string
}

const num = (s: string | undefined) => {
  if (!s) return 0
  const n = Number(s.replace(',', '.').trim())
  return Number.isFinite(n) ? n : 0
}
const bool = (s: string | undefined) => {
  if (s === undefined) return true
  const v = s.trim().toLowerCase()
  return !['0', 'nao', 'não', 'false', 'inativo', 'n'].includes(v)
}

/**
 * Interpreta linhas de CSV de produtos. Espera colunas na ordem:
 * nome, sku, categoria, preco, custo, estoque, ativo (as 3 últimas opcionais).
 * A primeira linha é tratada como cabeçalho se não parecer numérica.
 */
export function parseProductsCsv(text: string): ImportedProductRow[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const looksLikeHeader = isNaN(Number((rows[0][3] ?? '').replace(',', '.')))
  const dataRows = looksLikeHeader ? rows.slice(1) : rows

  return dataRows.map((r) => {
    const name = (r[0] ?? '').trim()
    return {
      name,
      sku: (r[1] ?? '').trim(),
      category: (r[2] ?? '').trim(),
      price: num(r[3]),
      cost: num(r[4]),
      stock: Math.round(num(r[5])),
      active: bool(r[6]),
      raw: r,
      error: name ? undefined : 'Nome do produto vazio',
    }
  })
}

export function productsCsvTemplate(): string {
  return [
    'nome,sku,categoria,preco,custo,estoque,ativo',
    'Café Espresso,CAF-01,Bebidas,7.5,2.5,40,sim',
    'Cappuccino,CAF-02,Bebidas,12,5,25,sim',
  ].join('\n')
}
