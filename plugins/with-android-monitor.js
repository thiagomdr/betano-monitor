const {
  withAndroidManifest,
  AndroidConfig,
} = require('@expo/config-plugins');

function addForegroundService(mainApplication) {
  const service = {
    $: {
      'android:name': 'com.asterinet.react.bgactions.RNBackgroundActionsTask',
      'android:foregroundServiceType': 'dataSync',
    },
  };

  if (!mainApplication.service) {
    mainApplication.service = [service];
    return;
  }

  const services = Array.isArray(mainApplication.service)
    ? mainApplication.service
    : [mainApplication.service];

  const exists = services.some(
    (item) =>
      item?.$?.['android:name'] ===
      'com.asterinet.react.bgactions.RNBackgroundActionsTask',
  );

  if (!exists) {
    services.push(service);
  }

  mainApplication.service = services;
}

module.exports = function withAndroidMonitor(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const permissions = manifest['uses-permission'] ?? [];

    const required = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.WAKE_LOCK',
      'android.permission.POST_NOTIFICATIONS',
    ];

    for (const permission of required) {
      if (
        !permissions.some((item) => item?.$?.['android:name'] === permission)
      ) {
        permissions.push({ $: { 'android:name': permission } });
      }
    }

    manifest['uses-permission'] = permissions;

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    addForegroundService(app);

    return config;
  });
};
