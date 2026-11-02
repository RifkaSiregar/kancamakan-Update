import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Benefits, IconBtn, Small, s } from '../components/ui';
import { t, useT } from '../i18n';
import { C } from '../theme';

export default function Rules() {
  useT();
  return (
    <SafeAreaView style={s.screen}>
      <View style={[s.bar, { justifyContent: 'space-between' }]}>
        <IconBtn name="back" label={t('Kembali')} size={20} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{t('Aturan komunitas')}</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}>
        <Text style={{ fontSize: 15, lineHeight: 22, color: C.ink }}>{t('KancaMakan adalah tempat saling mendukung untuk hidup lebih sehat. Supaya tetap nyaman untuk semua:')}</Text>
        <Benefits
          items={(
            [
            ['Saling menghargai', 'Tidak ada komentar tentang bentuk tubuh orang lain, ejekan, atau perundungan.'],
            ['Tanpa saran diet berbahaya', 'Dilarang mempromosikan obat pelangsing, puasa ekstrem, memuntahkan makanan, atau target berat badan ekstrem.'],
            ['Bukan saran medis', 'Pengalaman pribadi boleh dibagikan, tapi untuk kondisi kesehatan tetap konsultasikan ke tenaga kesehatan.'],
            ['Tanpa spam & promosi', 'Jualan produk atau tautan promosi akan dihapus.'],
            ['Laporkan & blokir', 'Laporkan postingan yang melanggar. Postingan yang dilaporkan banyak orang disembunyikan otomatis.'],
            ] as [string, string][]
          ).map(([a, b]) => [t(a), t(b)])}
        />
        <Small>{t('Postingan dari "Asisten KancaMakan" disiapkan dan dijadwalkan oleh tim KancaMakan (sebagian dengan bantuan AI) berdasarkan database makanan dan tips KancaMakan.')}</Small>
      </ScrollView>
    </SafeAreaView>
  );
}
