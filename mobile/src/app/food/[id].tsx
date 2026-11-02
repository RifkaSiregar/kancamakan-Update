import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MacroBar, MACRO_COLORS } from '../../components/Macro';
import { PostCard } from '../../components/PostCard';
import { Btn, Chip, Empty, IconBtn, QueryState, Section, Small, Tap, s } from '../../components/ui';
import { useQuery } from '../../lib/query';
import type { Food, Post } from '../../lib/types';
import { foodAltName, foodName, portionText, t, useT } from '../../i18n';
import { C, CATEGORY_EMOJI, CATEGORY_TINT, foodEmoji, R, T, shadow } from '../../theme';

const fmt = (n: number | null | undefined) => (n == null ? '–' : (Math.round(n * 10) / 10).toLocaleString('id-ID'));
const MAX_AMOUNT = 2000;

/** Detail makanan dari database + diskusi komunitas tentang makanan ini. */
export default function FoodDetail() {
  useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ins = useSafeAreaInsets();
  const q = useQuery<{ food: Food; similar: Food[] }>(`/api/foods/${id}`);
  const posts = useQuery<{ posts: Post[] }>(`/api/posts?food=${encodeURIComponent(id ?? '')}&limit=10`);
  const f = q.data?.food;
  const [amount, setAmount] = useState<number | null>(null); // gram/ml yang dihitung; null = 1 porsi
  const [custom, setCustom] = useState('');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/foods'));

  if (!f) {
    return (
      <View style={[s.screen, { paddingTop: ins.top }]}>
        <View style={s.bar}>
          <IconBtn name="back" label={t('Kembali')} size={20} onPress={back} />
        </View>
        <QueryState loading={q.loading} error={q.error} onRetry={q.refresh} empty={<Empty emoji="🔍" title={t('Makanan tidak ditemukan')} body={t('Coba cari lagi di database makanan.')} />} />
      </View>
    );
  }

  const tint = CATEGORY_TINT[f.category] ?? C.soft;
  // Nilai gizi tersimpan per porsi `f.grams` (TKPI/USDA: per 100 g). Semua bisa dihitung ulang per gram.
  const per100 = f.source !== 'KancaMakan';
  const unit = f.unit ?? 'g';
  const base = f.grams;
  const shown = amount ?? base ?? 100;
  const k = base ? shown / base : 1;
  const sc = (n: number | null) => (n == null ? null : n * k);
  const perUnit = f.kcalPer100 != null ? f.kcalPer100 / 100 : null;
  const options: [string, number][] = [
    ...(!per100 && base ? ([[`${t('1 porsi')} · ${base} ${unit}`, base]] as [string, number][]) : []),
    ...[50, 100, 200].filter((g) => g !== base || per100).map((g) => [`${g} ${unit}`, g] as [string, number]),
  ];
  const applyCustom = (v: string) => {
    const clean = v.replace(/[^0-9]/g, '').slice(0, 4);
    setCustom(clean);
    const n = Number(clean);
    if (n > 0) setAmount(Math.min(n, MAX_AMOUNT));
  };
  const macros: [keyof typeof MACRO_COLORS | 'fiber', string, number | null][] = [
    ['protein', t('Protein'), sc(f.protein)],
    ['fat', t('Lemak'), sc(f.fat)],
    ['carb', t('Karbo'), sc(f.carb)],
    ['fiber', t('Serat'), sc(f.fiber)],
  ];

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 36 }}>
        {/* Hero berwarna sesuai kategori, dengan emoji besar sebagai "foto" */}
        <View style={[st.hero, { backgroundColor: tint, paddingTop: ins.top + 8 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <IconBtn name="back" label={t('Kembali')} size={20} onPress={back} />
            <IconBtn name="plus" label={t('Buat postingan tentang {name}', { name: foodName(f) })} size={20} onPress={() => router.push({ pathname: '/compose', params: { foodId: f.id, foodLabel: foodName(f) } })} />
          </View>
          <View style={st.plate}>
            <Text style={{ fontSize: 64 }}>{foodEmoji(f.name, f.category)}</Text>
          </View>
          <Text style={{ textAlign: 'center', fontSize: 12.5, fontWeight: '700', color: C.muted }}>{t(f.category)}</Text>
          <Text style={{ textAlign: 'center', ...T.display, color: C.ink, marginTop: 2 }}>{foodName(f)}</Text>
          {!!foodAltName(f) && <Text style={{ textAlign: 'center', fontSize: 13, color: C.muted, fontStyle: 'italic', marginTop: 2 }}>{foodAltName(f)}</Text>}
          <Text style={{ textAlign: 'center', ...T.small, color: C.muted, marginTop: 2 }}>{per100 ? t('Data per 100 {unit} · {source}', { unit, source: t(f.sourceLabel ?? f.source) }) : `${t('1 porsi')} = ${portionText(f.portion)}`}</Text>
        </View>

        <View style={{ paddingHorizontal: 18, marginTop: -36, gap: 14 }}>
          <View style={st.nutri}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View>
                <Small>{t('Perkiraan energi')}</Small>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text style={{ fontSize: 40, lineHeight: 46, fontWeight: '800', color: C.ink, letterSpacing: -1 }}>{Math.round(f.kcal * k)}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.muted }}>{t('kkal')}</Text>
                </View>
              </View>
              <View style={st.portion}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.accDark }}>{base ? `${shown} ${unit}` : t('1 porsi')}</Text>
              </View>
            </View>
            {perUnit != null && (
              <View style={st.perGram}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{fmt(perUnit)} {t('kkal')}</Text>
                  <Small>{t('per 1 {unit}', { unit: unit === 'ml' ? 'ml' : 'gram' })}</Small>
                </View>
                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.line }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{fmt(f.kcalPer100)} {t('kkal')}</Text>
                  <Small>{t('per 100 {unit}', { unit })}</Small>
                </View>
              </View>
            )}
            {base ? (
              <View style={{ marginTop: 12 }}>
                <Small style={{ fontWeight: '700', marginBottom: 6 }}>{t('Hitung untuk')}</Small>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={t('Jumlah dalam {unit}', { unit })}>
                  {options.map(([label, g]) => (
                    <Chip
                      key={label}
                      label={label}
                      on={shown === g && !custom}
                      onPress={() => {
                        setCustom('');
                        setAmount(g);
                      }}
                    />
                  ))}
                  <View style={[st.custom, !!custom && { borderColor: C.acc }]}>
                    <TextInput value={custom} onChangeText={applyCustom} keyboardType="number-pad" placeholder={t('lainnya')} maxLength={4} style={{ minWidth: 56, fontSize: 14, fontWeight: '700', color: C.ink, paddingVertical: 0 }} accessibilityLabel={t('Jumlah lain dalam {unit}', { unit })} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted }}>{unit}</Text>
                  </View>
                </View>
              </View>
            ) : null}
            <View style={{ marginTop: 12 }}>
              <MacroBar protein={f.protein} fat={f.fat} carb={f.carb} height={12} />
            </View>
            <View style={st.grid}>
              {macros.map(([k, label, v]) => (
                <View key={k} style={st.cell}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k === 'fiber' ? '#B98A62' : MACRO_COLORS[k] }} />
                    <Small>{label}</Small>
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink, marginTop: 2 }}>
                    {fmt(v)} <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600' }}>g</Text>
                  </Text>
                </View>
              ))}
            </View>
            {(f.sugar != null || f.sodium != null) && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {f.sugar != null && (
                  <View style={st.cell}>
                    <Small>{t('Gula')}</Small>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{fmt(sc(f.sugar))} g</Text>
                  </View>
                )}
                {f.sodium != null && (
                  <View style={st.cell}>
                    <Small>{t('Natrium')}</Small>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{fmt(sc(f.sodium))} mg</Text>
                  </View>
                )}
              </View>
            )}
            <Small style={{ marginTop: 12 }}>
              {per100 ? t('Sumber: {source}. Nilai bahan bisa berbeda setelah dimasak.', { source: t(f.sourceLabel ?? f.source) }) : t('Berat porsi adalah perkiraan umum; bisa berbeda tergantung resep dan ukuran porsi.')} {t('Bukan saran medis.')}
            </Small>
          </View>

          {!!f.tip && (
            <View style={st.tip}>
              <View style={st.tipIcon}>
                <Text style={{ fontSize: 18 }}>💡</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: C.amberInk }}>{t('Tips sehat')}</Text>
                <Text style={{ fontSize: 14.5, lineHeight: 21, color: C.ink, marginTop: 2 }}>{f.tip}</Text>
              </View>
            </View>
          )}

          {f.tags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {f.tags.map((tag) => {
                const warn = ['digoreng', 'manis', 'santan', 'gorengan'].includes(tag);
                return (
                  <View key={tag} style={[st.tag, warn && { backgroundColor: C.amber }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: warn ? C.amberInk : C.accDark }}>{t(tag)}</Text>
                  </View>
                );
              })}
            </View>
          )}

          <Btn title={t('Buat postingan tentang {name}', { name: foodName(f).toLowerCase() })} icon="plus" onPress={() => router.push({ pathname: '/compose', params: { foodId: f.id, foodLabel: foodName(f) } })} />
          <Small style={{ textAlign: 'center', marginTop: -6 }}>{t('Makanan ini langsung ditandai di postinganmu, lengkap dengan info gizinya.')}</Small>

          <Section title={t('Dibahas di komunitas')} />
          {posts.data?.posts.length ? (
            <View style={{ gap: 14 }}>
              {posts.data.posts.map((p) => (
                <PostCard key={p.id} p={p} />
              ))}
            </View>
          ) : (
            <QueryState loading={posts.loading} error={posts.error} empty={<Small>{t('Belum ada yang membahas {name}. Jadilah yang pertama!', { name: foodName(f).toLowerCase() })}</Small>} />
          )}

          {q.data!.similar.length > 0 && (
            <>
              <Section title={t('Makanan serupa')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 6, paddingHorizontal: 18 }} style={{ marginHorizontal: -18 }}>
                {q.data!.similar.map((x) => (
                  <Tap key={x.id} accessibilityRole="button" accessibilityLabel={foodName(x)} onPress={() => router.push({ pathname: '/food/[id]', params: { id: x.id } })} style={st.sim}>
                    <View style={[st.simIcon, { backgroundColor: CATEGORY_TINT[x.category] ?? C.soft }]}>
                      <Text style={{ fontSize: 22 }}>{foodEmoji(x.name, x.category)}</Text>
                    </View>
                    <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.ink }} numberOfLines={2}>
                      {foodName(x)}
                    </Text>
                    <Small>{Math.round(x.kcal)} {t('kkal')}</Small>
                  </Tap>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { paddingHorizontal: 18, paddingBottom: 56, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 },
  plate: { alignSelf: 'center', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center', marginTop: -6, marginBottom: 10, borderWidth: 4, borderColor: '#fff', ...shadow(2) },
  nutri: { backgroundColor: '#fff', borderRadius: R.card, padding: 18, ...shadow(2) },
  perGram: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: C.bg },
  custom: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff' },
  portion: { backgroundColor: C.soft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 8 },
  cell: { flexGrow: 1, flexBasis: '45%', backgroundColor: C.bg, borderRadius: 14, padding: 12 },
  tip: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: R.tile, backgroundColor: C.amber },
  tipIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tag: { backgroundColor: C.soft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  sim: { width: 132, padding: 12, gap: 6, borderRadius: R.tile, backgroundColor: '#fff', ...shadow(1) },
  simIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
