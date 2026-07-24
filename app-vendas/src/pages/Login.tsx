import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const { settings } = useSettings()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'in') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
        setInfo('Conta criada! Verifique seu e-mail para confirmar, depois faça login.')
        setMode('in')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4 dark:bg-black">
      <div className="card w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand text-xl font-bold text-white dark:text-black">
            {settings.company_name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold">{settings.company_name}</h1>
          <p className="text-sm text-slate-500">
            {mode === 'in' ? 'Entre para continuar' : 'Crie sua conta'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">E-mail</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label">Senha</label>
            <input
              type="password"
              required
              minLength={6}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-emerald-600">{info}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Cadastrar'}
          </button>
        </form>

        <button
          className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in')
            setError(null)
            setInfo(null)
          }}
        >
          {mode === 'in' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  )
}
