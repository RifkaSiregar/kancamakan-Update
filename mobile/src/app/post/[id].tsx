import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type TextInputInstance } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { PostCard } from '../../components/PostCard';
import { Sheet, SheetOpt } from '../../components/Sheet';
import { Avatar, Card, Empty, IconBtn, QueryState, Small, s } from '../../components/ui';
import { FEEDS, invalidate, useQuery } from '../../lib/query';
import type { Comment, Post } from '../../lib/types';
import { api } from '../../services/api';
import { ago, toast, toastError } from '../../store';
import { t, useT } from '../../i18n';
import { C } from '../../theme';

const REPORT_REASONS = ['Spam atau promosi', 'Saran diet berbahaya', 'Kasar atau menghina', 'Informasi kesehatan menyesatkan', 'Lainnya'];

/** Detail postingan: postingan utuh, daftar tanggapan beserta jumlahnya, dan menu titik tiga (laporkan / blokir / hapus). */
export default function PostDetail() {
  useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const key = `/api/posts/${id}`;
  const q = useQuery<{ post: Post; comments: Comment[] }>(key);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false); // langkah kedua menu: pilih alasan laporan
  const input = useRef<TextInputInstance>(null);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [ideaBusy, setIdeaBusy] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  const post = q.data?.post;
  const comments = q.data?.comments ?? [];

  if (!post) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.bar}>
          <IconBtn name="back" label={t('Kembali')} size={20} onPress={back} />
        </View>
        <QueryState loading={q.loading} error={q.error} onRetry={q.refresh} empty={<Empty title={t('Postingan tidak ditemukan')} body={t('Mungkin sudah dihapus.')} />} />
      </SafeAreaView>
    );
  }

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api.post(`/api/posts/${post.id}/comments`, { text: body });
      setText('');
      setIdeas([]);
      await q.refresh();
      invalidate(FEEDS);
      toast(t('Tanggapan terkirim'));
    } catch (e) {
      toastError(e);
    } finally {
      setSending(false);
    }
  };

  const loadIdeas = async () => {
    setIdeaBusy(true);
    try {
      const r = await api.post<{ replies: string[] }>('/api/ai/replies', { postId: post.id }, 45000);
      setIdeas(r.replies);
    } catch (e) {
      toastError(e, t('Gagal memuat saran'));
    } finally {
      setIdeaBusy(false);
    }
  };

  const closeMenu = () => {
    setMenu(false);
    setReporting(false);
  };

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    closeMenu();
    try {
      await fn();
      invalidate(FEEDS);
      toast(msg);
      back();
    } catch (e) {
      toastError(e);
    }
  };

  const delComment = async (c: Comment) => {
    try {
      await api.del(`/api/comments/${c.id}`);
      await q.refresh();
      toast(t('Tanggapan dihapus'));
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.bar, { justifyContent: 'space-between' }]}>
          <IconBtn name="back" label={t('Kembali')} size={20} onPress={back} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{t('Postingan')}</Text>
          <IconBtn name="dots" label={post.mine ? t('Opsi postingan') : t('Laporkan postingan')} size={20} onPress={() => setMenu(true)} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: 18, paddingBottom: 12 }}>
            <PostCard p={post} full onComment={() => input.current?.focus()} />
          </View>
          <View style={st.cHead} accessibilityRole="header">
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.2 }}>{t('Tanggapan')}</Text>
            <View style={st.count}>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.accDark }}>{comments.length}</Text>
            </View>
          </View>
          {comments.length ? (
            comments.map((c) => (
              <Card key={c.id} style={st.cmt}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Avatar ini={c.author.initials} uri={c.author.avatar} tone={c.mine ? 'me' : 'green'} size={26} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{c.mine ? t('Kamu') : c.author.name}</Text>
                  <Small>{ago(c.createdAt)}</Small>
                  {c.mine && (
                    <Pressable accessibilityRole="button" accessibilityLabel={t('Hapus tanggapan')} onPress={() => delComment(c)} style={{ marginLeft: 'auto', padding: 6 }}>
                      <Icon name="close" size={14} color={C.muted} />
                    </Pressable>
                  )}
                </View>
                <Text style={{ marginTop: 4, fontSize: 13.5, lineHeight: 20, color: C.ink }}>{c.text}</Text>
              </Card>
            ))
          ) : (
            <Empty title={t('Belum ada tanggapan')} body={t('Mulai percakapan dengan satu kalimat.')} />
          )}
        </ScrollView>
        {ideas.length > 0 && (
          <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={st.ideas} accessibilityLabel={t('Saran tanggapan dari AI')}>
            {ideas.map((x) => (
              <Pressable key={x} accessibilityRole="button" onPress={() => setText(x)} style={st.idea}>
                <Text style={{ fontSize: 13, color: C.ink }} numberOfLines={2}>
                  {x}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <View style={st.cbox}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Saran tanggapan dari AI')} onPress={loadIdeas} disabled={ideaBusy} style={st.spark}>
            {ideaBusy ? <ActivityIndicator size="small" color={C.ink} /> : <Icon name="spark" size={20} color={C.ink} stroke={2.2} />}
          </Pressable>
          <TextInput ref={input} value={text} onChangeText={setText} placeholder={t('Tulis tanggapan')} accessibilityLabel={t('Tulis tanggapan')} maxLength={200} onSubmitEditing={send} returnKeyType="send" style={st.input} />
          <Pressable accessibilityRole="button" disabled={!text.trim() || sending} onPress={send} style={[st.send, (!text.trim() || sending) && { backgroundColor: C.disabled }]}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('Kirim')}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Sheet
        visible={menu}
        onClose={closeMenu}
        title={reporting ? t('Kenapa kamu melaporkan ini?') : t('Postingan ini')}
        body={post.mine ? t('Postingan milikmu.') : reporting ? t('Laporan bersifat anonim dan ditinjau tim KancaMakan. Postingan yang dilaporkan banyak orang disembunyikan otomatis.') : undefined}
      >
        {post.mine ? (
          <SheetOpt label={t('Hapus postingan')} danger onPress={() => act(() => api.del(`/api/posts/${post.id}`), t('Postingan dihapus'))} />
        ) : reporting ? (
          REPORT_REASONS.map((r) => <SheetOpt key={r} label={t(r)} onPress={() => act(() => api.post(`/api/posts/${post.id}/report`, { reason: r }), t('Terima kasih. Laporanmu kami tinjau.'))} />)
        ) : (
          <>
            <SheetOpt label={t('Laporkan postingan')} danger onPress={() => setReporting(true)} />
            {!post.author.bot && <SheetOpt label={t('Blokir {name}', { name: post.author.name })} onPress={() => act(() => api.post(`/api/users/${post.author.id}/block`), t('{name} diblokir', { name: post.author.name }))} />}
          </>
        )}
        <SheetOpt label={reporting ? t('Kembali') : t('Batal')} muted onPress={() => (reporting ? setReporting(false) : closeMenu())} />
      </Sheet>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  cHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 },
  count: { minWidth: 26, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  cmt: { paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 18, marginBottom: 8 },
  ideas: { gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
  idea: { maxWidth: 250, minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: C.amber },
  spark: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.kunyit, alignItems: 'center', justifyContent: 'center' },
  cbox: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, paddingHorizontal: 14, fontSize: 14, color: C.ink },
  send: { height: 44, minWidth: 70, alignItems: 'center', paddingHorizontal: 18, borderRadius: 22, backgroundColor: C.acc, justifyContent: 'center' },
});
