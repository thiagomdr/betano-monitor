import { Alert, Platform } from 'react-native';

import { hasNotifeeNativeModule } from './nativeCapabilities';

const SERVICE_CHANNEL_ID = 'monitor-service';
const ALERT_CHANNEL_ID = 'monitor-alerts';

type NotifeeModule = typeof import('@notifee/react-native').default;

function loadNotifee():
  | { notifee: NotifeeModule; AndroidImportance: typeof import('@notifee/react-native').AndroidImportance }
  | null {
  if (!hasNotifeeNativeModule()) return null;
  const mod = require('@notifee/react-native') as typeof import('@notifee/react-native');
  return { notifee: mod.default, AndroidImportance: mod.AndroidImportance };
}

export async function setupNotificationChannels(): Promise<void> {
  const mod = loadNotifee();
  if (!mod) return;

  const { notifee, AndroidImportance } = mod;
  await notifee.createChannel({
    id: SERVICE_CHANNEL_ID,
    name: 'Monitor ativo',
    importance: AndroidImportance.LOW,
  });

  await notifee.createChannel({
    id: ALERT_CHANNEL_ID,
    name: 'Alertas de basquete',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const mod = loadNotifee();
  if (!mod) return false;

  const settings = await mod.notifee.requestPermission();
  return settings.authorizationStatus >= 1;
}

export async function showGameAlert(title: string, body: string): Promise<void> {
  const mod = loadNotifee();
  if (mod) {
    const { notifee, AndroidImportance } = mod;
    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: ALERT_CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default' },
      },
    });
    return;
  }

  if (Platform.OS !== 'web') {
    Alert.alert(title, body);
  }
}

export function getForegroundServiceOptions() {
  return {
    taskName: 'BetanoMonitor',
    taskTitle: 'Monitor Betano ativo',
    taskDesc: 'Acompanhando basquete ao vivo',
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap' as const,
    },
    color: '#c45c00',
    linkingURI: 'betano-monitor://monitor',
  };
}
