import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Progress } from '../components/Progress';
import { Benefits, Btn, Card, Empty, Grad, IconBtn, LinkBtn, Pill, QueryState, Small, s } from '../components/ui';
import { mutate, useQuery } from '../lib/query';
import type { ContentItem, Plan } from '../lib/types';
import { api } from '../services/api';
import { t, useT } from '../i18n';
import { toast, toastError } from '../store';
import { C, R, foodEmoji, shadow } from '../theme';

type PlanRes = { plan: Plan | null; days: number[] };

/** Rencana Sehatku: hasil agent onboarding, tersimpan di server. Modul Premium hanya pratinjau (belum tersedia). */
export default function PlanScreen() {
  useT();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const onboarding = from === 'onboarding';
  const q = useQuery<PlanRes>('/api/plan');
  const lib = useQuery<{ content: ContentItem[] }>('/api/content');
  const plan = q.data?.plan;
  const days = q.data?.days ?? [];

  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  if (!plan) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.bar}>
          <IconBtn name="back" label={t('Kembali')} size={20} onPress={back} />
        </View>
        <QueryState
          loading={q.loading}
          error={q.error}
          onRetry={q.refresh}
          empty={<Empty title={t('Belum ada rencana')} body={t('Ceritakan dirimu dalam satu kalimat, agent akan menyusunnya.')} action={{ label: t('Buat Rencana Sehatku'), onPress: () => router.replace({ pathname: '/onboarding/agent', params: { again: '1' } }) }} />}
        />
      </SafeAreaView>
    );
  }

  const done = days.length;
  const nextDay = plan.challenge.days.findIndex((_, i) => !days.includes(i));

  const toggleDay = async (i: number) => {
    const on = days.includes(i);
    const next = on ? days.filter((x) => x !== i) : [...days, i];
    mutate<PlanRes>('/api/plan', (d) => ({ ...d, days: next }));
    if (!on && next.length === 7) toast(t('Tantangan selesai! Bagikan ceritamu ke komunitas 🎉'));
    try {
      await api.put('/api/plan/days', { days: next });
    } catch (e) {
      mutate<PlanRes>('/api/plan', (d) => ({ ...d, days }));
      toastError(e);
    }
  };

  const enter = () => {
    router.dismissAll();
    router.replace('/home');
    toast(t('Selamat datang! Tantangan pertamamu sudah siap.'));
  };

  const content = (id: string) => lib.data?.content.find((c) => c.id === id);

  return (
    <SafeAreaView style={s.screen}>
      <View style={[s.bar, { justifyContent: 'space-between' }]}>
        <IconBtn name="back" label={onboarding ? t('Ubah cerita') : t('Kembali')} size={20} onPress={back} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{t('Rencana Sehatku')}</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: onboarding ? 110 : 28, gap: 12 }}>
        {onboarding && <Progress step={3} total={3} />}

        <Grad from="#178A60" to="#0B5139" style={st.hero}>
          <View style={st.blob} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="spark" size={14} color="#8FD3B5" stroke={2} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#BFEBD3' }}>{plan.ai ? t('Disusun agent AI') : t('Disusun dari database KancaMakan')}</Text>
          </View>
          <Text style={{ marginTop: 8, fontSize: 15, lineHeight: 22, color: '#fff' }}>{plan.summary}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            <View style={st.tag}>
              <Text style={st.tagTxt}>🎯 {t(plan.goal)}</Text>
            </View>
            {plan.topics.map((v) => (
              <View key={v} style={st.tag}>
                <Text style={st.tagTxt}>{t(v)}</Text>
              </View>
            ))}
          </View>
        </Grad>

        {plan.care && (
          <Card style={{ padding: 14, backgroundColor: C.amber, borderColor: '#F1DDB5' }}>
            <Text style={{ fontWeight: '700', color: C.amberInk }}>{t('Kamu tidak sendiri')}</Text>
            <Text style={{ marginTop: 4, fontSize: 13.5, lineHeight: 20, color: C.amberInk }}>
              {t('Kalau pikiran tentang makan atau berat badan terasa berat, bicara dengan dokter, psikolog, atau orang yang kamu percaya bisa sangat membantu. Rencana ini fokus pada makan teratur, bukan menurunkan berat badan.')}
            </Text>
          </Card>
        )}

        <Card style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pill label={t('Tantangan 7 hari')} />
            <Text style={{ fontWeight: '700', color: C.accDark }}>{done}/7</Text>
          </View>
          <Text style={{ marginTop: 8, fontSize: 17, fontWeight: '700', color: C.ink }}>{plan.challenge.title}</Text>
          <View style={st.track}>
            <View style={[st.fill, { width: `${(done / 7) * 100}%` }]} />
          </View>
          <View style={{ marginTop: 6 }}>
            {plan.challenge.days.map((d, i) => {
              const on = days.includes(i);
              return (
                <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${t('Hari {n}', { n: i + 1 })}: ${d}`} onPress={() => toggleDay(i)} style={[st.day, i > 0 && { borderTopWidth: 1, borderTopColor: C.lineSoft }]}>
                  <View style={[st.box, on && { backgroundColor: C.acc, borderColor: C.acc }]}>{on && <Icon name="check" size={13} color="#fff" stroke={3.2} />}</View>
                  <View style={{ flex: 1 }}>
                    <Small style={{ fontWeight: '700', color: i === nextDay ? C.acc : C.muted }}>{i === nextDay ? t('Hari {n} · berikutnya', { n: i + 1 }) : t('Hari {n}', { n: i + 1 })}</Small>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: C.ink, textDecorationLine: on ? 'line-through' : 'none', opacity: on ? 0.6 : 1 }}>{d}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {plan.meals.length > 0 && (
          <Card style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={st.h}>{t('Ide menu untukmu')}</Text>
            {plan.meals.map((m, i) => (
              <Pressable
                key={`${m.meal}-${i}`}
                disabled={!m.food_id}
                accessibilityRole={m.food_id ? 'button' : undefined}
                onPress={() => m.food_id && router.push({ pathname: '/food/[id]', params: { id: m.food_id } })}
                style={[st.meal, i > 0 && { borderTopWidth: 1, borderTopColor: C.lineSoft }]}
              >
                <View style={st.mealIcon}>
                  <Text style={{ fontSize: 20 }}>{foodEmoji(m.idea)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>{t(m.meal)}</Text>
                  <Text style={{ fontSize: 14.5, lineHeight: 20, color: C.ink, fontWeight: '600' }}>{m.idea}</Text>
                </View>
                {m.food_id && <Icon name="chev" size={16} color={C.muted} />}
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" accessibilityLabel={t('Rencana menu 7 hari, fitur Premium')} onPress={() => router.push('/promo')} style={st.lock}>
              <Text style={{ fontSize: 15 }}>🔒</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{t('Rencana menu 7 hari + daftar belanja')}</Text>
                <Small>{t('Premium · segera hadir')}</Small>
              </View>
              <Icon name="chev" size={16} color={C.muted} />
            </Pressable>
          </Card>
        )}

        <Text style={[st.h, { marginTop: 4, marginBottom: 0 }]}>{t('Bacaan & video pilihan')}</Text>
        {plan.picks.map((id) => {
          const c = content(id);
          if (!c) return null;
          return (
            <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${t('Buka')} ${c.title}`} onPress={() => router.push({ pathname: '/content/[id]', params: { id } })}>
              <Card style={{ flexDirection: 'row', overflow: 'hidden' }}>
                <Grad from={c.g[0]} to={c.g[1]} style={st.thumb}>
                  {c.type === 'video' && (
                    <View style={st.play}>
                      <Icon name="play" size={12} color={C.dark} fill={C.dark} stroke={2} />
                    </View>
                  )}
                </Grad>
                <View style={{ flex: 1, padding: 12 }}>
                  <Small style={{ fontWeight: '700', color: C.acc }}>
                    {c.type === 'video' ? t('Video') : t('Artikel')} · {t('{n} mnt', { n: c.minutes })}
                  </Small>
                  <Text style={{ fontSize: 14, fontWeight: '700', lineHeight: 19, color: C.ink }} numberOfLines={2}>
                    {c.title}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
        })}

        <Card style={{ padding: 16, borderColor: C.acc, borderWidth: 1.5 }}>
          <Pill label={t('Premium · segera hadir')} tone="a" />
          <Text style={{ marginTop: 8, fontSize: 16, fontWeight: '700', color: C.ink }}>{t('Jalankan rencanamu lebih mudah')}</Text>
          <Benefits
            items={[
              [t('Catat makan cukup dari foto'), t('Lihat apakah rencanamu berjalan')],
              [t('Rencana menu 7 hari + daftar belanja'), t('Disesuaikan dengan ceritamu')],
              [t('Laporan mingguan'), t('Pola makanmu dari waktu ke waktu')],
            ]}
          />
          <Btn title={t('Lihat demo Premium')} variant="secondary" small onPress={() => router.push('/promo')} />
        </Card>

        {!onboarding && <LinkBtn title={t('Buat ulang rencana')} onPress={() => router.push({ pathname: '/onboarding/agent', params: { again: '1' } })} />}
      </ScrollView>

      {onboarding && (
        <View style={st.cta}>
          <Btn title={t('Masuk ke komunitas')} onPress={enter} />
          <Small style={{ textAlign: 'center', marginTop: 6 }}>{t('Rencana tersimpan di akunmu. Komunitas gratis.')}</Small>
        </View>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  hero: { borderRadius: R.hero, padding: 18, overflow: 'hidden', ...shadow(3) },
  blob: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(245,184,46,0.14)', top: -80, right: -60 },
  tag: { backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  h: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 2 },
  track: { height: 8, borderRadius: 4, backgroundColor: C.soft, marginTop: 10, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: C.acc },
  day: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.dashed, alignItems: 'center', justifyContent: 'center' },
  mealIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' },
  meal: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  lock: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: C.bg, borderWidth: 1, borderStyle: 'dashed', borderColor: C.dashed },
  thumb: { width: 84, alignItems: 'center', justifyContent: 'center' },
  play: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18, backgroundColor: 'rgba(244,247,245,0.97)', borderTopWidth: 1, borderTopColor: C.line },
});
