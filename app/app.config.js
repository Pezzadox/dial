// One codebase, two apps. EXPO_PUBLIC_APP=quick builds Quick Dial; anything else builds Dial.
// app.json holds what both share; this file adds the store identity and phone permissions.
const QUICK = process.env.EXPO_PUBLIC_APP === 'quick';

// Filled in once the Expo project exists (`npx eas init` prints it). Push notifications need it.
const EAS_PROJECT_ID = { quick: '', dial: '' };

module.exports = ({ config }) => {
  // A store build must never ship the demo (invented people). On Expo's build servers or in the
  // GitHub Android build, refuse to build Quick Dial for the stores without the live backend.
  const storeBuild = (process.env.EAS_BUILD === 'true' && /production/.test(process.env.EAS_BUILD_PROFILE || ''))
    || process.env.QUICK_STORE_BUILD === 'true';
  if (storeBuild && !(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)) {
    throw new Error('Store build without EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY would ship the demo. Set them as EAS environment variables (production) or as the QUICKDIAL_SUPABASE_* GitHub secrets.');
  }
  const id = QUICK ? 'com.pezzadox.quickdial' : 'com.dialdating.app';
  const name = QUICK ? 'Quick Dial' : config.name;
  const projectId = EAS_PROJECT_ID[QUICK ? 'quick' : 'dial'] || undefined;
  return {
    ...config,
    name,
    slug: QUICK ? 'quick-dial' : config.slug,
    scheme: QUICK ? 'quickdial' : 'dial',
    version: process.env.APP_VERSION || config.version,
    runtimeVersion: { policy: 'appVersion' },
    ios: {
      ...config.ios,
      bundleIdentifier: id,
      supportsTablet: false,
      config: { usesNonExemptEncryption: false },
      infoPlist: {
        NSCameraUsageDescription: `${name} uses the camera for your selfie check and for photos and videos you choose to add.`,
        NSPhotoLibraryUsageDescription: `${name} lets you choose photos and videos for your profile.`,
        NSMicrophoneUsageDescription: `${name} records sound only while you film a profile video.`,
        NSLocationWhenInUseUsageDescription: `${name} uses your rough location, rounded to about a kilometre, to show people nearby.`,
      },
    },
    android: {
      ...config.android,
      package: id,
      // Set by the GitHub build (minutes since 2026-01-01) so every Play upload is newer.
      ...(process.env.ANDROID_VERSION_CODE ? { versionCode: Number(process.env.ANDROID_VERSION_CODE) } : {}),
      blockedPermissions: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.READ_MEDIA_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'],
    },
    plugins: [
      'expo-font',
      ['expo-camera', { cameraPermission: `${name} uses the camera for your selfie check and for photos and videos you choose to add.`, microphonePermission: `${name} records sound only while you film a profile video.`, recordAudioAndroid: true }],
      ['expo-image-picker', { photosPermission: `${name} lets you choose photos and videos for your profile.` }],
      ['expo-location', { locationWhenInUsePermission: `${name} uses your rough location, rounded to about a kilometre, to show people nearby.` }],
      ['expo-notifications', { color: '#08070F' }],
      'expo-audio',
      'expo-video',
      'expo-web-browser',
    ],
    extra: { ...(config.extra || {}), app: QUICK ? 'quick' : 'dial', ...(projectId ? { eas: { projectId } } : {}) },
  };
};
