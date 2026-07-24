import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Settings } from '../types'
import { settingsRepo } from '../lib/db'
import { money as fmtMoney } from '../lib/format'

export const DEFAULT_SETTINGS: Settings = {
  company_name: 'Minha Loja',
  logo_url: null,
  currency: 'BRL',
  locale: 'pt-BR',
  brand_color: '79 70 229',
  theme: 'light',
  payment_methods: [
    { id: 'cash', label: 'Dinheiro', enabled: true },
    { id: 'pix', label: 'Pix', enabled: true },
    { id: 'credit', label: 'Cartão de Crédito', enabled: true },
    { id: 'debit', label: 'Cartão de Débito', enabled: true },
  ],
  product_custom_fields: [],
  low_stock_threshold: 5,
}

interface Ctx {
  settings: Settings
  loading: boolean
  save: (s: Settings) => Promise<void>
  money: (v: number) => string
}

const SettingsContext = createContext<Ctx | null>(null)

function applyTheme(s: Settings) {
  const root = document.documentElement
  root.style.setProperty('--brand', s.brand_color)
  root.classList.toggle('dark', s.theme === 'dark')
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    settingsRepo
      .get()
      .then((s) => {
        const merged = s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS
        setSettings(merged)
        applyTheme(merged)
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async (s: Settings) => {
    const saved = await settingsRepo.save(s)
    const merged = { ...DEFAULT_SETTINGS, ...saved }
    setSettings(merged)
    applyTheme(merged)
  }

  const value = useMemo<Ctx>(
    () => ({
      settings,
      loading,
      save,
      money: (v: number) => fmtMoney(v, settings.currency, settings.locale),
    }),
    [settings, loading],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings deve ser usado dentro de SettingsProvider')
  return ctx
}
