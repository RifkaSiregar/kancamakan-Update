import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Btn, Card, Small, s } from '../components/ui';
import { useQuery } from '../lib/query';
import type { ChallengeWeek } from '../lib/types';
import { thisWeek } from '../store';
import { t, useT } from '../i18n';
import { C } from '../theme';

export default function Waitlist() {
  useT();
  const week = thisWeek();
  const ch = useQuery<ChallengeWeek>(`/api/challenges/current?from=${week[0].key}`);
  return (
    <SafeAreaView style={[s.screen, { paddingHorizontal: 18, paddingTop: 20 }]}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={40} color={C.acc} stroke={2.6} />
        </View>
        <Text style={{ marginTop: 20, marginBottom: 8, fontSize: 24, fontWeight: '700', color: C.ink, textAlign: 'center' }}>{t('Terima kasih!')}</Text>
        <Text style={{ color: C.muted, lineHeight: 22, fontSize: 14.5, maxWidth: 300, textAlign: 'center' }}>{t('Minatmu sudah kami catat. Kami kabari saat KancaMakan Premium tersedia. Sementara itu, komunitas tetap gratis.')}</Text>
        {ch.data && (
          <Card style={{ marginTop: 22, alignSelf: 'stretch', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Small style={{ fontWeight: '700' }}>{t('Selagi menunggu')}</Small>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink, marginTop: 2 }}>{t('Ikuti tantangan “{title}”', { title: ch.data.current.title })}</Text>
            <Small>{t('{n} dari 7 hari selesai', { n: ch.data.days.length })}</Small>
          </Card>
        )}
      </View>
      <Btn title={t('Kembali ke komunitas')} onPress={() => router.dismissTo('/home')} style={{ marginBottom: 18 }} />
    </SafeAreaView>
  );
}
