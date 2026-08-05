import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { prefetchAll } from '../lib/prefetch'
import { clearLocalData, pendingCount } from '../lib/offline'

interface Ctx {
  user: User | null
  loading: boolean
  authEnabled: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }
    // Rede de segurança: se getSession travar (rede lenta/instável), o app não
    // pode ficar preso na tela "Carregando…". Libera após um tempo máximo.
    const safety = setTimeout(() => setLoading(false), 8000)
    supabase.auth
      .getSession()
      .then(({ data }: { data: { session: Session | null } }) => {
        setUser(data.session?.user ?? null)
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(safety)
        setLoading(false)
      })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      // Ao logar, já baixa todos os dados para o cache offline (não espera um
      // evento de reconexão). prefetchAll se auto-protege.
      if (session) void prefetchAll()
    })
    return () => {
      clearTimeout(safety)
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    if (!supabase) throw new Error('Autenticação indisponível em modo demonstração')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUp = async (email: string, password: string) => {
    if (!supabase) throw new Error('Autenticação indisponível em modo demonstração')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    // Se houver escritas pendentes, avisa para não perder dados sem sincronizar.
    if (pendingCount() > 0) {
      const ok = confirm(
        'Há alterações ainda não sincronizadas que serão perdidas ao sair. Deseja sair mesmo assim?',
      )
      if (!ok) return
    }
    if (supabase) await supabase.auth.signOut()
    // Limpa cache/outbox/falhas para que os dados do negócio não fiquem no
    // dispositivo após o logout (proteção de dados em aparelho compartilhado).
    clearLocalData()
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, authEnabled: isSupabaseConfigured, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
