import type { CapacitorConfig } from '@capacitor/cli'

// Empacota o app dentro do APK (assets locais), funcionando 100% offline.
const config: CapacitorConfig = {
  appId: 'com.helrisson.appvendas',
  appName: 'Gestão de Vendas',
  webDir: 'dist',
}

export default config
