import { router } from 'expo-router';
import { AView } from '../components/AView';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MacroBar, Ring, WeekBars } from '../components/Charts';
import { Icon } from '../components/Icon';
import { FoodPhoto } from '../components/FoodPhoto';
import { Benefits, Btn, Card, LinkBtn, Pill, RadioRow, Seg, Small } from '../components/ui';
import { DAILY_TARGET, DISHES, FOODS, PORTIONS, PRICE_MONTH_EQ, PRICE_YEAR } from '../data/sample';
import { locale, t, useT } from '../i18n';
import { useApp } from '../store';
import { C } from '../theme';

// "Video" demo interaktif: langkah berjalan otomatis, bisa dijeda, dilewati, atau diketuk.
const STEPS = [
  { t: 'Buka tab Tracking', p: 'Hari ini masih kosong. Setelah makan, ketuk "Catat lewat foto".', ms: 4200 },
  { t: 'Foto makananmu', p: 'Cukup satu foto. Tidak perlu mengetik nama makanan.', ms: 3600 },
  { t: 'AI menganalisis foto', p: 'AI hanya mengusulkan nama makanan, bukan angka kalori.', ms: 2400 },
  { t: 'Kamu yang memilih', p: 'Pilih tebakan yang benar, atur porsi, lalu lihat kalorinya.', ms: 5000 },
  { t: 'Kalori dihitung dari data pangan', p: 'Angka berasal dari tabel komposisi pangan, lalu disesuaikan dengan porsimu.', ms: 4600 },
  { t: 'Masuk ke ringkasan harianmu', p: 'Sisa kalori, protein, lemak, dan karbo diperbarui otomatis.', ms: 4200 },
  { t: 'Lihat polanya sepanjang minggu', p: 'Laporan mingguan menunjukkan hari yang melewati target.', ms: 4600 },
  { t: 'Segera hadir', p: 'Komunitas tetap gratis. Tracking akan tersedia untuk pelanggan Premium.', ms: 0 },
];
const CANDS = DISHES[0].c;
const num = (v: number) => v.toLocaleString(locale());

export default function Demo() {
  useT();
  const setWatchedDemo = useApp((st) => st.setWatchedDemo);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sel, setSel] = useState(-1);
  const [port, setPort] = useState(1);
  const fill = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const [flash, setFlash] = useState(false);

  // Garis pindai bergerak naik-turun saat "AI menganalisis foto".
  useEffect(() => {
    if (i !== 2) return;
    scan.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(scan, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [i, scan]);
  const step = STEPS[i];

  useEffect(() => {
    setWatchedDemo();
  }, [setWatchedDemo]);

  // Isi bilah progres dan maju otomatis.
  const lastStep = useRef(-1);
  useEffect(() => {
    let anim: Animated.CompositeAnimation | undefined;
    fill.stopAnimation((v) => {
      if (!step.ms) {
        fill.setValue(1);
        return;
      }
      // Langkah baru mulai dari 0; melanjutkan setelah jeda mulai dari posisi terakhir.
      const from = lastStep.current === i ? v : 0;
      lastStep.current = i;
      fill.setValue(from);
      if (paused) return;
      anim = Animated.timing(fill, { toValue: 1, duration: step.ms * (1 - from), easing: Easing.linear, useNativeDriver: false });
      anim.start(({ finished }) => finished && setI((x) => Math.min(STEPS.length - 1, x + 1)));
    });
    return () => anim?.stop();
  }, [i, paused, step.ms, fill]);

  // Pada langkah "Kamu yang memilih", contoh memilih otomatis tebakan pertama.
  useEffect(() => {
    if (i !== 3 || sel > -1) return;
    const t = setTimeout(() => setSel(0), 1300);
    return () => clearTimeout(t);
  }, [i, sel]);

  const go = (n: number) => {
    setPaused(false);
    setI(Math.max(0, Math.min(STEPS.length - 1, n)));
  };
  const f = FOODS[CANDS[sel > -1 ? sel : 0]];
  const k = Math.round(f.k * port);

  const cta = () => {
    // Kembali ke layar Premium untuk mendaftarkan minat (fitur belum tersedia).
    if (router.canGoBack()) router.back();
    else router.replace('/promo');
  };

  const body = () => {
    switch (i) {
      case 0:
        return (
          <>
            <Small>{t('Hari ini')}</Small>
            <Text style={st.title}>{t('Tracking kalori')}</Text>
            <Card style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ring eaten={0} target={DAILY_TARGET} size={100} />
              <View>
                <Small>{t('Masuk (kalori)')}</Small>
                <Text style={{ fontWeight: '700', color: C.ink }}>0 {t('kkal')}</Text>
                <Small style={{ marginTop: 6 }}>{t('Target')}</Small>
                <Text style={{ fontWeight: '700', color: C.ink }}>{num(DAILY_TARGET)} {t('kkal')}</Text>
              </View>
            </Card>
            <Card style={{ marginTop: 10, paddingHorizontal: 12 }}>
              {['Sarapan', 'Makan siang', 'Makan malam'].map((m) => (
                <View key={m} style={{ flexDirection: 'row', minHeight: 40, alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: C.ink }}>{t(m)}</Text>
                  <Small>{t('Belum dicatat')}</Small>
                </View>
              ))}
            </Card>
            <View style={{ position: 'absolute', right: 14, bottom: 16 }}>
              <Btn title={t('Catat lewat foto')} icon="cam" small onPress={() => go(1)} style={{ borderRadius: 23 }} />
            </View>
          </>
        );
      case 1:
        return (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: C.camera }]}>
            <View style={StyleSheet.absoluteFill}>
              <FoodPhoto width="100%" height="100%" />
            </View>
            {/* Bingkai fokus kamera di sekitar piring */}
            <View style={st.focus} pointerEvents="none">
              <View style={[st.corner, { left: 0, top: 0, borderRightWidth: 0, borderBottomWidth: 0 }]} />
              <View style={[st.corner, { right: 0, top: 0, borderLeftWidth: 0, borderBottomWidth: 0 }]} />
              <View style={[st.corner, { left: 0, bottom: 0, borderRightWidth: 0, borderTopWidth: 0 }]} />
              <View style={[st.corner, { right: 0, bottom: 0, borderLeftWidth: 0, borderTopWidth: 0 }]} />
            </View>
            <View style={st.hint}>
              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>{t('Arahkan ke makananmu')}</Text>
            </View>
            <View style={{ position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Ambil foto')}
                onPress={() => {
                  setFlash(true);
                  setTimeout(() => {
                    setFlash(false);
                    go(2);
                  }, 220);
                }}
                style={st.shut}
              >
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#fff' }} />
              </Pressable>
            </View>
            {flash && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: 0.85 }]} />}
          </View>
        );
      case 2:
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <View style={st.scanBox}>
              <FoodPhoto width={210} height={210} />
              <AView style={[st.scanLine, { transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [0, 206] }) }] }]} />
              <View style={[st.tag, { left: 70, top: 64 }]}>
                <Text style={st.tagTxt}>{t('nasi')}</Text>
              </View>
              <View style={[st.tag, { left: 120, top: 30 }]}>
                <Text style={st.tagTxt}>{t('telur')}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <ActivityIndicator color={C.acc} />
              <Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>{t('Menganalisis foto…')}</Text>
            </View>
          </View>
        );
      case 3:
        return (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 76, height: 76, borderRadius: 16, overflow: 'hidden' }}>
                <FoodPhoto width={76} height={76} />
              </View>
              <View style={{ flex: 1 }}>
                <Small>{t('Foto makan siang · 12.30')}</Small>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.accDark, marginTop: 2 }}>{t('Terdeteksi: nasi, telur, timun')}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 17, fontWeight: '800', marginVertical: 8, color: C.ink }}>{t('Ini makanan apa?')}</Text>
            <View style={{ gap: 7 }}>
              {CANDS.map((id, j) => (
                <RadioRow key={id} on={sel === j} onPress={() => setSel(j)} title={t(FOODS[id].n)} right={`± ${FOODS[id].k} ${t('kkal')}`} style={{ minHeight: 46 }} />
              ))}
            </View>
            {sel > -1 && (
              <View style={{ marginTop: 10 }}>
                <Seg label={t('Porsi')} value={port} onChange={setPort} options={PORTIONS.map(([l, v]) => [t(l), v] as [string, number])} />
              </View>
            )}
          </>
        );
      case 4:
        return (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden' }}>
                <FoodPhoto width={44} height={44} />
              </View>
              <Small>
                {t(f.n)} · {t('porsi {size}', { size: t(PORTIONS.find((p) => p[1] === port)?.[0] ?? 'Sedang').toLowerCase() })}
              </Small>
            </View>
            <Text style={st.title}>{t('Perkiraan kalori')}</Text>
            <Card style={{ padding: 14 }}>
              <Text style={{ fontSize: 44, fontWeight: '800', color: C.ink }}>
                {k} <Text style={{ fontSize: 16, color: C.muted }}>{t('kkal')}</Text>
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <Pill label={`${t('Protein')} ${Math.round(f.p * port)} g`} />
                <Pill label={`${t('Lemak')} ${Math.round(f.l * port)} g`} />
                <Pill label={`${t('Karbo')} ${Math.round(f.c * port)} g`} />
              </View>
              <Small style={{ marginTop: 10 }}>{t('Nama makanan ditebak dari foto dan kamu yang memastikan. Angka diambil dari tabel komposisi pangan, lalu dikali porsimu.')}</Small>
            </Card>
            <Small style={{ marginTop: 10 }}>{t('Perkiraan, bukan saran medis.')}</Small>
            <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
              <Btn title={t('Simpan ke Makan siang')} small onPress={() => go(5)} />
            </View>
          </>
        );
      case 5:
        return (
          <>
            <Small>{t('Hari ini')}</Small>
            <Text style={st.title}>{t('Tracking kalori')}</Text>
            <Card style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ring eaten={k} target={DAILY_TARGET} size={100} />
              <View>
                <Small>{t('Masuk (kalori)')}</Small>
                <Text style={{ fontWeight: '700', color: C.ink }}>{k} {t('kkal')}</Text>
                <Small style={{ marginTop: 6 }}>{t('Target')}</Small>
                <Text style={{ fontWeight: '700', color: C.ink }}>{num(DAILY_TARGET)} {t('kkal')}</Text>
              </View>
            </Card>
            <Card style={{ marginTop: 10, padding: 12, gap: 8 }}>
              <MacroBar name={t('Protein')} v={Math.round(f.p * port)} max={80} color={C.acc} bg={C.soft} />
              <MacroBar name={t('Lemak')} v={Math.round(f.l * port)} max={60} color={C.orange} bg={C.amber} />
              <MacroBar name={t('Karbo')} v={Math.round(f.c * port)} max={220} color={C.blue} bg={C.blueSoft} />
            </Card>
          </>
        );
      case 6:
        return (
          <>
            <Small>{t('Minggu ini')}</Small>
            <Text style={st.title}>{t('Laporan mingguan')}</Text>
            <Card style={{ padding: 12 }}>
              <Small>{t('Rata-rata harian')}</Small>
              <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{num(1760)} {t('kkal')}</Text>
              <WeekBars values={[1650, 1900, 1720, 1580, 1840, 2100, 1470]} labels={['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => t(d))} target={1800} max={2200} />
            </Card>
            <Card style={{ marginTop: 10, padding: 12 }}>
              <Text style={{ fontSize: 12.5, lineHeight: 19, color: C.ink }}>
                <Text style={{ fontWeight: '700', color: C.accDark }}>{t('Pola:')} </Text>
                {t('kalori tertinggi di akhir pekan. Coba tantangan di komunitas.')}
              </Text>
            </Card>
          </>
        );
      default:
        return (
          <View style={{ flex: 1, paddingTop: 6 }}>
            <Pill label={t('Tracking kalori · Premium')} />
            <Text style={{ marginTop: 12, marginBottom: 4, fontSize: 22, lineHeight: 27, fontWeight: '800', color: C.ink }}>{t('Catat makan tanpa repot mengetik')}</Text>
            <Benefits items={[[t('Catat lewat foto')], [t('Target dan ringkasan harian')], [t('Laporan mingguan')]]} />
            <Card style={{ padding: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: C.acc }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{t('Tahunan')}</Text>
                <Small>{t(PRICE_MONTH_EQ)}</Small>
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{PRICE_YEAR}</Text>
            </Card>
            <View style={{ flex: 1 }} />
            <Btn
              title={t('Saya tertarik')}
              onPress={cta}
            />
            <LinkBtn
              title={t('Tonton lagi')}
              onPress={() => {
                setSel(-1);
                setPort(1);
                go(0);
              }}
            />
            <Small style={{ textAlign: 'center', marginBottom: 12 }}>{t('Tampilan dan harga contoh. Fitur belum tersedia.')}</Small>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.camera }} accessibilityViewIsModal>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingTop: 6 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
          {STEPS.map((sx, j) => (
            <Pressable key={j} accessibilityRole="button" accessibilityLabel={`${t('Langkah {n}', { n: j + 1 })}: ${t(sx.t)}`} onPress={() => go(j)} style={{ flex: 1, height: 44, justifyContent: 'center' }}>
              <View style={st.seg}>
                <AView style={[st.segFill, { width: j < i ? '100%' : j === i ? fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%' }]} />
              </View>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={paused ? t('Putar') : t('Jeda')} onPress={() => setPaused((p) => !p)} style={st.tb}>
          <Icon name={paused ? 'play' : 'pause'} size={20} color="#fff" stroke={2} fill={paused ? '#fff' : 'none'} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Tutup video')} onPress={() => router.back()} style={st.tb}>
          <Icon name="close" size={22} color="#fff" stroke={2} />
        </Pressable>
      </View>
      <View style={st.tv}>{body()}</View>
      <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, gap: 6 }}>
        <Text style={{ fontSize: 17, lineHeight: 21, fontWeight: '700', color: '#fff' }}>{t(step.t)}</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: '#C5D4CA' }}>{t(step.p)}</Text>
        <Pressable accessibilityRole="button" onPress={() => (i < STEPS.length - 1 ? go(i + 1) : router.back())} style={st.nx}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{i < STEPS.length - 1 ? t('Lewati') : t('Tutup')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  seg: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  segFill: { height: 4, backgroundColor: '#4CC196' },
  tb: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tv: { flex: 1, marginHorizontal: 10, marginTop: 2, borderRadius: 20, backgroundColor: C.bg, overflow: 'hidden', paddingHorizontal: 14, paddingTop: 18 },
  title: { fontSize: 19, fontWeight: '800', color: C.ink, marginTop: 1, marginBottom: 10 },
  shut: { width: 70, height: 70, borderRadius: 35, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  focus: { position: 'absolute', left: '12%', right: '12%', top: '16%', bottom: '24%' },
  corner: { position: 'absolute', width: 34, height: 34, borderWidth: 4, borderColor: '#F5B82E', borderRadius: 6 },
  hint: { position: 'absolute', top: 14, alignSelf: 'center', backgroundColor: 'rgba(15,42,31,0.75)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14 },
  scanBox: { width: 210, height: 210, borderRadius: 24, overflow: 'hidden', borderWidth: 3, borderColor: '#fff' },
  scanLine: { position: 'absolute', left: 0, right: 0, top: 0, height: 4, backgroundColor: '#F5B82E', shadowColor: '#F5B82E', shadowOpacity: 0.9, shadowRadius: 8 },
  tag: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1.5, borderColor: '#F5B82E' },
  tagTxt: { fontSize: 11, fontWeight: '800', color: '#11261C' },
  nx: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
