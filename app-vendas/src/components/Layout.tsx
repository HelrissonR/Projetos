import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSettings } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { ordersRepo } from '../lib/db'
import SyncIndicator from './SyncIndicator'
import {
  IconDashboard,
  IconCart,
  IconBell,
  IconBox,
  IconUsers,
  IconReceipt,
  IconSettings,
  IconStore,
  IconLogout,
} from './icons'
import type { ComponentType, SVGProps } from 'react'

const nav: { to: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', Icon: IconDashboard, end: true },
  { to: '/pdv', label: 'Vendas / PDV', Icon: IconCart },
  { to: '/pedidos', label: 'Pedidos', Icon: IconBell },
  { to: '/produtos', label: 'Produtos', Icon: IconBox },
  { to: '/clientes', label: 'Clientes', Icon: IconUsers },
  { to: '/vendas', label: 'Histórico', Icon: IconReceipt },
  { to: '/configuracoes', label: 'Configurações', Icon: IconSettings },
]

export default function Layout() {
  const { settings } = useSettings()
  const { user, authEnabled, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [pending, setPending] = useState(0)
  const location = useLocation()
  const visibleNav = nav.filter((item) => item.to === '/configuracoes' || !settings.hidden_menu_items.includes(item.to))
  const primaryNav = visibleNav.slice(0, 4)
  const secondaryNav = visibleNav.slice(4)
  const navSpacing = settings.interface_density === 'compact' ? 'py-1.5 md:min-h-9' : 'py-2'

  // Atualiza o contador de pedidos pendentes ao navegar
  useEffect(() => {
    ordersRepo
      .list()
      .then((os) => setPending(os.filter((o) => o.status === 'pending').length))
      .catch(() => {})
  }, [location.pathname])

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[min(18rem,88vw)] flex-col transform border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 md:static md:w-64 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt="logo" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white font-bold">
              {settings.company_name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="truncate font-semibold">{settings.company_name}</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-1">
          {primaryNav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-lg px-3 ${navSpacing} text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              <n.Icon />
              <span className="flex-1">{n.label}</span>
              {n.to === '/pedidos' && pending > 0 && (
                <span className="badge bg-red-600 text-white">{pending}</span>
              )}
            </NavLink>
          ))}
          </div>
          <div className="mt-2 hidden flex-col gap-1 md:flex">
            {secondaryNav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-lg px-3 ${navSpacing} text-sm font-medium transition ${
                    isActive
                      ? 'bg-brand text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`
                }
              >
                <n.Icon />
                <span className="flex-1">{n.label}</span>
              </NavLink>
            ))}
          </div>
          <div className="mt-2 md:hidden">
            <button
              type="button"
              onClick={() => setShowMore((value) => !value)}
              className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-expanded={showMore}
            >
              Mais opções
              <span className={`text-base transition-transform ${showMore ? 'rotate-180' : ''}`}>⌄</span>
            </button>
            {showMore && (
              <div className="mt-1 flex flex-col gap-1">
                {secondaryNav.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center gap-3 rounded-lg px-3 ${navSpacing} text-sm font-medium transition ${
                        isActive
                          ? 'bg-brand text-white'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`
                    }
                  >
                    <n.Icon />
                    <span className="flex-1">{n.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>
        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <a
          href={
            import.meta.env.VITE_HASH_ROUTER === '1'
              ? `${location.pathname}#/catalogo`
              : '/catalogo'
          }
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <IconStore /> Ver catálogo
          </a>
        {!isSupabaseConfigured && (
          <div className="mt-2 rounded-lg bg-amber-100 p-3 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            Modo demonstração — dados salvos no navegador. Configure o Supabase para persistir.
          </div>
          )}
        </div>
        {authEnabled && user && (
          <div className="mt-auto border-t border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 truncate px-1 text-xs text-slate-500" title={user.email ?? ''}>
              {user.email}
            </div>
            <button className="btn-ghost w-full justify-start border border-slate-300 dark:border-slate-700" onClick={() => signOut()}>
              <IconLogout /> Sair
            </button>
          </div>
        )}
      </aside>

      {open && (
        <div className="anim-fade fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 md:hidden">
          <button className="btn-ghost px-2 py-1 text-xl" onClick={() => setOpen(true)} aria-label="Menu">
            ☰
          </button>
          <span className="truncate font-semibold">{settings.company_name}</span>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          {settings.show_sync_indicator && (
            <div className="mb-3">
              <SyncIndicator />
            </div>
          )}
          {/* key por rota re-dispara a animação de entrada da página */}
          <div key={location.pathname} className="anim-page">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
