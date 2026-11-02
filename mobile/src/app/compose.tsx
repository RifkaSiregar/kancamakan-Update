import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Sheet, SheetOpt } from '../components/Sheet';
import { PostVideo } from '../components/PostVideo';
import { Btn, Chip, IconBtn, Small, s } from '../components/ui';
import { TOPICS } from '../data/sample';
import { FEEDS, invalidate, useQuery } from '../lib/query';
import type { Food } from '../lib/types';
import { api, qs } from '../services/api';
import { foodName, t, useT } from '../i18n';
import { toast, toastError } from '../store';
import { C, TOPIC_EMOJI, foodEmoji, shadow } from '../theme';

/** Lampiran opsional: satu foto ATAU satu video. */
type Media = { kind: 'photo'; uri: string; base64: string; type: string } | { kind: 'video'; uri: string; type: string };

const VIDEO_MAX_SEC = 30;
const VIDEO_MAX_BYTES = 4 * 1024 * 1024; // sama dengan batas di backend
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

/** Buat postingan: teks, topik (wajib), foto atau video (opsional), tag makanan (opsional). */
export default function Compose() {
  useT();
  const params = useLocalSearchParams<{ foodId?: string; foodLabel?: string; topic?: string }>();
  const [text, setText] = useState('');
  // Topik wajib dipilih sendiri; hanya terisi otomatis bila dibuka dari halaman bertopik (misalnya artikel).
  const [topic, setTopic] = useState<string | null>(params.topic && TOPICS.includes(params.topic) ? params.topic : null);
  const [media, setMedia] = useState<Media | null>(null);
  const [food, setFood] = useState<{ id: string | null; label: string } | null>(params.foodId || params.foodLabel ? { id: params.foodId ?? null, label: (params.foodLabel ?? '').slice(0, 40) } : null);
  const [pickMenu, setPickMenu] = useState(false);
  const [foodSheet, setFoodSheet] = useState(false);
  const [fq, setFq] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const foods = useQuery<{ foods: Food[] }>(foodSheet ? `/api/foods${qs({ q: fq.trim(), limit: 30 })}` : null);
  const ok = text.trim().length >= 3 && !!topic;
  const MIN_AI = 8;
  const canAi = text.trim().length >= MIN_AI && !aiBusy;

  const pick = async (camera: boolean, video = false) => {
    setPickMenu(false);
    await new Promise((r) => setTimeout(r, 350)); // tunggu sheet tertutup (iOS tidak bisa membuka 2 modal sekaligus)
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast(camera ? t('Izin kamera ditolak. Aktifkan di pengaturan.') : t('Izin galeri ditolak. Aktifkan di pengaturan.'));
    const opts: ImagePicker.ImagePickerOptions = video
      ? { mediaTypes: ['videos'], videoMaxDuration: VIDEO_MAX_SEC, videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium, allowsEditing: true }
      : { mediaTypes: ['images'], quality: 0.5, allowsEditing: true, aspect: [4, 3], base64: true };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = r.canceled ? null : r.assets[0];
    if (!a) return;
    if (video) {
      if (a.duration && a.duration > (VIDEO_MAX_SEC + 1) * 1000) return toast(t('Video maksimal {n} detik. Potong dulu videonya.', { n: VIDEO_MAX_SEC }));
      if (a.fileSize && a.fileSize > VIDEO_MAX_BYTES) return toast(t('Video terlalu besar (maks 4 MB). Pilih video yang lebih pendek.'));
      const type = a.mimeType && VIDEO_TYPES.includes(a.mimeType) ? a.mimeType : a.uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
      return setMedia({ kind: 'video', uri: a.uri, type });
    }
    if (!a.base64) return;
    const type = a.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(a.mimeType) ? a.mimeType : 'image/jpeg';
    if (a.base64.length > 4_000_000) return toast(t('Foto terlalu besar. Pilih foto lain.'));
    setMedia({ kind: 'photo', uri: a.uri, base64: a.base64, type });
  };

  const assist = async () => {
    if (!topic) return toast(t('Pilih topik dulu, supaya AI tahu konteksnya.'));
    const before = text;
    setAiBusy(true);
    try {
      const d = await api.post<{ text: string; food_label: string; food_id: string | null }>('/api/ai/draft', { kind: 'Bagikan', topic, hint: text }, 45000);
      setText(d.text.slice(0, 280));
      if (d.food_id && !food) setFood({ id: d.food_id, label: d.food_label });
      toast(t('Tulisanmu sudah dirapikan. Periksa dulu ya.'), { label: t('Urungkan'), run: () => setText(before) });
    } catch (e) {
      toastError(e, t('AI gagal membuat tulisan'));
    } finally {
      setAiBusy(false);
    }
  };

  const post = async () => {
    if (!topic) return;
    setSending(true);
    try {
      // Video diunggah dulu (data mentah), lalu postingan merujuk ke id unggahannya.
      const videoId = media?.kind === 'video' ? (await api.upload<{ id: string }>('/api/uploads/video', media.uri, media.type)).id : undefined;
      const photo = media?.kind === 'photo' ? media : null;
      await api.post('/api/posts', { topic, text: text.trim(), foodId: food?.id ?? undefined, foodLabel: food?.label ?? '', photo: photo?.base64, photoType: photo?.type, videoId }, 60000);
      invalidate(FEEDS);
      invalidate('/api/me');
      toast(t('Terkirim ke komunitas'));
      router.canGoBack() ? router.back() : router.replace('/home');
    } catch (e) {
      toastError(e, t('Gagal mengirim'));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.bar, { justifyContent: 'space-between' }]}>
          <IconBtn name="close" label={t('Tutup')} size={20} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{t('Postingan baru')}</Text>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
          {media ? (
            <View>
              {media.kind === 'photo' ? (
                <View style={st.photo}>
                  <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} />
                </View>
              ) : (
                <PostVideo uri={media.uri} style={{ marginTop: 12 }} />
              )}
              <Pressable onPress={() => setPickMenu(true)} style={st.change} accessibilityRole="button" accessibilityLabel={media.kind === 'photo' ? t('Ganti atau hapus foto') : t('Ganti atau hapus video')}>
                <Text style={{ fontWeight: '600', fontSize: 13, color: C.ink }}>{t('Ganti')}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setPickMenu(true)} style={st.add}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Icon name="cam" size={28} color={C.acc} />
                <Icon name="play" size={26} color={C.acc} />
              </View>
              <Text style={{ fontWeight: '600', fontSize: 14, color: '#3E4F45' }}>{t('Tambah foto atau video (opsional)')}</Text>
              <Small>{t('Video maksimal {n} detik, 4 MB', { n: VIDEO_MAX_SEC })}</Small>
            </Pressable>
          )}

          <Text style={s.label}>{t('Tulis postinganmu')}</Text>
          <TextInput value={text} onChangeText={setText} editable={!aiBusy} multiline maxLength={280} placeholder={t('Apa yang kamu makan, atau apa yang ingin kamu tanyakan?')} style={[s.field, { minHeight: 110, borderColor: 'transparent', ...shadow(1) }]} accessibilityLabel={t('Isi postingan')} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Rapikan dengan AI')}
              accessibilityState={{ disabled: !canAi, busy: aiBusy }}
              accessibilityHint={canAi ? undefined : t('Tulis minimal {n} huruf dulu', { n: MIN_AI })}
              disabled={!canAi}
              onPress={assist}
              style={[st.ai, !canAi && st.aiOff]}
            >
              {aiBusy ? <ActivityIndicator size="small" color={C.ink} /> : <Icon name="spark" size={16} color={canAi ? C.ink : C.muted} stroke={2.2} />}
              <Text style={{ fontWeight: '800', fontSize: 13, color: canAi || aiBusy ? C.ink : C.muted }}>{aiBusy ? t('AI sedang merapikan…') : t('Rapikan dengan AI')}</Text>
            </Pressable>
            <Small>{text.length}/280</Small>
          </View>
          {!canAi && !aiBusy && <Small style={{ marginTop: 6 }}>{t('Tulis dulu ceritamu dengan kata-katamu sendiri, lalu AI bisa bantu merapikan dan melengkapinya.')}</Small>}

          <Text style={s.label}>{t('Makanan (opsional)')}</Text>
          {/* Baris tag makanan: area utama dan tombol hapus dibuat bersebelahan (tidak bersarang) */}
          <View style={st.foodRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Pilih makanan dari database')} onPress={() => setFoodSheet(true)} style={st.foodMain}>
              {food ? <Text style={{ fontSize: 20 }}>{foodEmoji(food.label)}</Text> : <Icon name="bowl" size={18} color={C.acc} stroke={2} />}
              <Text style={{ flex: 1, fontSize: 14.5, color: food ? C.ink : C.muted, fontWeight: food ? '700' : '400' }} numberOfLines={1}>
                {food ? food.label : t('Tag makanan dari database')}
              </Text>
              {!food && <Icon name="chev" size={16} color={C.muted} />}
            </Pressable>
            {food && (
              <Pressable accessibilityRole="button" accessibilityLabel={t('Hapus tag makanan')} onPress={() => setFood(null)} hitSlop={8} style={st.foodClear}>
                <Icon name="close" size={16} color={C.muted} />
              </Pressable>
            )}
          </View>

          <Text style={{ marginTop: 14, marginBottom: 8, fontSize: 13, fontWeight: '700', color: C.ink }}>
            {t('Topik')} <Text style={{ color: C.red }}>*</Text>
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TOPICS.map((v) => (
              <Chip key={v} label={t(v)} emoji={TOPIC_EMOJI[v]} on={topic === v} onPress={() => setTopic(v)} />
            ))}
          </View>
          <Small style={{ marginTop: 12 }}>{t('Jangan menulis angka berat badan ekstrem atau saran diet berbahaya. Postingan seperti itu akan ditolak atau dihapus. Kamu bisa melaporkan postingan yang melanggar.')}</Small>
        </ScrollView>
        <View style={{ paddingHorizontal: 18, paddingBottom: 16 }}>
          {!ok && <Small style={{ textAlign: 'center', marginBottom: 8 }}>{!topic ? t('Pilih topik postingan dulu.') : t('Tulis minimal 3 huruf.')}</Small>}
          <Btn title={sending && media?.kind === 'video' ? t('Mengunggah video…') : t('Kirim ke komunitas')} disabled={!ok} loading={sending} onPress={post} />
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={pickMenu} onClose={() => setPickMenu(false)} title={t('Tambah foto atau video')} body={t('Pilih salah satu: satu foto atau satu video.')}>
        {Platform.OS !== 'web' && <SheetOpt label={t('Ambil foto')} onPress={() => pick(true)} />}
        <SheetOpt label={t('Pilih foto dari galeri')} onPress={() => pick(false)} />
        {Platform.OS !== 'web' && <SheetOpt label={t('Rekam video')} right={t('maks {n} detik', { n: VIDEO_MAX_SEC })} onPress={() => pick(true, true)} />}
        <SheetOpt label={t('Pilih video dari galeri')} right={t('maks 4 MB')} onPress={() => pick(false, true)} />
        {media && (
          <SheetOpt
            label={media.kind === 'photo' ? t('Hapus foto') : t('Hapus video')}
            danger
            onPress={() => {
              setMedia(null);
              setPickMenu(false);
            }}
          />
        )}
        <SheetOpt label={t('Batal')} muted onPress={() => setPickMenu(false)} />
      </Sheet>

      <Sheet visible={foodSheet} onClose={() => setFoodSheet(false)} title={t('Pilih makanan')}>
        <TextInput value={fq} onChangeText={setFq} placeholder={t('Cari, misalnya tempe')} style={[s.field, { height: 46, marginBottom: 8 }]} autoFocus accessibilityLabel={t('Cari makanan')} />
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          {foods.loading && !foods.data ? <ActivityIndicator color={C.acc} style={{ margin: 16 }} /> : null}
          {(foods.data?.foods ?? []).slice(0, 30).map((f) => (
            <SheetOpt
              key={f.id}
              label={foodName(f)}
              right={f.source === 'KancaMakan' ? t(f.category) : `${f.source} · per 100 g`}
              onPress={() => {
                setFood({ id: f.id, label: foodName(f) });
                setFoodSheet(false);
                setFq('');
              }}
            />
          ))}
          {fq.trim().length > 1 && foods.data && !foods.data.foods.length && (
            <SheetOpt
              label={t('Pakai "{name}" tanpa data gizi', { name: fq.trim() })}
              onPress={() => {
                setFood({ id: null, label: fq.trim().slice(0, 40) });
                setFoodSheet(false);
                setFq('');
              }}
            />
          )}
        </ScrollView>
      </Sheet>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  add: { marginTop: 14, height: 132, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: '#9FD9B4', backgroundColor: '#F4FBF7', alignItems: 'center', justifyContent: 'center', gap: 6 },
  photo: { marginTop: 12, height: 160, borderRadius: 18, overflow: 'hidden', backgroundColor: C.soft },
  ai: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.kunyit, ...shadow(1, '#8A5A00') },
  aiOff: { backgroundColor: '#E6ECE8', shadowOpacity: 0, elevation: 0, boxShadow: 'none' } as never,
  foodRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: 16, backgroundColor: '#fff', ...shadow(1) },
  foodMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14 },
  foodClear: { width: 48, height: 52, alignItems: 'center', justifyContent: 'center' },
  change: { position: 'absolute', right: 8, top: 20, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 22, height: 40, paddingHorizontal: 14, justifyContent: 'center' },
});
