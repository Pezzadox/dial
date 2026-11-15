// Push notifications on phones: ask once, register this device's Expo push token with the server,
// and open the right chat when a notification is tapped. The web preview uses the in-app banner instead.
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabaseApi } from '../api';

// In the foreground the app shows its own banner, so the system one stays quiet.
if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

export async function registerForPush(onOpen: (withId: string) => void) {
  if (Platform.OS === 'web' || !Device.isDevice || !supabaseApi) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Dialled in', importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const projectId = (Constants.expoConfig as any)?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  await supabaseApi.client.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  Notifications.addNotificationResponseReceivedListener((r) => {
    const withId = (r.notification.request.content.data as any)?.with;
    if (withId) onOpen(withId);
  });
}
