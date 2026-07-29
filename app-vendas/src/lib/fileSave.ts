/**
 * Salvar/compartilhar arquivos de forma que funcione TAMBÉM no app nativo.
 *
 * No WebView do Android o padrão web (`<a download>`) NÃO baixa arquivo — o
 * clique simplesmente não faz nada. Então, no nativo, gravamos o arquivo no
 * armazenamento do app e abrimos a folha de compartilhamento do sistema (que
 * oferece "Salvar em Arquivos/Fotos", "Imprimir", enviar por WhatsApp etc.).
 * Na web, mantém o download normal.
 */

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** Detecção SÍNCRONA de app nativo (o Capacitor injeta um global no WebView).
 *  Necessária para chamar navigator.share sem await antes (exigência de gesto). */
export function isNativeSync(): boolean {
  const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'))
    reader.onload = () => {
      const res = reader.result as string
      // res é "data:<mime>;base64,XXXX" — envia só a parte base64.
      resolve(res.slice(res.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * Salva/compartilha um Blob. `dialogTitle` aparece na folha de
 * compartilhamento no Android. Lança em caso de erro (o chamador avisa).
 */
export async function saveOrShareBlob(
  blob: Blob,
  fileName: string,
  dialogTitle = 'Salvar ou compartilhar',
): Promise<void> {
  if (await isNative()) {
    const base64 = await blobToBase64(blob)
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache })
    const { Share } = await import('@capacitor/share')
    await Share.share({ title: fileName, url: written.uri, dialogTitle })
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Converte um canvas em Blob PNG (Promise). */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png')
  })
}

/**
 * Compartilha ARQUIVOS (ex.: fotos dos produtos) no app NATIVO via plugin do
 * Capacitor — que suporta anexos, ao contrário do navigator.share do WebView do
 * Android (que ignora/não suporta `files`). Grava os arquivos no cache e abre a
 * folha de compartilhamento. Retorna true se compartilhou.
 */
export async function shareFilesNative(files: File[], text: string, title?: string): Promise<boolean> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const uris: string[] = []
    for (const f of files) {
      const base64 = await blobToBase64(f)
      const written = await Filesystem.writeFile({ path: f.name, data: base64, directory: Directory.Cache })
      uris.push(written.uri)
    }
    const { Share } = await import('@capacitor/share')
    await Share.share({ text, title, files: uris, dialogTitle: title })
    return true
  } catch {
    return false
  }
}

/**
 * Compartilha um texto/link (ex.: o link do catálogo) da melhor forma
 * disponível: folha nativa (Capacitor) → Web Share API → copiar para a área de
 * transferência. Retorna o que aconteceu para a UI dar o feedback certo.
 */
export async function shareTextOrLink(opts: {
  title?: string
  text?: string
  url?: string
}): Promise<'shared' | 'copied' | 'unsupported'> {
  if (isNativeSync()) {
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share(opts)
      return 'shared'
    } catch {
      /* cai para os próximos métodos */
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(opts)
      return 'shared'
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'shared'
      /* cai para copiar */
    }
  }
  try {
    await navigator.clipboard?.writeText(opts.url || opts.text || '')
    return 'copied'
  } catch {
    return 'unsupported'
  }
}
