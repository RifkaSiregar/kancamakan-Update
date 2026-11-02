import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet, SheetOpt } from '../../components/Sheet';
import { Icon, IconName } from '../../components/Icon';
import { Avatar, Btn, Card, Chip, Grad, RadioRow, Small, Tap, s } from '../../components/ui';
import { GOALS } from '../../data/sample';
import { invalidate, useQuery } from '../../lib/query';
import type { Plan, User } from '../../lib/types';
import { api } from '../../services/api';
import { setDailyReminder, registerPushToken } from '../../services/notify';
import { LangSwitch } from '../../components/LangSwitch';
import { t, useT } from '../../i18n';
import { toast, toastError, useApp } from '../../store';
import { C, R, shadow } from '../../theme';

function confirm(title: string, body: string, ok: string, run: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${body}`)) run();
    return;
  }
  Alert.alert(title, body, [
    { text: t('Batal'), style: 'cancel' },
    { text: ok, style: 'destructive', onPress: run },
  ]);
}

export default function Profile() {
  useT();
  const { user, setUser, logout, reminder, setReminder } = useApp();
  const me = useQuery<{ user: User; stats: { posts: number; saved: number; checkins: number } }>('/api/me');
  const plan = useQuery<{ plan: Plan | null }>('/api/plan');
  const premium = useQuery<{ interested: boolean; count: number }>('/api/premium');
  const [edit, setEdit] = useState(false);
  const u = me.data?.user ?? user;
  const [name, setName] = useState(u?.name ?? '');
  const [goal, setGoal] = useState(u?.goal ?? GOALS[2][0]);
  const [handle, setHandle] = useState(u?.handle ?? '');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm2, setConfirm2] = useState('');
  const [saving, setSaving] = useState(false);
  const [avMenu, setAvMenu] = useState(false);
  const [avBusy, setAvBusy] = useState(false);
  const ins = useSafeAreaInsets();

  const afterAvatar = (r: { user: User }) => {
    setUser(r.user);
    invalidate('/api/me');
    invalidate('/api/posts'); // foto baru ikut tampil di postingan
  };

  const pickAvatar = async (camera: boolean) => {
    setAvMenu(false);
    await new Promise((r) => setTimeout(r, 350)); // tunggu sheet tertutup (iOS tidak bisa membuka 2 modal sekaligus)
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast(camera ? t('Izin kamera ditolak. Aktifkan di pengaturan.') : t('Izin galeri ditolak. Aktifkan di pengaturan.'));
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.4, allowsEditing: true, aspect: [1, 1], base64: true };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = r.canceled ? null : r.assets[0];
    if (!a?.base64) return;
    const type = a.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(a.mimeType) ? a.mimeType : 'image/jpeg';
    if (a.base64.length > 4_000_000) return toast(t('Foto terlalu besar. Pilih foto lain.'));
    setAvBusy(true);
    try {
      afterAvatar(await api.post<{ user: User }>('/api/me/avatar', { photo: a.base64, photoType: type }, 60000));
      toast(t('Foto profil diperbarui'));
    } catch (e) {
      toastError(e);
    } finally {
      setAvBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvMenu(false);
    try {
      afterAvatar(await api.del<{ user: User }>('/api/me/avatar'));
      toast(t('Foto profil dihapus'));
    } catch (e) {
      toastError(e);
    }
  };

  const openEdit = () => {
    setName(u?.name ?? '');
    setGoal(u?.goal ?? GOALS[2][0]);
    setHandle(u?.handle ?? '');
    setCurrent('');
    setPassword('');
    setConfirm2('');
    setEdit(true);
  };

  const h = handle.trim().toLowerCase();
  const handleOk = /^[a-z0-9_.]{3,20}$/.test(h);
  const changePw = password.length > 0;
  const hasPw = !!u?.secured;
  const pwOk = !changePw || (password.length >= 8 && password === confirm2 && (!hasPw || current.length > 0));
  const canSave = name.trim().length >= 2 && handleOk && pwOk;

  const save = async () => {
    setSaving(true);
    try {
      let r = await api.patch<{ user: User }>('/api/me', { name: name.trim(), goal, handle: h });
      if (changePw) r = await api.post<{ user: User }>('/api/me/password', { current: hasPw ? current : undefined, password });
      setUser(r.user);
      invalidate('/api/me');
      setEdit(false);
      toast(changePw ? t('Profil & kata sandi diperbarui') : t('Profil diperbarui'));
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const signOut = () =>
    confirm(
      t('Keluar dari akun?'),
      u?.handle ? t('Kamu bisa masuk lagi kapan saja dengan nama pengguna @{handle}.', { handle: u.handle }) : t('Kamu bisa masuk lagi dengan nama pengguna dan kata sandimu.'),
      t('Keluar'),
      async () => {
        await api.post('/api/auth/logout').catch(() => {});
        logout();
        router.replace('/onboarding');
      },
    );

  const applyReminder = async (on: boolean, hour: number) => {
    const r = await setDailyReminder(on, hour);
    if (r === 'unsupported') return toast(t('Pengingat hanya tersedia di aplikasi HP (Expo Go / Android / iOS).'));
    if (r === 'denied') return toast(t('Izin notifikasi ditolak. Aktifkan lewat pengaturan HP.'));
    setReminder({ on, hour });
    if (on) registerPushToken();
    toast(on ? t('Pengingat check-in tiap pukul {time}', { time: `${String(hour).padStart(2, '0')}.00` }) : t('Pengingat dimatikan'));
  };

  const deleteAccount = () =>
    confirm(t('Hapus akun?'), t('Semua postingan, tanggapan, check-in, dan rencanamu akan dihapus permanen dari server.'), t('Hapus akun'), async () => {
      try {
        await api.del('/api/me');
        logout();
        router.replace('/onboarding');
        toast(t('Akun dihapus'));
      } catch (e) {
        toastError(e);
      }
    });

  const stats = me.data?.stats;

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        <Grad from="#178A60" to="#0B5139" style={[st.hero, { paddingTop: ins.top + 16 }]}>
          <View style={st.blob} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Tap accessibilityRole="button" accessibilityLabel={t('Ganti foto profil')} onPress={() => setAvMenu(true)} disabled={avBusy} style={[st.avRing, avBusy && { opacity: 0.6 }]} scale={0.94}>
              <Avatar ini={u?.initials ?? '?'} uri={u?.avatar} tone="green" size={64} />
              <View style={st.avCam}>
                <Icon name="cam" size={13} color={C.ink} stroke={2.2} />
              </View>
            </Tap>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>{u?.name ?? t('Kamu')}</Text>
              {u?.handle ? <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.95)', fontWeight: '700', marginTop: 1 }}>@{u.handle}</Text> : null}
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginTop: 2 }}>🎯 {u?.goal ? t(u.goal) : ''}</Text>
            </View>
            <Tap accessibilityRole="button" accessibilityLabel={t('Ubah profil')} onPress={openEdit} style={st.edit} scale={0.92}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>{t('Ubah')}</Text>
            </Tap>
          </View>
        </Grad>

        <View style={{ paddingHorizontal: 18, marginTop: -28, gap: 14 }}>
          <View style={st.stats}>
            {(
              [
                ['Postingan', stats?.posts, '/my?type=mine', '📝'],
                ['Tersimpan', stats?.saved, '/my?type=saved', '🔖'],
                ['Check-in', stats?.checkins, '/challenges', '🔥'],
              ] as const
            ).map(([l, n, href, e], i) => (
              <Tap key={l} accessibilityRole="button" accessibilityLabel={`${t(l)}: ${n ?? 0}`} onPress={() => router.push(href)} style={[st.stat, i > 0 && { borderLeftWidth: 1, borderLeftColor: C.lineSoft }]}>
                <Text style={{ fontSize: 15 }}>{e}</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{n ?? '–'}</Text>
                <Small>{t(l)}</Small>
              </Tap>
            ))}
          </View>

          <Card style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell" size={18} color={C.acc} stroke={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{t('Pengingat check-in harian')}</Text>
                <Small>{reminder.on ? t('Aktif · pukul {time}', { time: `${String(reminder.hour).padStart(2, '0')}.00` }) : t('Biar tantangan mingguan tidak terlewat')}</Small>
              </View>
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: reminder.on }} accessibilityLabel={t('Pengingat check-in harian')} onPress={() => applyReminder(!reminder.on, reminder.hour)} style={[st.sw, reminder.on && { backgroundColor: C.acc }]}>
                <View style={[st.knob, reminder.on && { transform: [{ translateX: 20 }] }]} />
              </Pressable>
            </View>
            {reminder.on && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {[7, 12, 19].map((h) => (
                  <Chip key={h} label={`${String(h).padStart(2, '0')}.00`} on={reminder.hour === h} onPress={() => applyReminder(true, h)} />
                ))}
              </View>
            )}
          </Card>

          <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18 }}>🌐</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{t('Bahasa')}</Text>
              <Small>{t('Bahasa Indonesia atau English')}</Small>
            </View>
            <LangSwitch />
          </Card>

          <Card style={{ overflow: 'hidden' }}>
            <Row icon="spark" label={plan.data?.plan ? t('Rencana Sehatku') : t('Buat Rencana Sehatku')} sub={plan.data?.plan ? plan.data.plan.challenge.title : t('Agent AI menyusun rencana dari ceritamu')} onPress={() => (plan.data?.plan ? router.push('/plan') : router.push({ pathname: '/onboarding/agent', params: { again: '1' } }))} />
            {plan.data?.plan && <Row icon="flag" label={t('Buat ulang rencana')} border onPress={() => router.push({ pathname: '/onboarding/agent', params: { again: '1' } })} />}
          </Card>

          <Tap accessibilityRole="button" accessibilityLabel={t('Lihat demo Premium')} onPress={() => router.push('/promo')} style={st.premium} scale={0.98}>
            <Grad from="#FFD56A" to="#F5B82E" style={StyleSheet.absoluteFill} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.amberInk }}>{premium.data?.interested ? t('Kamu sudah terdaftar tertarik') : t('Segera hadir')}</Text>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink, marginTop: 2 }}>KancaMakan Premium</Text>
              <Text style={{ fontSize: 13, color: '#4A3A10', marginTop: 4, lineHeight: 19 }}>{t('Catat makan dari foto, rencana menu 7 hari, dan laporan mingguan.')}</Text>
            </View>
            <Text style={{ fontSize: 40 }}>📸</Text>
          </Tap>

          <Card style={{ overflow: 'hidden' }}>
            <Row icon="book" label={t('Aturan komunitas')} onPress={() => router.push('/rules')} />
            <Row icon="user" label={t('Ubah profil')} sub={t('Nama, nama pengguna, kata sandi')} border onPress={openEdit} />
            <Row icon="logout" label={t('Keluar')} border onPress={signOut} />
            <Row icon="close" label={t('Hapus akun dan data')} border danger onPress={deleteAccount} />
          </Card>
          <Small style={{ textAlign: 'center' }}>{t('KancaMakan · komunitas gratis')}</Small>
        </View>
      </ScrollView>

      <Sheet visible={avMenu} onClose={() => setAvMenu(false)} title={t('Foto profil')} body={t('Tampil di postingan dan tanggapanmu.')}>
        <SheetOpt label={t('Pilih dari galeri')} onPress={() => pickAvatar(false)} />
        {Platform.OS !== 'web' && <SheetOpt label={t('Ambil foto')} onPress={() => pickAvatar(true)} />}
        {u?.avatar ? <SheetOpt label={t('Hapus foto')} danger onPress={removeAvatar} /> : null}
        <SheetOpt label={t('Batal')} muted onPress={() => setAvMenu(false)} />
      </Sheet>

      <Sheet visible={edit} onClose={() => setEdit(false)} title={t('Ubah profil')}>
        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
          <Text style={[s.label, { marginTop: 0 }]}>{t('Nama panggilan')}</Text>
          <TextInput value={name} onChangeText={setName} maxLength={24} style={[s.field, { height: 46 }]} accessibilityLabel={t('Nama panggilan')} />
          <Text style={s.label}>{t('Nama pengguna')}</Text>
          <View style={[s.field, st.handleField]}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.muted }}>@</Text>
            <TextInput value={handle} onChangeText={setHandle} autoCapitalize="none" autoCorrect={false} maxLength={20} placeholder={t('misalnya rani.sehat')} style={{ flex: 1, fontSize: 15, color: C.ink }} accessibilityLabel={t('Nama pengguna')} textContentType="username" />
          </View>
          <Small style={{ marginTop: 4, color: handle && !handleOk ? C.red : C.muted }}>{t('Dipakai untuk masuk. 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.')}</Small>

          <Text style={s.label}>{t('Tujuan')}</Text>
          <View style={{ gap: 6 }}>
            {GOALS.map(([g]) => (
              <RadioRow key={g} on={goal === g} onPress={() => setGoal(g)} title={t(g)} />
            ))}
          </View>

          <Text style={[s.label, { marginTop: 18 }]}>{t('Ganti kata sandi')}</Text>
          <Small style={{ marginBottom: 6 }}>{t('Kosongkan bila tidak ingin mengganti.')}</Small>
          {hasPw && <TextInput value={current} onChangeText={setCurrent} secureTextEntry placeholder={t('Kata sandi lama')} style={[s.field, { height: 46, marginBottom: 8 }]} accessibilityLabel={t('Kata sandi lama')} textContentType="password" />}
          <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder={t('Kata sandi baru (minimal 8 karakter)')} style={[s.field, { height: 46, marginBottom: 8 }]} accessibilityLabel={t('Kata sandi baru')} textContentType="newPassword" />
          <TextInput value={confirm2} onChangeText={setConfirm2} secureTextEntry placeholder={t('Ulangi kata sandi baru')} style={[s.field, { height: 46 }]} accessibilityLabel={t('Ulangi kata sandi baru')} textContentType="newPassword" />
          {changePw && !pwOk && (
            <Small style={{ marginTop: 4, color: C.red }}>
              {password.length < 8 ? t('Kata sandi baru minimal 8 karakter.') : password !== confirm2 ? t('Kata sandi baru belum sama.') : t('Isi kata sandi lama.')}
            </Small>
          )}
          {changePw && pwOk && <Small style={{ marginTop: 4 }}>{t('Perangkat lain yang masuk dengan akun ini akan dikeluarkan.')}</Small>}
        </ScrollView>
        <Btn title={t('Simpan')} loading={saving} disabled={!canSave} onPress={save} style={{ marginTop: 14 }} />
      </Sheet>
    </View>
  );
}

function Row({ label, sub, onPress, border, danger, icon }: { label: string; sub?: string; onPress: () => void; border?: boolean; danger?: boolean; icon: IconName }) {
  return (
    <Tap accessibilityRole="button" onPress={onPress} scale={0.99} style={[{ minHeight: 60, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }, border && { borderTopWidth: 1, borderTopColor: C.lineSoft }]}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: danger ? '#FDECEC' : C.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={danger ? C.red : C.acc} stroke={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: danger ? C.red : C.ink, fontWeight: '700' }}>{label}</Text>
        {sub ? <Small>{sub}</Small> : null}
      </View>
      {!danger && <Icon name="chev" size={16} color={C.muted} />}
    </Tap>
  );
}

const st = StyleSheet.create({
  hero: { paddingHorizontal: 18, paddingBottom: 46, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  blob: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(47,181,122,0.35)', top: -90, right: -70 },
  avRing: { padding: 3, borderRadius: 40, backgroundColor: C.kunyit },
  avCam: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: C.kunyit, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  edit: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, height: 38, justifyContent: 'center' },
  stats: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: R.card, paddingVertical: 12, ...shadow(2) },
  stat: { flex: 1, alignItems: 'center', gap: 1 },
  handleField: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 0 },
  sw: { width: 48, height: 28, borderRadius: 14, backgroundColor: C.line, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', ...shadow(1) },
  premium: { borderRadius: R.card, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', ...shadow(2, '#8A5A00') },
});
