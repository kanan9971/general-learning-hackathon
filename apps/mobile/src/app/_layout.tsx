import { DarkTheme, DefaultTheme, ThemeProvider, Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#0F766E' }}>
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="portfolio" options={{ title: 'Portfolio' }} />
        <Tabs.Screen name="learn" options={{ title: 'Learn' }} />
        <Tabs.Screen name="desk" options={{ title: 'Desk' }} />
      </Tabs>
    </ThemeProvider>
  );
}
