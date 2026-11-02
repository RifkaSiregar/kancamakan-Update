import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { Text } from '../../components/Text';
import { Avatar, Btn, Card, Chip, Grad, QueryState, Seg, Skeleton, Small, s } from '../../components/ui';
import { invalidate, mutate, useQuery } from '../../lib/query';
import type { BoardRow, ChallengeDay, ChallengeItem, ChallengeWeek } from '../../lib/types';
import { api } from '../../services/api';
import { locale, t, useT } from '../../i18n';
import { thisWeek, toast, toastError, todayKey } from '../../store';
import { C, R, T, shadow } from '../../theme';

const CH_EMOJI: Record<string, string> = {
  'sarapan-protein': '🍳',
  'tanpa-minuman-manis': '🥤',
  'tambah-sayur': '🥬',
  'jalan-kaki': '🚶',
  'bekal-sendiri': '🍱',
  'camilan-cerdas': '🍌',
  'protein-nabati': '🫘',
  'warung-seimbang': '🍛',
  'kurangi-gorengan': '🍤',
};
const DOW = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const dayLabel = (d: string) => {
  const x = new Date(`${d}T00:00:00`);
  return `${t(DOW[x.getDay()])}, ${x.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}`;
};

/** Rincian 7 hari: tanggal + aksi harian, dengan status (selesai / hari ini / terlewat / nanti) bila `done` diberikan. */
function DayPlan({ plan, done }: { plan: ChallengeDay[]; done?: string[] }) {
  const today = todayKey();
  return (
    <View>
      {plan.map((p, i) => {
        const ok = done?.includes(p.date);
        const isToday = p.date === today;
        const missed = !!done && !ok && p.date < today;
        return (
          <View key={p.date} style={[st.planRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.lineSoft }, isToday && st.planToday]} accessibilityLabel={`${t('Hari {n}', { n: i + 1 })}, ${dayLabel(p.date)}: ${p.task}${ok ? t(', selesai') : isToday ? t(', hari ini') : missed ? t(', terlewat') : ''}`}>
            <View style={[st.planDot, ok && { backgroundColor: C.acc, borderColor: C.acc }, isToday && !ok && { borderColor: C.acc }]}>
              {ok ? <Icon name="check" size={13} color="#fff" stroke={3.2} /> : <Text style={{ fontSize: 11.5, fontWeight: '800', color: isToday ? C.acc : C.muted }}>{i + 1}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Small style={{ fontWeight: '700', color: isToday ? C.acc : C.muted }}>
                {dayLabel(p.date)}
                {isToday ? t(' · hari ini') : missed ? t(' · terlewat') : ''}
              </Small>
              <Text style={{ fontSize: 14, lineHeight: 20, color: C.ink, opacity: missed ? 0.55 : 1, fontWeight: isToday ? '700' : '500' }}>{p.task}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
const MEDAL = ['🥇', '🥈', '🥉'];
const STATUS: Record<ChallengeItem['status'], string> = { active: 'Sedang berjalan', next: 'Minggu depan', upcoming: 'Akan datang' };

/** "4–10 Nov" dari dua tanggal YYYY-MM-DD. */
const range = (a: string, b: string) => {
  const f = (d: string, month: boolean) => new Date(`${d}T00:00:00`).toLocaleDateString(locale(), month ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
  return a.slice(5, 7) === b.slice(5, 7) ? `${f(a, false)}–${f(b, true)}` : `${f(a, true)} – ${f(b, true)}`;
};

function Rank({ b, border }: { b: BoardRow; border?: boolean }) {
  return (
    <View style={[st.rank, b.me && st.rankMe, border && !b.me && { borderTopWidth: 1, borderTopColor: C.lineSoft }]} accessibilityLabel={t('Peringkat {rank}, {name}, {n} check-in', { rank: b.rank, name: b.me ? t('Kamu') : b.name, n: b.days })}>
      <Text style={{ width: 28, fontSize: b.rank <= 3 ? 20 : 14, fontWeight: '800', color: C.muted, textAlign: 'center' }}>{MEDAL[b.rank - 1] ?? b.rank}</Text>
      <Avatar ini={b.initials} uri={b.avatar} tone={b.me ? 'me' : 'green'} size={34} />
      <Text style={{ flex: 1, fontWeight: b.me ? '800' : '600', color: C.ink, fontSize: 14.5 }} numberOfLines={1}>
        {b.me ? t('Kamu') : b.name}
      </Text>
      <View style={st.daysPill}>
        <Text style={{ fontWeight: '800', color: C.accDark, fontSize: 13 }}>{t('{n} check-in', { n: b.days })}</Text>
      </View>
    </View>
  );
}

export default function Challenges() {
  useT();
  const week = thisWeek();
  const key = `/api/challenges/current?from=${week[0].key}`;
  const q = useQuery<ChallengeWeek>(key);
  const listKey = `/api/challenges?from=${week[0].key}`;
  const list = useQuery<{ challenges: ChallengeItem[] }>(listKey);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<'week' | 'all'>('week');
  const [open, setOpen] = useState<string | null>(null); // tantangan di daftar yang rinciannya sedang dibuka
  const d = q.data;

  const header = (
    <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 6 }}>
      <Text style={{ ...T.h1, color: C.ink }}>{t('Tantangan mingguan')}</Text>
      <Text style={{ ...T.small, color: C.muted, marginTop: 2 }}>{t('Disesuaikan dengan topik & rencanamu · check-in sekali sehari')}</Text>
    </View>
  );

  if (!d) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        {header}
        <QueryState loading={q.loading} error={q.error} onRetry={q.refresh} skeleton={<View style={{ padding: 18, gap: 14 }}><Skeleton style={{ height: 300, borderRadius: R.hero }} /><Skeleton style={{ height: 160, borderRadius: R.card }} /></View>} />
      </SafeAreaView>
    );
  }

  const done = d.days.length;
  const checkedToday = d.days.includes(todayKey());
  // Hari berturut-turut sampai hari ini (atau kemarin bila hari ini belum).
  let streak = 0;
  for (let i = week.findIndex((w) => w.isToday) - (checkedToday ? 0 : 1); i >= 0 && d.days.includes(week[i].key); i--) streak++;

  const checkIn = async () => {
    setBusy(true);
    try {
      await api.post(`/api/challenges/${d.current.id}/checkin`, { day: todayKey() });
      await q.refresh();
      invalidate(listKey);
      toast(t('Check-in tercatat. {n} dari 7 hari 🎉', { n: done + 1 }), { label: t('Bagikan'), run: () => router.push('/compose') });
    } catch (e) {
      toastError(e);
      q.refresh(); // misalnya sudah check-in dari perangkat lain
    } finally {
      setBusy(false);
    }
  };

  const remind = async (id: string) => {
    try {
      const r = await api.post<{ remind: boolean }>(`/api/challenges/${id}/remind`);
      mutate<{ challenges: ChallengeItem[] }>(listKey, (x) => ({ challenges: x.challenges.map((c) => (c.id === id ? { ...c, remind: r.remind } : c)) }));
      toast(r.remind ? t('Kami ingatkan saat tantangan dimulai') : t('Pengingat dimatikan'));
    } catch (e) {
      toastError(e);
    }
  };

  const todayTask = d.current.plan.find((p) => p.date === todayKey())?.task;
  const rows = scope === 'week' ? d.board : d.boardAll;
  const meRow = scope === 'week' ? d.boardMe : d.boardAllMe;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.refresh} />}>
        {header}
        <View style={{ paddingHorizontal: 18, gap: 14, marginTop: 8 }}>
          <Grad from="#178A60" to="#0B5139" style={st.hero}>
            <View style={st.blob} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={st.emoji}>
                <Text style={{ fontSize: 30 }}>{CH_EMOJI[d.current.id] ?? '🏁'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#BFEBD3' }}>{t('Minggu ini · {n} peserta', { n: d.participants })}</Text>
                <Text style={{ fontSize: 21, lineHeight: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>{d.current.title}</Text>
              </View>
            </View>
            <Text style={{ marginTop: 10, fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.85)' }}>{d.current.body}</Text>
            {todayTask ? (
              <View style={st.todayTask}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#BFEBD3' }}>{t('Aksi hari ini')}</Text>
                <Text style={{ fontSize: 15.5, lineHeight: 21, fontWeight: '800', color: '#fff', marginTop: 2 }}>{todayTask}</Text>
              </View>
            ) : null}

            <View style={st.days}>
              {week.map((w) => {
                const c = d.days.includes(w.key);
                return (
                  <View key={w.key} style={{ alignItems: 'center', gap: 6 }} accessibilityLabel={`${w.label}${c ? t(', selesai') : w.isToday ? t(', hari ini') : ''}`}>
                    <View style={[st.day, c && st.dayDone, !c && w.isToday && st.dayToday, w.future && { opacity: 0.5 }]}>
                      {c ? <Icon name="check" size={16} color={C.ink} stroke={3.2} /> : <Text style={{ fontSize: 12, fontWeight: '800', color: w.isToday ? '#fff' : 'rgba(255,255,255,0.7)' }}>{w.key.slice(-2).replace(/^0/, '')}</Text>}
                    </View>
                    <Text style={{ fontSize: 11, color: w.isToday ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: w.isToday ? '800' : '600' }}>{w.label}</Text>
                  </View>
                );
              })}
            </View>

            <View style={st.statsRow}>
              <View style={st.stat}>
                <Text style={st.statNum}>{done}/7</Text>
                <Text style={st.statLbl}>{t('hari selesai')}</Text>
              </View>
              <View style={st.stat}>
                <Text style={st.statNum}>🔥 {streak}</Text>
                <Text style={st.statLbl}>{t('hari beruntun')}</Text>
              </View>
            </View>

            {checkedToday ? (
              <View style={st.doneBox} accessibilityLiveRegion="polite">
                <View style={st.doneIcon}>
                  <Icon name="check" size={16} color={C.ink} stroke={3.2} />
                </View>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: '#fff' }}>{t('Sudah check-in hari ini')}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)' }}>{t('Sampai besok!')}</Text>
              </View>
            ) : (
              <Btn title={t('Check-in hari ini')} variant="kunyit" loading={busy} onPress={checkIn} style={{ marginTop: 16 }} />
            )}
          </Grad>

          <Card style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            <Text style={{ ...T.h2, color: C.ink }}>{t('Rincian 7 hari')}</Text>
            <Small style={{ marginBottom: 4 }}>{range(d.current.plan[0].date, d.current.plan[6].date)} · {t('satu aksi kecil per hari')}</Small>
            <DayPlan plan={d.current.plan} done={d.days} />
          </Card>

          <Card style={{ padding: 16 }}>
            <Text style={{ ...T.h2, color: C.ink, marginBottom: 10 }}>{t('Ranking check-in')}</Text>
            <Seg
              label={t('Periode ranking')}
              value={scope}
              onChange={setScope}
              options={[
                [t('Minggu ini'), 'week'],
                [t('Sepanjang waktu'), 'all'],
              ]}
            />
            <View style={{ marginTop: 8 }}>
              {rows.length ? (
                rows.map((b, i) => <Rank key={`${b.rank}-${b.name}`} b={b} border={i > 0 && !rows[i - 1]?.me} />)
              ) : (
                <Small style={{ marginTop: 6 }}>{scope === 'week' ? t('Belum ada yang check-in minggu ini. Jadilah yang pertama!') : t('Belum ada check-in.')}</Small>
              )}
              {meRow && (
                <>
                  <Text style={{ textAlign: 'center', color: C.muted, fontWeight: '800', marginVertical: 2 }}>⋯</Text>
                  <Rank b={meRow} />
                </>
              )}
            </View>
            <Small style={{ marginTop: 8 }}>{scope === 'week' ? t('Dihitung dari check-in tantangan minggu ini. Seri? Yang lebih dulu mencapai jumlah itu di atas.') : t('Total check-in dari semua tantangan yang pernah kamu ikuti.')}</Small>
          </Card>

          <Text style={{ ...T.h2, color: C.ink, marginTop: 4 }}>{t('Daftar tantangan')}</Text>
          <Small style={{ marginTop: -8 }}>{t('Dipilih otomatis dari topik & Rencana Sehatku-mu, berganti tiap minggu. Ketuk untuk melihat rincian 7 hari.')}</Small>
          {(list.data?.challenges ?? []).map((c) => {
            const active = c.status === 'active';
            return (
              <Card key={c.id} style={[{ padding: 14 }, active && { borderColor: C.acc, borderWidth: 1.5 }]}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === c.id }} accessibilityLabel={`${c.title}, ${open === c.id ? t('tutup rincian 7 hari') : t('lihat rincian 7 hari')}`} onPress={() => setOpen(open === c.id ? null : c.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[st.emoji, { backgroundColor: active ? C.soft : C.amber, width: 48, height: 48 }]}>
                    <Text style={{ fontSize: 24 }}>{CH_EMOJI[c.id] ?? '🏁'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Small style={{ fontWeight: '700', color: active ? C.acc : C.muted }}>
                      {t(STATUS[c.status])} · {range(c.start, c.end)}
                    </Small>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{c.title}</Text>
                  </View>
                  <View style={{ transform: [{ rotate: open === c.id ? '90deg' : '0deg' }] }}>
                    <Icon name="chev" size={16} color={C.muted} />
                  </View>
                </Pressable>
                <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 20, color: C.muted }}>{c.body}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Small style={{ flex: 1 }}>
                    {t('{n} orang pernah ikut', { n: c.people })}
                    {c.myDays ? ` · ${t('kamu {n}× check-in', { n: c.myDays })}` : ''}
                  </Small>
                  {!active && <Chip label={c.remind ? t('Diingatkan') : t('Ingatkan')} emoji={c.remind ? '🔔' : undefined} on={c.remind} onPress={() => remind(c.id)} />}
                </View>
                {open === c.id && (
                  <View style={{ marginTop: 8 }}>
                    <DayPlan plan={c.plan} done={active ? d.days : undefined} />
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  hero: { borderRadius: R.hero, padding: 18, overflow: 'hidden', ...shadow(3) },
  blob: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(245,184,46,0.14)', top: -80, right: -60 },
  emoji: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  day: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  dayDone: { backgroundColor: C.kunyit, borderColor: C.kunyit },
  dayToday: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.14)' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 12 },
  statNum: { fontSize: 20, fontWeight: '800', color: '#fff' },
  statLbl: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  doneBox: { marginTop: 16, height: 54, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  doneIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.kunyit, alignItems: 'center', justifyContent: 'center' },
  rank: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 },
  rankMe: { backgroundColor: '#F4FBF7', marginHorizontal: -10, paddingHorizontal: 10, borderRadius: 14 },
  todayTask: { marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  planToday: { backgroundColor: '#F4FBF7', marginHorizontal: -10, paddingHorizontal: 10, borderRadius: 14 },
  planDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.dashed, alignItems: 'center', justifyContent: 'center' },
  daysPill: { backgroundColor: C.soft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
});
