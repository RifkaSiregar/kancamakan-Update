import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PostCard } from '../components/PostCard';
import { Empty, IconBtn, QueryState, s } from '../components/ui';
import { useQuery } from '../lib/query';
import type { Post } from '../lib/types';
import { t, useT } from '../i18n';
import { C } from '../theme';

/** Daftar postinganku atau postingan tersimpan. */
export default function MyPosts() {
  useT();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const saved = type === 'saved';
  const q = useQuery<{ posts: Post[] }>(`/api/posts?${saved ? 'saved' : 'mine'}=1&limit=50`);
  return (
    <SafeAreaView style={s.screen}>
      <View style={[s.bar, { justifyContent: 'space-between' }]}>
        <IconBtn name="back" label={t('Kembali')} size={20} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{saved ? t('Tersimpan') : t('Postinganku')}</Text>
        <View style={{ width: 44 }} />
      </View>
      <FlatList
        data={q.data?.posts ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => <PostCard p={item} />}
        refreshing={false}
        onRefresh={q.refresh}
        ListEmptyComponent={
          <QueryState
            loading={q.loading}
            error={q.error}
            onRetry={q.refresh}
            empty={saved ? <Empty title={t('Belum ada yang disimpan')} body={t('Ketuk Simpan di postingan untuk menyimpannya di sini.')} /> : <Empty title={t('Belum ada postingan')} body={t('Bagikan makananmu ke komunitas.')} action={{ label: t('Buat postingan'), onPress: () => router.push('/compose') }} />}
          />
        }
      />
    </SafeAreaView>
  );
}
