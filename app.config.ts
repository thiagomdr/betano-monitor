import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'betano-monitor',
  slug: 'betano-monitor',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: 'betano-monitor',
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
  },
  android: {
    package: 'br.betano.monitor',
    adaptiveIcon: {
      backgroundColor: '#111111',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'INTERNET',
      'POST_NOTIFICATIONS',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_DATA_SYNC',
      'WAKE_LOCK',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: ['./plugins/with-android-monitor.js', 'expo-sqlite'],
  extra: {
    eas: {
      projectId: 'betano-monitor-local',
    },
  },
};

export default config;
