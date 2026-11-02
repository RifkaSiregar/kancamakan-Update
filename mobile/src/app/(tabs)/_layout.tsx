import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '../../components/TabBar';
import { useT } from '../../i18n';
import { C } from '../../theme';

export default function TabsLayout() {
  const t = useT();
  return (
    <Tabs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tabBar={(props: any) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}
    >
      <Tabs.Screen name="home" options={{ title: t('Beranda') }} />
      <Tabs.Screen name="challenges" options={{ title: t('Tantangan') }} />
      <Tabs.Screen name="foods" options={{ title: t('Makanan') }} />
      <Tabs.Screen name="profile" options={{ title: t('Profil') }} />
    </Tabs>
  );
}
