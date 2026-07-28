import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Rede de segurança: sem isto, qualquer erro de render (ex.: um bug em um
 * componente novo) derruba a árvore inteira do React e deixa a tela em
 * branco/travada, sem nenhuma mensagem — muito difícil de diagnosticar a
 * partir de um relato do usuário. Com o boundary, mostramos uma tela de
 * erro recuperável (com botão de recarregar) em vez de travar o app.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro não tratado capturado pelo ErrorBoundary:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-6 text-center dark:bg-black">
          <h1 className="text-lg font-semibold">Algo deu errado</h1>
          <p className="max-w-sm text-sm text-slate-500">
            Ocorreu um erro inesperado. Recarregue a página para continuar. Se o problema persistir,
            entre em contato com o suporte informando o que você estava fazendo.
          </p>
          <button className="btn-primary" onClick={() => location.reload()}>
            Recarregar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
