import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId:    'com.teslalightshow.app',
  appName:  'Tesla LightShow',
  webDir:   'out',
  plugins: {
    Filesystem: { iosScheme: 'ionic' },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    backgroundColor: '#0a0a0f',
  },
  android: {
    backgroundColor: '#0a0a0f',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
}

export default config
