import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { mutateAll } from '../lib/query';
import type { Post } from '../lib/types';
import { api, fileUrl } from '../services/api';
import { t } from '../i18n';
import { ago, toast, toastError } from '../store';
import { C, R, TOPIC_EMOJI, TOPIC_TINT, foodEmoji, shadow } from '../theme';
import { Icon } from './Icon';
import { PostVideo } from './PostVideo';
import { Text } from './Text';
import { Avatar, Grad, Tap } from './ui';

/** Perbarui satu postingan di semua daftar yang sedang di-cache. */
export function patchPost(p: Post) {
  mutateAll<{ posts?: Post[]; post?: Post }>('/api/posts', (d) => ({
    ...d,
    ...(d.posts ? { posts: d.posts.map((x) => (x.id === p.id ? p : x)) } : {}),
    ...(d.post && d.post.id === p.id ? { post: p } : {}),
  }));
}

const KIND_STYLE = {
  Tanya: { bg: '#FFF2CF', fg: '#6B4A00', label: 'Tanya' },
  Resep: { bg: '#E8E4FB', fg: '#3F3290', label: 'Resep' },
} as const;

// Di beranda teks dipotong; selengkapnya dibaca di layar detail.
const PREVIEW_LINES = 4;
const LONG_TEXT = 180;

/**
 * Kartu postingan. `full` = tampilan di layar detail: teks utuh, kartu tidak membuka detail lagi,
 * dan tombol komentar memanggil onComment (misalnya memfokuskan kolom tanggapan).
 */
export function PostCard({ p, full, onComment }: { p: Post; full?: boolean; onComment?: () => void }) {
  const open = () => router.push({ pathname: '/post/[id]', params: { id: String(p.id) } });
  const long = !full && (p.text.length > LONG_TEXT || p.text.split('\n').length > PREVIEW_LINES);
  const wrap = (children: ReactNode) =>
    full ? (
      <View>{children}</View>
    ) : (
      <Tap accessibilityRole="button" accessibilityLabel={t('Buka postingan {name}', { name: p.food?.label ?? t(p.topic) })} onPress={open} scale={0.985}>
        {children}
      </Tap>
    );
  const photo = fileUrl(p.photo);
  const tint = TOPIC_TINT[p.topic] ?? ['#E1F3E9', '#BFE0CF'];
  const kind = p.kind !== 'Bagikan' ? KIND_STYLE[p.kind] : null;

  const toggle = async (what: 'like' | 'save') => {
    const optimistic = what === 'like' ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : { ...p, saved: !p.saved };
    patchPost(optimistic);
    if (what === 'save') toast(p.saved ? t('Dihapus dari simpanan') : t('Postingan disimpan'));
    try {
      const r = await api.post<{ post: Post }>(`/api/posts/${p.id}/${what}`);
      patchPost(r.post);
    } catch (e) {
      patchPost(p);
      toastError(e);
    }
  };

  return (
    <View style={st.card}>
      <View style={st.head}>
        {p.author.bot ? (
          <Grad from={C.accBright} to={C.acc} style={st.botAv}>
            <Icon name="spark" size={18} color="#fff" stroke={2} />
          </Grad>
        ) : (
          <Avatar ini={p.author.initials} uri={p.author.avatar} tone={p.mine ? 'me' : p.author.tone ?? 'green'} size={40} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '800', color: C.ink, flexShrink: 1 }} numberOfLines={1}>
              {p.mine ? t('Kamu') : p.author.name}
            </Text>
            {p.author.bot && (
              <View style={st.botTag}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: C.accDark }}>{p.ai ? 'AI' : t('Tips')}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 12, color: C.muted, fontWeight: '500' }} numberOfLines={1}>
            <Text style={{ fontSize: 12, color: C.accDark, fontWeight: '700' }}>
              {TOPIC_EMOJI[p.topic] ?? '🍽️'} {t(p.topic)}
            </Text>
            {` · ${ago(p.createdAt)}`}
          </Text>
        </View>
        {kind && (
          <View style={[st.kind, { backgroundColor: kind.bg }]}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: kind.fg }}>{t(kind.label)}</Text>
          </View>
        )}
      </View>

      {/* Video punya kontrol sendiri, jadi tidak dibungkus tombol pembuka detail. */}
      {p.video && <PostVideo uri={p.video} />}
      {wrap(
        <>
          {p.video ? null : photo ? (
            <View style={st.photo}>
              <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            </View>
          ) : (
            <Grad from={tint[0]} to={tint[1]} style={st.banner}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.2 }} numberOfLines={2}>
                  {p.food?.label || (p.kind === 'Tanya' ? t('Pertanyaan untuk komunitas') : t(p.topic))}
                </Text>
              </View>
              <View style={st.emojiBubble}>
                <Text style={{ fontSize: 34 }}>{p.food?.id ? foodEmoji(p.food.name, p.food.category) : TOPIC_EMOJI[p.topic] || '🍽️'}</Text>
              </View>
            </Grad>
          )}
          <Text style={[st.txt, full && { fontSize: 15.5, lineHeight: 24 }]} numberOfLines={full ? undefined : PREVIEW_LINES} selectable={full}>
            {p.text}
          </Text>
          {long && <Text style={st.more}>{t('Selengkapnya')}</Text>}
        </>,
      )}

      {p.food?.id && (
        <Tap accessibilityRole="button" accessibilityLabel={t('Lihat info gizi {name}', { name: p.food.name ?? p.food.label })} onPress={() => router.push({ pathname: '/food/[id]', params: { id: p.food!.id! } })} style={st.foodChip}>
          <Icon name="bowl" size={15} color={C.accDark} stroke={2.2} />
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.accDark }}>{t('Info gizi {name}', { name: p.food.name ?? p.food.label })}</Text>
          <Icon name="chev" size={13} color={C.accDark} stroke={2.4} />
        </Tap>
      )}

      <View style={st.acts}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Suka')} accessibilityState={{ selected: p.liked }} onPress={() => toggle('like')} style={[st.act, p.liked && { backgroundColor: '#FDECEC' }]}>
          <Icon name="heart" size={19} color={p.liked ? C.heart : C.muted} fill={p.liked ? C.heart : 'none'} stroke={2} />
          <Text style={[st.actTxt, p.liked && { color: C.heart }]}>{p.likes}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Tanggapan, {n}', { n: p.comments })} onPress={full ? onComment : open} style={st.act}>
          <Icon name="msg" size={19} color={C.muted} stroke={2} />
          <Text style={st.actTxt}>{p.comments}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={t('Simpan')} accessibilityState={{ selected: p.saved }} onPress={() => toggle('save')} style={[st.act, p.saved && { backgroundColor: C.soft }]}>
          <Icon name="book" size={19} color={p.saved ? C.acc : C.muted} fill={p.saved ? C.acc : 'none'} stroke={2} />
          <Text style={[st.actTxt, p.saved && { color: C.acc }]}>{p.saved ? t('Tersimpan') : t('Simpan')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: R.card, padding: 12, ...shadow(1) },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2, paddingBottom: 10 },
  botAv: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  botTag: { backgroundColor: C.soft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  kind: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  photo: { height: 190, borderRadius: R.tile, overflow: 'hidden', backgroundColor: C.soft, justifyContent: 'flex-end', padding: 10 },
  banner: { borderRadius: R.tile, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 104 },
  emojiBubble: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  txt: { paddingHorizontal: 4, paddingTop: 12, fontSize: 14.5, lineHeight: 22, color: C.ink },
  more: { paddingHorizontal: 4, paddingTop: 2, fontSize: 13.5, fontWeight: '700', color: C.acc },
  foodChip: { marginHorizontal: 4, marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.soft, borderRadius: 12, paddingHorizontal: 10, minHeight: 34 },
  acts: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.lineSoft },
  act: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 10, borderRadius: 20 },
  actTxt: { fontSize: 13, fontWeight: '700', color: C.muted },
});
