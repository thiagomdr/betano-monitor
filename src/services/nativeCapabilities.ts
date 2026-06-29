import { NativeModules } from 'react-native';

export function hasNotifeeNativeModule(): boolean {
  return NativeModules.NotifeeApiModule != null;
}

export function hasBackgroundJobNativeModule(): boolean {
  return NativeModules.RNBackgroundActions != null;
}

/** Expo Go — sem Notifee nem foreground service. */
export function isExpoGoRuntime(): boolean {
  return !hasNotifeeNativeModule() && !hasBackgroundJobNativeModule();
}
