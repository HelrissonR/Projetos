import { supabase } from './supabase'

const BUCKET = 'product-images'

/**
 * Sobe uma imagem (data URI vinda do cropper) para o Supabase Storage e devolve
 * a URL pública — em vez de guardar o base64 gigante dentro do banco. Isso deixa
 * as listagens leves, o catálogo rápido e permite compartilhar as fotos.
 *
 * Regras:
 *  • Se já for uma URL http(s), devolve como está (nada a fazer).
 *  • Sem Supabase (modo demo) ou offline, mantém o data URI como fallback — o
 *    app continua funcionando; a imagem migra para o Storage numa próxima edição
 *    online.
 */
export async function uploadImageIfNeeded(image: string | null, folder = 'products'): Promise<string | null> {
  if (!image) return image
  if (/^https?:\/\//i.test(image)) return image // já está no Storage/URL
  if (!image.startsWith('data:')) return image
  if (!supabase) return image // modo demonstração
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return image // offline: mantém data URI

  try {
    const blob = await (await fetch(image)).blob()
    const ext = (blob.type.split('/')[1] || 'jpg').split('+')[0]
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  } catch {
    // Falha no upload (rede/permite) → mantém o data URI para não perder a imagem.
    return image
  }
}
