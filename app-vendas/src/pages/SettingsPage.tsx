import { useRef, useState } from 'react'
import PageHeader from '../components/PageHeader'
import ImageCropper from '../components/ImageCropper'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { salesRepo, ordersRepo } from '../lib/db'
import { shareTextOrLink } from '../lib/fileSave'
import { uploadImageIfNeeded } from '../lib/storage'
import type { CustomFieldDef, PaymentMethod, Settings } from '../types'

const BRAND_PRESETS: { label: string; rgb: string }[] = [
  { label: 'Preto', rgb: '17 17 17' },
  { label: 'Grafite', rgb: '51 65 85' },
  { label: 'Índigo', rgb: '79 70 229' },
  { label: 'Esmeralda', rgb: '5 150 105' },
  { label: 'Rosa', rgb: '219 39 119' },
  { label: 'Âmbar', rgb: '217 119 6' },
  { label: 'Azul', rgb: '37 99 235' },
  { label: 'Vermelho', rgb: '220 38 38' },
]

const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'ARS']
const MENU_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/pdv', label: 'Vendas / PDV' },
  { to: '/pedidos', label: 'Pedidos' },
  { to: '/produtos', label: 'Produtos' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/vendas', label: 'Histórico' },
]

function catalogUrl() {
  const hash = import.meta.env.VITE_HASH_ROUTER === '1'
  return hash
    ? `${location.origin}${location.pathname}#/catalogo`
    : `${location.origin}/catalogo`
}

export default function SettingsPage() {
  const { settings, save } = useSettings()
  const notify = useToast()
  const [form, setForm] = useState<Settings>(settings)
  const [saving, setSaving] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const logoFileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const onPickLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return notify('Selecione um arquivo de imagem', 'error')
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result as string)
    reader.readAsDataURL(file)
  }

  const submit = async () => {
    setSaving(true)
    try {
      // Sobe a logo para o Storage (URL leve) em vez de gravar base64.
      const logo_url = await uploadImageIfNeeded(form.logo_url, 'logo')
      await save({ ...form, logo_url })
      notify('Configurações salvas!')
    } catch (e) {
      notify('Erro ao salvar: ' + (e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const shareCatalog = async () => {
    const url = catalogUrl()
    const text = `Confira o catálogo da ${form.company_name} e faça seu pedido! ${url}`
    const result = await shareTextOrLink({ title: `${form.company_name} — Catálogo`, text, url })
    if (result === 'copied') notify('Link do catálogo copiado! Cole no WhatsApp e envie ao cliente.')
    else if (result === 'unsupported') notify('Não foi possível compartilhar. Copie o link manualmente.', 'error')
  }

  const [resetting, setResetting] = useState(false)
  const resetForRealUse = async () => {
    if (
      !confirm(
        'RECOMEÇAR DO ZERO\n\nIsto vai apagar permanentemente TODAS as vendas e TODOS os pedidos do catálogo — ideal para começar a usar de verdade após os testes.\n\nSeus produtos, categorias, clientes e configurações NÃO são afetados.\n\nDeseja continuar?',
      )
    )
      return
    if (!confirm('Tem certeza? Esta ação não pode ser desfeita.')) return
    setResetting(true)
    try {
      await salesRepo.clearAll()
      await ordersRepo.clearAll()
      notify('Pronto! Vendas e pedidos zerados. Bom começo! 🎉')
    } catch (e) {
      notify('Não foi possível zerar (verifique a conexão): ' + (e as Error).message, 'error')
    } finally {
      setResetting(false)
    }
  }

  // Payment methods
  const updatePm = (id: string, patch: Partial<PaymentMethod>) =>
    set('payment_methods', form.payment_methods.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const addPm = () =>
    set('payment_methods', [
      ...form.payment_methods,
      { id: crypto.randomUUID(), label: 'Nova forma', enabled: true },
    ])
  const removePm = (id: string) =>
    set('payment_methods', form.payment_methods.filter((p) => p.id !== id))

  // Custom fields
  const updateCf = (i: number, patch: Partial<CustomFieldDef>) =>
    set('product_custom_fields', form.product_custom_fields.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const addCf = () =>
    set('product_custom_fields', [
      ...form.product_custom_fields,
      { key: 'campo_' + (form.product_custom_fields.length + 1), label: 'Novo campo', type: 'text' },
    ])
  const removeCf = (i: number) =>
    set('product_custom_fields', form.product_custom_fields.filter((_, idx) => idx !== i))

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Configurações"
        subtitle="Personalize a identidade, moeda, pagamentos e campos do seu negócio"
        action={
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        }
      />

      <div className="space-y-6">
        {/* Identidade */}
        <section className="card space-y-4">
          <h2 className="font-semibold">Identidade</h2>
          <div>
            <label className="label">Nome da empresa</label>
            <input
              className="input"
              value={form.company_name}
              onChange={(e) => set('company_name', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Logo</label>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-100 text-lg font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="logo" className="h-full w-full object-cover" />
                ) : (
                  form.company_name.charAt(0).toUpperCase() || '?'
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
                <button
                  type="button"
                  className="btn-ghost border border-slate-300 dark:border-slate-700"
                  onClick={() => logoFileRef.current?.click()}
                >
                  {form.logo_url ? 'Trocar logo' : 'Enviar logo'}
                </button>
                {form.logo_url && (
                  <button type="button" className="btn-ghost text-red-600" onClick={() => set('logo_url', null)}>
                    Remover
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Aceita qualquer imagem/resolução — você ajusta o enquadramento a seguir. Ela é usada no menu, na
              tela de login, no catálogo e vira o favicon (ícone da aba) automaticamente.
            </p>
          </div>
        </section>

        {/* Navegação e experiência do painel */}
        <section className="card space-y-4">
          <div>
            <h2 className="font-semibold">Menu e experiência</h2>
            <p className="mt-1 text-xs text-slate-500">Escolha os atalhos que aparecem no painel. Configurações permanece sempre disponível.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {MENU_ITEMS.map((item) => {
              const visible = !form.hidden_menu_items.includes(item.to)
              return (
                <label key={item.to} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) =>
                      set(
                        'hidden_menu_items',
                        e.target.checked
                          ? form.hidden_menu_items.filter((to) => to !== item.to)
                          : [...form.hidden_menu_items, item.to],
                      )
                    }
                  />
                </label>
              )
            })}
          </div>
          <div>
            <label className="label">Densidade do menu</label>
            <div className="flex flex-wrap gap-2">
              {(['comfortable', 'compact'] as const).map((density) => (
                <button
                  key={density}
                  type="button"
                  onClick={() => set('interface_density', density)}
                  className={form.interface_density === density ? 'btn-primary' : 'btn-ghost border border-slate-300 dark:border-slate-700'}
                >
                  {density === 'comfortable' ? 'Confortável' : 'Compacto'}
                </button>
              ))}
            </div>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
            <span>
              <span className="block font-medium">Indicador de sincronização</span>
              <span className="text-xs text-slate-500">Mostra o estado dos dados acima de cada tela.</span>
            </span>
            <input type="checkbox" checked={form.show_sync_indicator} onChange={(e) => set('show_sync_indicator', e.target.checked)} />
          </label>
        </section>

        {/* Aparência */}
        <section className="card space-y-4">
          <h2 className="font-semibold">Aparência</h2>
          <div>
            <label className="label">Cor principal</label>
            <div className="flex flex-wrap gap-2">
              {BRAND_PRESETS.map((p) => (
                <button
                  key={p.rgb}
                  type="button"
                  title={p.label}
                  onClick={() => set('brand_color', p.rgb)}
                  className={`h-9 w-9 rounded-full ring-offset-2 transition ${
                    form.brand_color === p.rgb ? 'ring-2 ring-slate-900 dark:ring-white' : ''
                  }`}
                  style={{ backgroundColor: `rgb(${p.rgb})` }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="label">Tema</label>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('theme', t)}
                  className={form.theme === t ? 'btn-primary' : 'btn-ghost border border-slate-300 dark:border-slate-700'}
                >
                  {t === 'light' ? '☀️ Claro' : '🌙 Escuro'}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Regionalização */}
        <section className="card grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <h2 className="font-semibold">Regional & Estoque</h2>
          </div>
          <div>
            <label className="label">Moeda</label>
            <select className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Locale</label>
            <input className="input" value={form.locale} onChange={(e) => set('locale', e.target.value)} />
          </div>
          <div>
            <label className="label">Alerta de estoque baixo</label>
            <input
              type="number"
              className="input"
              value={form.low_stock_threshold}
              onChange={(e) => set('low_stock_threshold', Number(e.target.value))}
            />
          </div>
        </section>

        {/* Formas de pagamento */}
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Formas de pagamento</h2>
            <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={addPm}>
              + Adicionar
            </button>
          </div>
          {form.payment_methods.map((pm) => (
            <div key={pm.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pm.enabled}
                onChange={(e) => updatePm(pm.id, { enabled: e.target.checked })}
              />
              <input
                className="input flex-1"
                value={pm.label}
                onChange={(e) => updatePm(pm.id, { label: e.target.value })}
              />
              <button className="btn-ghost text-red-600" onClick={() => removePm(pm.id)}>
                ✕
              </button>
            </div>
          ))}
        </section>

        {/* Campos personalizados de produto */}
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Campos personalizados de produto</h2>
              <p className="text-xs text-slate-500">Adicione atributos extras (ex.: cor, marca, validade)</p>
            </div>
            <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={addCf}>
              + Adicionar
            </button>
          </div>
          {form.product_custom_fields.length === 0 && (
            <p className="text-sm text-slate-400">Nenhum campo personalizado.</p>
          )}
          {form.product_custom_fields.map((cf, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2">
              <input
                className="input col-span-5"
                placeholder="Rótulo"
                value={cf.label}
                onChange={(e) => updateCf(i, { label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
              />
              <select
                className="input col-span-5"
                value={cf.type}
                onChange={(e) => updateCf(i, { type: e.target.value as CustomFieldDef['type'] })}
              >
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="boolean">Sim/Não</option>
              </select>
              <button className="btn-ghost col-span-2 text-red-600" onClick={() => removeCf(i)}>
                ✕
              </button>
            </div>
          ))}
        </section>

        {/* Catálogo público / WhatsApp */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Catálogo público (loja)</h2>
              <p className="text-xs text-slate-500">Compartilhe com clientes; pedidos chegam pelo WhatsApp</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.catalog_enabled}
                onChange={(e) => set('catalog_enabled', e.target.checked)}
              />
              Ativo
            </label>
          </div>
          <div>
            <label className="label">Número do WhatsApp (com DDI + DDD, só números)</label>
            <input
              className="input"
              placeholder="5511999999999"
              value={form.whatsapp_number}
              onChange={(e) => set('whatsapp_number', e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div>
            <label className="label">Mensagem do catálogo</label>
            <input
              className="input"
              value={form.catalog_message}
              onChange={(e) => set('catalog_message', e.target.value)}
            />
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
            <span>
              <span className="block font-medium">Mostrar estoque no catálogo</span>
              <span className="text-xs text-slate-500">Exibe a quantidade disponível na tela de detalhes do produto.</span>
            </span>
            <input type="checkbox" checked={form.catalog_show_stock} onChange={(e) => set('catalog_show_stock', e.target.checked)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={shareCatalog}>
              Compartilhar catálogo
            </button>
            <a href={catalogUrl()} target="_blank" rel="noreferrer" className="btn-ghost border border-slate-300 dark:border-slate-700">
              Abrir catálogo
            </a>
            <button
              type="button"
              className="btn-ghost border border-slate-300 dark:border-slate-700"
              onClick={() => {
                navigator.clipboard?.writeText(catalogUrl())
                notify('Link do catálogo copiado!')
              }}
            >
              Copiar link
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Dica: publique o app (ex.: Vercel) e compartilhe este link. Com o Supabase configurado, os
            produtos aparecem para qualquer cliente que abrir a página.
          </p>
        </section>

        {/* Zona de perigo — recomeçar para uso real */}
        <section className="card space-y-3 border-red-300 dark:border-red-900/60">
          <div>
            <h2 className="font-semibold text-red-600">Recomeçar (uso real)</h2>
            <p className="text-xs text-slate-500">
              Terminou os testes? Zere as vendas e os pedidos para começar a operar de verdade. Seus
              produtos, categorias, clientes e configurações são mantidos.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost border border-red-300 text-red-600 dark:border-red-900/60"
            onClick={resetForRealUse}
            disabled={resetting}
          >
            {resetting ? 'Zerando…' : 'Zerar vendas e pedidos'}
          </button>
        </section>
      </div>

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          output={256}
          onCancel={() => setCropSrc(null)}
          onConfirm={(dataUrl) => {
            set('logo_url', dataUrl)
            setCropSrc(null)
          }}
        />
      )}
    </div>
  )
}
