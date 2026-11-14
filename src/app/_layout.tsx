import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { onNotificationTapped } from '@/services/reminder';
import { cleanupExportedBackups, cleanupPickedFiles } from '@/services/temp-files';
import { DataProvider } from '@/state/data';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  useEffect(() => {
    SplashScreen.hideAsync();
    // Korábbi importok és mentések gyorsítótárban maradt másolatainak törlése.
    cleanupPickedFiles();
    cleanupExportedBackups();
  }, []);

  // Értesítésre koppintva: havi emlékeztető -> Import fül, előfizetés-értesítő -> Előfizetések.
  useEffect(() => onNotificationTapped((screen) => router.navigate(screen === 'import' ? '/import' : '/subscriptions')), []);

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DataProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.tint,
            headerTitleStyle: { color: colors.text },
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Tétel' }} />
          <Stack.Screen name="settings" options={{ headerShown: true, title: 'Beállítások' }} />
          <Stack.Screen name="subscriptions" options={{ headerShown: true, title: 'Előfizetések' }} />
        </Stack>
      </DataProvider>
    </ThemeProvider>
  );
}
