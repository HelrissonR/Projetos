export function money(value: number, currency = 'BRL', locale = 'pt-BR') {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value || 0)
  } catch {
    return `R$ ${(value || 0).toFixed(2)}`
  }
}

export function dateTime(iso: string, locale = 'pt-BR') {
  try {
    return new Date(iso).toLocaleString(locale)
  } catch {
    return iso
  }
}

export function dateOnly(iso: string, locale = 'pt-BR') {
  try {
    return new Date(iso).toLocaleDateString(locale)
  } catch {
    return iso
  }
}
