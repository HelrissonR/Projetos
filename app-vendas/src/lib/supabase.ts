import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[app-vendas] Supabase não configurado. Copie .env.example para .env e preencha as credenciais. Rodando em modo demonstração (localStorage).',
  )
}

export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null
