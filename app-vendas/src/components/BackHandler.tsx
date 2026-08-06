import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Trata o botão "voltar" do Android (Capacitor): navega para a tela anterior
 * em vez de fechar o app; só sai quando já está na tela inicial.
 *
 * IMPORTANTE: o listener é registrado UMA única vez. Antes ele era registrado
 * dentro de um efeito que dependia da rota, e a limpeza corria contra a Promise
 * do addListener — o listener antigo nem sempre era removido e vários se
 * acumulavam, fazendo o app "voltar demais" ou sair sozinho. Aqui usamos refs
 * para o handler sempre enxergar a rota/nav atuais sem precisar re-registrar.
 */
export default function BackHandler() {
  const navigate = useNavigate()
  const location = useLocation()

  // Refs mantêm os valores atuais sem recriar o listener.
  const navRef = useRef(navigate)
  const pathRef = useRef(location.pathname)
  navRef.current = navigate
  pathRef.current = location.pathname

  useEffect(() => {
    let handleRemove: (() => void) | undefined
    let active = true

    import('@capacitor/app')
      .then(({ App }) => {
        if (!active) return
        App.addListener('backButton', () => {
          // Se há um modal/sheet aberto, fecha-o em vez de navegar.
          const overlay = document.querySelector('.fixed.z-40')
          if (overlay) {
            ;(overlay as HTMLElement).click() // fecha ao tocar no backdrop
            return
          }
          if (pathRef.current !== '/') {
            navRef.current(-1)
          } else {
            App.exitApp()
          }
        }).then((handle) => {
          if (active) handleRemove = () => handle.remove()
          else handle.remove() // efeito desmontou enquanto registrava
        })
      })
      .catch(() => {})

    return () => {
      active = false
      handleRemove?.()
    }
    // Sem dependências: registra uma vez e limpa só na desmontagem.
  }, [])

  return null
}
