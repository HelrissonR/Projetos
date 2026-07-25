import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Trata o botão "voltar" do Android (Capacitor): navega para a tela anterior
 * em vez de fechar o app. Só sai do app quando já está na tela inicial.
 * Em ambiente web (sem Capacitor) o listener simplesmente não dispara.
 */
export default function BackHandler() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    let remove: (() => void) | undefined
    let active = true

    // Import dinâmico para não quebrar o build web caso o plugin não exista
    import('@capacitor/app')
      .then(({ App }) => {
        if (!active) return
        App.addListener('backButton', ({ canGoBack }) => {
          // Se há um modal/sheet aberto, deixa o próprio elemento tratar (Esc)
          const hasOverlay = document.querySelector('.fixed.z-40')
          if (hasOverlay) {
            ;(hasOverlay as HTMLElement).click() // fecha ao tocar no backdrop
            return
          }
          if (canGoBack && location.pathname !== '/') {
            navigate(-1)
          } else if (location.pathname !== '/') {
            navigate('/')
          } else {
            App.exitApp()
          }
        }).then((handle) => {
          remove = () => handle.remove()
        })
      })
      .catch(() => {})

    return () => {
      active = false
      remove?.()
    }
  }, [navigate, location.pathname])

  return null
}
