// API komunitas & data (tanpa AI). Semua respons berbentuk JSON.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { removePhoto, savePhoto } from './storage.js';
import { BOT_NAME, CHALLENGES, CHALLENGES_EN } from './db.js';
import { KINDS, MAX_POST, TOPICS, clean, isHarmful } from './content.js';
import { GOALS } from './agent.js';
import { SOURCE_LABEL, contentList, rowFood } from './knowledge.js';

// Sinonim Indonesia → Inggris agar pencarian juga menemukan data USDA (nama berbahasa Inggris).
const SYNONYMS = {
  ayam: 'chicken', sapi: 'beef', daging: 'meat', kambing: 'lamb', ikan: 'fish', telur: 'egg', susu: 'milk', keju: 'cheese', mentega: 'butter',
  nasi: 'rice', beras: 'rice', roti: 'bread', mi: 'noodle', mie: 'noodle', kentang: 'potato', ubi: 'sweet potato', jagung: 'corn', gandum: 'wheat',
  pisang: 'banana', apel: 'apple', jeruk: 'orange', mangga: 'mango', nanas: 'pineapple', semangka: 'watermelon', anggur: 'grape', stroberi: 'strawberr',
  alpukat: 'avocado', pepaya: 'papaya', tomat: 'tomato', wortel: 'carrot', bayam: 'spinach', kubis: 'cabbage', kol: 'cabbage', bawang: 'onion',
  jamur: 'mushroom', brokoli: 'broccoli', timun: 'cucumber', mentimun: 'cucumber', kacang: 'bean', udang: 'shrimp', kepiting: 'crab', cumi: 'squid',
  gula: 'sugar', madu: 'honey', kopi: 'coffee', teh: 'tea', minyak: 'oil', kelapa: 'coconut', cokelat: 'chocolate', coklat: 'chocolate', kue: 'cake',
  biskuit: 'biscuit', sereal: 'cereal', yoghurt: 'yogurt', salmon: 'salmon', tuna: 'tuna', kalkun: 'turkey', bebek: 'duck', tahu: 'tofu', kedelai: 'soy',
};

const hash = (t) => createHash('sha256').update(t).digest('hex');
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
// Video dikirim sebagai data mentah (bukan base64). Batas 4 MB agar muat dalam batas body request Vercel (±4,5 MB).
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
export const MAX_VIDEO_BYTES = 4 * 1024 * 1024;
const REPORT_HIDE = 3; // postingan disembunyikan otomatis setelah dilaporkan 3 pengguna

// ---------- kata sandi (scrypt) ----------
export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString('hex')}`;
}
export function checkPassword(pw, stored) {
  const [, salt, hex] = String(stored || '').split('$');
  if (!salt || !hex) return false;
  const a = Buffer.from(hex, 'hex');
  const b = scryptSync(pw, salt, a.length);
  return a.length === b.length && timingSafeEqual(a, b);
}
const HANDLE_RE = /^[a-z0-9_.]{3,20}$/;

/** Buat sesi baru dan kembalikan token mentahnya (yang disimpan di server hanya hash-nya). */
async function newSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  (await db.prepare('INSERT INTO sessions (token_hash, user_id) VALUES (?,?)').run(hash(token), userId));
  return token;
}

/**
 * Simpan notifikasi untuk pengguna (dan kirim push bila pengguna punya token push).
 * Tidak memberi tahu diri sendiri atau akun bot; suka yang sama tidak diduplikasi.
 */
export async function notify(db, push, { userId, type, actorId = null, postId = null, text, textEn }) {
  if (!userId || userId === actorId) return;
  const target = (await db.prepare('SELECT id, is_bot, push_token, lang FROM users WHERE id = ?').get(userId));
  if (!target || target.is_bot) return;
  if (type === 'like' && (await db.prepare('SELECT 1 FROM notifications WHERE user_id = ? AND type = ? AND actor_id = ? AND post_id = ?').get(userId, type, actorId, postId))) return;
  (await db.prepare('INSERT INTO notifications (user_id, type, actor_id, post_id, text) VALUES (?,?,?,?,?)').run(userId, type, actorId, postId, text));
  // Yang disimpan selalu teks Indonesia (aplikasi menyusun ulang sesuai bahasanya); push memakai bahasa penerima.
  if (target.push_token && push) push(target.push_token, target.lang === 'en' && textEn ? textEn : text, { postId });
}

/**
 * Perintah hapus postingan beserta data turunannya. Ditulis eksplisit (tidak mengandalkan ON DELETE CASCADE)
 * karena di Turso lewat HTTP, PRAGMA foreign_keys tidak selalu aktif di setiap permintaan.
 * `where` memilih postingan, misalnya 'id = ?' atau 'user_id = ?'.
 */
export const deletePostStmts = (where, args) => [
  ...['comments', 'likes', 'saves', 'reports', 'notifications'].map((t) => [`DELETE FROM ${t} WHERE post_id IN (SELECT id FROM posts WHERE ${where})`, args]),
  [`DELETE FROM posts WHERE ${where}`, args],
];

export const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

const TONES = ['amber', 'green', 'blue'];

export const userOut = (u) => ({
  id: u.id,
  name: u.name,
  handle: u.handle || null,
  secured: Boolean(u.pass_hash),
  initials: initials(u.name),
  avatar: photoUrl(u.avatar),
  goal: u.goal,
  topics: JSON.parse(u.topics || '[]'),
  createdAt: u.created_at,
});

/** Middleware: baca token "Authorization: Bearer ..." → req.user. */
export function auth(db, { required = true } = {}) {
  const find = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?');
  return async (req, res, next) => {
    const h = req.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    req.user = token ? await find.get(hash(token)) : undefined;
    if (required && !req.user) return res.status(401).json({ error: 'Sesi berakhir. Silakan masuk lagi.' });
    if (req.user?.banned) return res.status(403).json({ error: 'Akun ini dinonaktifkan karena melanggar aturan komunitas.', banned: true });
    // Ingat bahasa aplikasi pengguna supaya push notification dikirim dalam bahasa yang sama.
    if (req.user && req.lang && req.user.lang !== req.lang) {
      (await db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(req.lang, req.user.id));
      req.user.lang = req.lang;
    }
    next();
  };
}

const POST_SELECT = `
SELECT p.*, u.name AS author_name, u.is_bot AS author_bot, u.avatar AS author_avatar, f.name AS food_name, f.category AS food_category,
  (SELECT count(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
  (SELECT count(*) FROM comments c WHERE c.post_id = p.id AND c.user_id NOT IN (SELECT blocked_id FROM blocks WHERE user_id = :me)) AS comment_count,
  EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = :me) AS liked,
  EXISTS (SELECT 1 FROM saves s WHERE s.post_id = p.id AND s.user_id = :me) AS saved
FROM posts p
JOIN users u ON u.id = p.user_id
LEFT JOIN foods f ON f.id = p.food_id
WHERE p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE user_id = :me)
  AND u.banned = 0
  AND p.id NOT IN (SELECT post_id FROM reports WHERE user_id = :me)
  AND (SELECT count(*) FROM reports r WHERE r.post_id = p.id) < ${REPORT_HIDE}`;

/** Foto lama tersimpan sebagai nama file (/uploads/...), foto di Vercel Blob sebagai URL lengkap. */
export const photoUrl = (photo) => (!photo ? null : /^https?:/.test(photo) ? photo : `/uploads/${photo}`);

export const postOut = (p, me) => ({
  id: p.id,
  kind: p.kind,
  topic: p.topic,
  text: p.text,
  food: p.food_label || p.food_name ? { label: p.food_label || p.food_name, id: p.food_id || null, name: p.food_name || null, category: p.food_category || null } : null,
  photo: photoUrl(p.photo),
  video: photoUrl(p.video),
  ai: Boolean(p.ai),
  createdAt: p.created_at,
  author: { id: p.user_id, name: p.author_name, initials: p.author_bot ? 'AI' : initials(p.author_name), tone: p.author_bot ? 'green' : TONES[p.user_id % 3], avatar: photoUrl(p.author_avatar), bot: Boolean(p.author_bot) },
  likes: Number(p.like_count),
  comments: Number(p.comment_count),
  liked: Boolean(p.liked),
  saved: Boolean(p.saved),
  mine: p.user_id === me,
});

export async function getPost(db, id, me) {
  const p = (await db.prepare(`${POST_SELECT} AND p.id = :id`).get({ me, id }));
  return p ? postOut(p, me) : null;
}

/** Simpan postingan baru dan kembalikan bentuk API-nya. */
export async function insertPost(db, { userId, kind, topic, text, foodLabel = '', foodId = null, photo = null, video = null, ai = 0, createdAt = null }) {
  const r = (await db
    .prepare("INSERT INTO posts (user_id, kind, topic, food_label, food_id, text, photo, video, ai, created_at) VALUES (?,?,?,?,?,?,?,?,?, coalesce(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')))")
    .run(userId, kind, topic, foodLabel, foodId, text, photo, video, ai ? 1 : 0, createdAt));
  return Number(r.lastInsertRowid);
}

/** Terbitkan konten Asisten dari antrean admin yang jadwalnya sudah lewat (dipanggil saat beranda dimuat). */
export async function publishDue(db) {
  const due = (await db.prepare('SELECT * FROM bot_queue WHERE publish_at IS NOT NULL AND publish_at <= ? ORDER BY publish_at').all(new Date().toISOString()));
  if (!due.length) return 0;
  const bot = (await db.prepare('SELECT id FROM users WHERE is_bot = 1').get()).id;
  for (const q of due) {
    // Hapus dulu dari antrean supaya permintaan bersamaan tidak menerbitkan dua kali.
    if (!(await db.prepare('DELETE FROM bot_queue WHERE id = ?').run(q.id)).changes) continue;
    await insertPost(db, { userId: bot, kind: q.kind, topic: q.topic, text: q.text, foodLabel: q.food_label, foodId: q.food_id, ai: q.ai, createdAt: q.publish_at });
  }
  return due.length;
}

/** Baca foto base64 dari body ({photo, photoType}). Mengembalikan {data, ext, type} atau {error, status}. */
function readPhoto(b) {
  const type = b.photoType || 'image/jpeg';
  const ext = PHOTO_TYPES[type];
  const data = Buffer.from(String(b.photo).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!ext) return { error: 'Format foto tidak didukung', status: 400 };
  if (data.length > MAX_PHOTO_BYTES) return { error: 'Foto terlalu besar (maks 3 MB)', status: 413 };
  if (data.length < 100) return { error: 'Foto rusak', status: 400 };
  return { data, ext, type };
}

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nearToday = (day) => Math.abs(Date.parse(`${day}T12:00:00Z`) - Date.now()) <= 40 * 3600 * 1000; // zona waktu ±

export function registerApi(app, db, { uploadsDir, push }) {
  const loginLimit = Number(process.env.LOGIN_LIMIT || 10);
  const need = auth(db);
  const foodExists = async (id) => Boolean(id && (await db.prepare('SELECT 1 FROM foods WHERE id = ?').get(id)));

  // ---------- Akun ----------

  app.post('/api/auth/guest', async (req, res) => {
    const name = clean(req.body?.name || '', 24);
    if (name.length < 2) return res.status(400).json({ error: 'Nama panggilan minimal 2 huruf' });
    if (name.toLowerCase() === BOT_NAME.toLowerCase()) return res.status(400).json({ error: 'Nama ini tidak bisa dipakai' });
    const goal = GOALS.includes(req.body?.goal) ? req.body.goal : GOALS[2];
    const topics = (Array.isArray(req.body?.topics) ? req.body.topics : []).filter((t) => TOPICS.includes(t)).slice(0, 6);
    const r = (await db.prepare('INSERT INTO users (name, goal, topics) VALUES (?,?,?)').run(name, goal, JSON.stringify(topics)));
    const token = await newSession(db, Number(r.lastInsertRowid));
    const user = (await db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid));
    res.status(201).json({ token, user: userOut(user) });
  });

  // Daftar akun baru: nama panggilan + nama pengguna + kata sandi (tujuan & topik opsional).
  app.post('/api/auth/register', async (req, res) => {
    const name = clean(req.body?.name || '', 24);
    const handle = String(req.body?.handle || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (name.length < 2) return res.status(400).json({ error: 'Nama panggilan minimal 2 huruf' });
    if (name.toLowerCase() === BOT_NAME.toLowerCase()) return res.status(400).json({ error: 'Nama ini tidak bisa dipakai' });
    if (!HANDLE_RE.test(handle)) return res.status(400).json({ error: 'Nama pengguna 3–20 karakter: huruf kecil, angka, titik, atau garis bawah' });
    if (password.length < 8) return res.status(400).json({ error: 'Kata sandi minimal 8 karakter' });
    if ((await db.prepare('SELECT id FROM users WHERE handle = ?').get(handle))) return res.status(409).json({ error: 'Nama pengguna sudah dipakai. Coba yang lain.' });
    const goal = GOALS.includes(req.body?.goal) ? req.body.goal : GOALS[2];
    const topics = (Array.isArray(req.body?.topics) ? req.body.topics : []).filter((t) => TOPICS.includes(t)).slice(0, 6);
    const r = (await db.prepare('INSERT INTO users (name, goal, topics, handle, pass_hash, lang) VALUES (?,?,?,?,?,?)').run(name, goal, JSON.stringify(topics), handle, hashPassword(password), req.lang || 'id'));
    const token = await newSession(db, Number(r.lastInsertRowid));
    const user = (await db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid));
    res.status(201).json({ token, user: userOut(user) });
  });

  // Amankan akun tamu dengan nama pengguna + kata sandi, supaya bisa masuk dari perangkat lain.
  app.post('/api/auth/secure', need, async (req, res) => {
    const handle = String(req.body?.handle || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!HANDLE_RE.test(handle)) return res.status(400).json({ error: 'Nama pengguna 3–20 karakter: huruf kecil, angka, titik, atau garis bawah' });
    if (password.length < 8) return res.status(400).json({ error: 'Kata sandi minimal 8 karakter' });
    if (req.user.pass_hash && !checkPassword(String(req.body?.current || ''), req.user.pass_hash)) return res.status(403).json({ error: 'Kata sandi lama salah' });
    const taken = (await db.prepare('SELECT id FROM users WHERE handle = ? AND id != ?').get(handle, req.user.id));
    if (taken) return res.status(409).json({ error: 'Nama pengguna sudah dipakai. Coba yang lain.' });
    (await db.prepare('UPDATE users SET handle = ?, pass_hash = ? WHERE id = ?').run(handle, hashPassword(password), req.user.id));
    res.json({ user: userOut((await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id))) });
  });

  app.post('/api/auth/login', async (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const ip = req.ip || 'unknown';
    (await db.prepare('DELETE FROM login_log WHERE created_at < ?').run(now - 900));
    if ((await db.prepare('SELECT count(*) n FROM login_log WHERE ip = ?').get(ip)).n >= loginLimit) return res.status(429).json({ error: 'Terlalu banyak percobaan masuk. Coba lagi 15 menit lagi.' });
    const handle = String(req.body?.handle || '').trim().toLowerCase();
    const u = (await db.prepare('SELECT * FROM users WHERE handle = ?').get(handle));
    if (!u || !checkPassword(String(req.body?.password || ''), u.pass_hash)) {
      (await db.prepare('INSERT INTO login_log (ip, created_at) VALUES (?,?)').run(ip, now));
      return res.status(401).json({ error: 'Nama pengguna atau kata sandi salah' });
    }
    if (u.banned) return res.status(403).json({ error: 'Akun ini dinonaktifkan karena melanggar aturan komunitas.', banned: true });
    res.json({ token: await newSession(db, u.id), user: userOut(u) });
  });

  app.post('/api/auth/logout', need, async (req, res) => {
    const h = (req.get('authorization') || '').slice(7).trim();
    (await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(h)));
    res.json({ ok: true });
  });

  // ---------- Notifikasi ----------

  app.get('/api/notifications', need, async (req, res) => {
    const rows = (await db
      .prepare(
        `SELECT n.*, u.name AS actor_name FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
         WHERE n.user_id = ? AND (n.actor_id IS NULL OR n.actor_id NOT IN (SELECT blocked_id FROM blocks WHERE user_id = ?)) ORDER BY n.id DESC LIMIT 50`,
      )
      .all(req.user.id, req.user.id));
    const unread = (await db.prepare('SELECT count(*) n FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id)).n;
    res.json({
      notifications: rows.map((n) => ({ id: n.id, type: n.type, text: n.text, postId: n.post_id, read: Boolean(n.read), createdAt: n.created_at, actor: n.actor_id ? { id: n.actor_id, name: n.actor_name, initials: initials(n.actor_name) } : null })),
      unread,
    });
  });

  app.post('/api/notifications/read', need, async (req, res) => {
    (await db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id));
    res.json({ ok: true });
  });

  // Token Expo Push dari perangkat (development build / aplikasi rilis).
  app.post('/api/me/push-token', need, async (req, res) => {
    const t = req.body?.token;
    if (t !== null && !/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(String(t))) return res.status(400).json({ error: 'Token push tidak valid' });
    (await db.prepare('UPDATE users SET push_token = ? WHERE id = ?').run(t, req.user.id));
    res.json({ ok: true });
  });

  app.get('/api/me', need, async (req, res) => {
    const me = req.user.id;
    const stats = {
      posts: (await db.prepare('SELECT count(*) n FROM posts WHERE user_id = ?').get(me)).n,
      saved: (await db.prepare('SELECT count(*) n FROM saves WHERE user_id = ?').get(me)).n,
      checkins: (await db.prepare('SELECT count(*) n FROM checkins WHERE user_id = ?').get(me)).n,
      unread: (await db.prepare('SELECT count(*) n FROM notifications WHERE user_id = ? AND read = 0').get(me)).n,
    };
    res.json({ user: userOut(req.user), stats });
  });

  app.patch('/api/me', need, async (req, res) => {
    const b = req.body || {};
    const name = b.name !== undefined ? clean(b.name, 24) : req.user.name;
    if (name.length < 2 || name.toLowerCase() === BOT_NAME.toLowerCase()) return res.status(400).json({ error: 'Nama panggilan tidak valid' });
    const goal = b.goal !== undefined ? (GOALS.includes(b.goal) ? b.goal : null) : req.user.goal;
    if (!goal) return res.status(400).json({ error: 'Tujuan tidak dikenal' });
    const topics = b.topics !== undefined ? (Array.isArray(b.topics) ? b.topics.filter((t) => TOPICS.includes(t)).slice(0, 6) : null) : JSON.parse(req.user.topics);
    if (!topics) return res.status(400).json({ error: 'Topik tidak valid' });
    // Nama pengguna (dipakai untuk masuk) boleh diganti asalkan belum dipakai orang lain.
    const handle = b.handle !== undefined ? String(b.handle).trim().toLowerCase() : req.user.handle;
    if (b.handle !== undefined && !HANDLE_RE.test(handle)) return res.status(400).json({ error: 'Nama pengguna 3–20 karakter: huruf kecil, angka, titik, atau garis bawah' });
    if (handle && handle !== req.user.handle && (await db.prepare('SELECT 1 FROM users WHERE handle = ? AND id != ?').get(handle, req.user.id))) return res.status(409).json({ error: 'Nama pengguna sudah dipakai. Coba yang lain.' });
    (await db.prepare('UPDATE users SET name = ?, goal = ?, topics = ?, handle = ? WHERE id = ?').run(name, goal, JSON.stringify(topics), handle || null, req.user.id));
    res.json({ user: userOut((await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id))) });
  });

  // Ganti kata sandi: wajib kata sandi lama (kecuali akun lama yang belum pernah punya kata sandi).
  app.post('/api/me/password', need, async (req, res) => {
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Kata sandi baru minimal 8 karakter' });
    if (req.user.pass_hash && !checkPassword(String(req.body?.current || ''), req.user.pass_hash)) return res.status(403).json({ error: 'Kata sandi lama salah' });
    if (!req.user.handle) return res.status(400).json({ error: 'Atur nama pengguna dulu' });
    (await db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(password), req.user.id));
    // Sesi lain (perangkat lain) dikeluarkan; sesi yang sedang dipakai tetap.
    const cur = hash((req.get('authorization') || '').slice(7).trim());
    (await db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user.id, cur));
    res.json({ user: userOut((await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id))) });
  });

  // Foto profil: unggah (base64, sama seperti foto postingan) atau hapus.
  app.post('/api/me/avatar', need, async (req, res) => {
    if (!req.body?.photo) return res.status(400).json({ error: 'Pilih foto dulu' });
    const ph = readPhoto(req.body);
    if (ph.error) return res.status(ph.status).json({ error: ph.error });
    const avatar = await savePhoto(ph.data, ph.ext, ph.type, uploadsDir);
    (await db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id));
    await removePhoto(req.user.avatar, uploadsDir);
    res.json({ user: userOut((await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id))) });
  });

  app.delete('/api/me/avatar', need, async (req, res) => {
    (await db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id));
    await removePhoto(req.user.avatar, uploadsDir);
    res.json({ user: userOut((await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id))) });
  });

  // Hapus akun beserta semua datanya (wajib tersedia untuk aplikasi dengan akun di Play Store/App Store).
  app.delete('/api/me', need, async (req, res) => {
    const me = req.user.id;
    const files = (await db.prepare('SELECT photo AS f FROM posts WHERE user_id = ? AND photo IS NOT NULL UNION ALL SELECT video FROM posts WHERE user_id = ? AND video IS NOT NULL UNION ALL SELECT file FROM uploads WHERE user_id = ?').all(me, me, me));
    await db.batch([
      ...deletePostStmts('user_id = ?', [me]),
      ...['comments', 'reports', 'uploads', 'plans', 'likes', 'saves', 'checkins', 'challenge_weeks', 'reminders', 'interest', 'ai_log', 'sessions', 'notifications'].map((t) => [`DELETE FROM ${t} WHERE user_id = ?`, [me]]),
      ['DELETE FROM notifications WHERE actor_id = ?', [me]],
      ['DELETE FROM blocks WHERE user_id = ? OR blocked_id = ?', [me, me]],
      ['DELETE FROM users WHERE id = ?', [me]],
    ]);
    for (const x of files) await removePhoto(x.f, uploadsDir);
    await removePhoto(req.user.avatar, uploadsDir);
    res.json({ ok: true });
  });

  // ---------- Postingan ----------

  app.get('/api/posts', need, async (req, res) => {
    await publishDue(db);
    const me = req.user.id;
    const { topic, q, before, saved, mine, food } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    let sql = POST_SELECT;
    const params = { me, limit };
    if (topic && TOPICS.includes(topic)) (sql += ' AND p.topic = :topic'), (params.topic = topic);
    if (q && String(q).trim()) (sql += ' AND (p.text LIKE :q OR p.food_label LIKE :q OR f.name LIKE :q OR p.topic LIKE :q)'), (params.q = `%${String(q).trim().slice(0, 50)}%`);
    if (food) (sql += ' AND (p.food_id = :food OR p.text LIKE :foodName)'), (params.food = String(food)), (params.foodName = `%${(await db.prepare('SELECT name FROM foods WHERE id = ?').get(String(food)))?.name ?? '__none__'}%`);
    if (saved === '1') sql += ' AND p.id IN (SELECT post_id FROM saves WHERE user_id = :me)';
    if (mine === '1') sql += ' AND p.user_id = :me';
    if (before) (sql += ' AND p.id < :before'), (params.before = parseInt(before, 10) || 0);
    sql += ' ORDER BY p.id DESC LIMIT :limit';
    const rows = (await db.prepare(sql).all(params));
    res.json({ posts: rows.map((p) => postOut(p, me)), next: rows.length === limit ? rows[rows.length - 1].id : null });
  });

  app.post('/api/posts', need, async (req, res) => {
    const b = req.body || {};
    // Jenis tidak dipilih lagi di aplikasi (selalu "Bagikan"); masih diterima untuk kompatibilitas.
    const kind = b.kind === undefined ? 'Bagikan' : KINDS.includes(b.kind) ? b.kind : null;
    const topic = TOPICS.includes(b.topic) ? b.topic : null;
    const text = clean(b.text || '', MAX_POST);
    if (!topic) return res.status(400).json({ error: 'Pilih topik postingan dulu' });
    if (!kind) return res.status(400).json({ error: 'Jenis postingan tidak valid' });
    if (b.photo && b.videoId) return res.status(400).json({ error: 'Pilih foto atau video, salah satu saja' });
    if (text.length < 3) return res.status(400).json({ error: 'Tulis minimal 3 huruf' });
    if (isHarmful(text)) return res.status(400).json({ error: 'Postingan berisi saran diet berbahaya dan tidak bisa dikirim.' });
    let photo = null;
    if (b.photo) {
      const ph = readPhoto(b);
      if (ph.error) return res.status(ph.status).json({ error: ph.error });
      photo = await savePhoto(ph.data, ph.ext, ph.type, uploadsDir);
    }
    let video = null;
    if (b.videoId) {
      // Video sudah diunggah lebih dulu lewat /api/uploads/video; hanya pemiliknya yang boleh memakainya.
      const up = (await db.prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(String(b.videoId), req.user.id));
      if (!up) return res.status(400).json({ error: 'Video tidak ditemukan. Unggah ulang videonya.' });
      (await db.prepare('DELETE FROM uploads WHERE id = ?').run(up.id));
      video = up.file;
    }
    const foodId = (await foodExists(b.foodId)) ? b.foodId : null;
    const id = await insertPost(db, { userId: req.user.id, kind, topic, text, foodLabel: clean(b.foodLabel || '', 40), foodId, photo, video });
    res.status(201).json({ post: (await getPost(db, id, req.user.id)) });
  });

  // Unggah video untuk postingan (langkah 1 dari 2). Body = isi file mentah, Content-Type = jenis video.
  app.post('/api/uploads/video', need, express.raw({ type: () => true, limit: MAX_VIDEO_BYTES + 1024 }), async (req, res) => {
    const type = String(req.get('content-type') || '').split(';')[0].trim();
    const ext = VIDEO_TYPES[type];
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!ext) return res.status(400).json({ error: 'Format video tidak didukung (pakai MP4, MOV, atau WebM)' });
    if (data.length > MAX_VIDEO_BYTES) return res.status(413).json({ error: 'Video terlalu besar (maks 4 MB)' });
    if (data.length < 100) return res.status(400).json({ error: 'Video rusak' });
    // Bersihkan unggahan lama milik pengguna ini yang tidak jadi diposting.
    const old = (await db.prepare("SELECT * FROM uploads WHERE user_id = ? AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')").all(req.user.id));
    for (const o of old) {
      (await db.prepare('DELETE FROM uploads WHERE id = ?').run(o.id));
      await removePhoto(o.file, uploadsDir);
    }
    const file = await savePhoto(data, ext, type, uploadsDir);
    const id = randomBytes(12).toString('hex');
    (await db.prepare('INSERT INTO uploads (id, user_id, file) VALUES (?,?,?)').run(id, req.user.id, file));
    res.status(201).json({ id });
  });

  app.get('/api/posts/:id', need, async (req, res) => {
    const me = req.user.id;
    const post = await getPost(db, Number(req.params.id), me);
    if (!post) return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    const comments = (await db
      .prepare(
        `SELECT c.*, u.name, u.is_bot, u.avatar FROM comments c JOIN users u ON u.id = c.user_id
         WHERE c.post_id = ? AND u.banned = 0 AND c.user_id NOT IN (SELECT blocked_id FROM blocks WHERE user_id = ?) ORDER BY c.id`,
      )
      .all(post.id, me))
      .map((c) => ({ id: c.id, text: c.text, createdAt: c.created_at, mine: c.user_id === me, author: { id: c.user_id, name: c.name, initials: c.is_bot ? 'AI' : initials(c.name), avatar: photoUrl(c.avatar), bot: Boolean(c.is_bot) } }));
    res.json({ post, comments });
  });

  app.delete('/api/posts/:id', need, async (req, res) => {
    const p = (await db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id)));
    if (!p) return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    if (p.user_id !== req.user.id) return res.status(403).json({ error: 'Hanya pemilik yang bisa menghapus' });
    await db.batch(deletePostStmts('id = ?', [p.id]));
    await removePhoto(p.photo, uploadsDir);
    await removePhoto(p.video, uploadsDir);
    res.json({ ok: true });
  });

  const toggle = (table) => async (req, res) => {
    const id = Number(req.params.id);
    if (!(await db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id))) return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    const on = (await db.prepare(`SELECT 1 FROM ${table} WHERE user_id = ? AND post_id = ?`).get(req.user.id, id));
    if (on) (await db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND post_id = ?`).run(req.user.id, id));
    else {
      (await db.prepare(`INSERT INTO ${table} (user_id, post_id) VALUES (?,?)`).run(req.user.id, id));
      if (table === 'likes') await notify(db, push, { userId: (await db.prepare('SELECT user_id FROM posts WHERE id = ?').get(id)).user_id, type: 'like', actorId: req.user.id, postId: id, text: `${req.user.name} menyukai postinganmu`, textEn: `${req.user.name} liked your post` });
    }
    res.json({ post: (await getPost(db, id, req.user.id)) });
  };
  app.post('/api/posts/:id/like', need, toggle('likes'));
  app.post('/api/posts/:id/save', need, toggle('saves'));

  app.post('/api/posts/:id/comments', need, async (req, res) => {
    const id = Number(req.params.id);
    if (!(await getPost(db, id, req.user.id))) return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    const text = clean(req.body?.text || '', 200);
    if (text.length < 1) return res.status(400).json({ error: 'Tanggapan kosong' });
    if (isHarmful(text)) return res.status(400).json({ error: 'Tanggapan berisi saran diet berbahaya dan tidak bisa dikirim.' });
    (await db.prepare('INSERT INTO comments (post_id, user_id, text) VALUES (?,?,?)').run(id, req.user.id, text));
    const owner = (await db.prepare('SELECT user_id FROM posts WHERE id = ?').get(id)).user_id;
    await notify(db, push, { userId: owner, type: 'comment', actorId: req.user.id, postId: id, text: `${req.user.name} menanggapi postinganmu: “${clean(text, 60)}”`, textEn: `${req.user.name} replied to your post: “${clean(text, 60)}”` });
    // Beri tahu juga peserta diskusi lain (maks. 10 orang terakhir).
    const others = (await db.prepare('SELECT DISTINCT user_id FROM comments WHERE post_id = ? AND user_id NOT IN (?, ?) ORDER BY id DESC LIMIT 10').all(id, req.user.id, owner));
    for (const o of others) await notify(db, push, { userId: o.user_id, type: 'reply', actorId: req.user.id, postId: id, text: `${req.user.name} juga menanggapi diskusi yang kamu ikuti`, textEn: `${req.user.name} also replied to a discussion you're in` });
    res.status(201).json({ ok: true });
  });

  app.delete('/api/comments/:id', need, async (req, res) => {
    const c = (await db.prepare('SELECT * FROM comments WHERE id = ?').get(Number(req.params.id)));
    if (!c) return res.status(404).json({ error: 'Tanggapan tidak ditemukan' });
    if (c.user_id !== req.user.id) return res.status(403).json({ error: 'Hanya pemilik yang bisa menghapus' });
    (await db.prepare('DELETE FROM comments WHERE id = ?').run(c.id));
    res.json({ ok: true });
  });

  app.post('/api/posts/:id/report', need, async (req, res) => {
    const id = Number(req.params.id);
    const p = (await db.prepare('SELECT user_id FROM posts WHERE id = ?').get(id));
    if (!p) return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    if (p.user_id === req.user.id) return res.status(400).json({ error: 'Tidak bisa melaporkan postingan sendiri' });
    (await db.prepare('INSERT OR IGNORE INTO reports (post_id, user_id, reason) VALUES (?,?,?)').run(id, req.user.id, clean(req.body?.reason || '', 200)));
    res.json({ ok: true });
  });

  app.post('/api/users/:id/block', need, async (req, res) => {
    const id = Number(req.params.id);
    const u = (await db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    if (!u) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    if (id === req.user.id || u.is_bot) return res.status(400).json({ error: 'Pengguna ini tidak bisa diblokir' });
    (await db.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?,?)').run(req.user.id, id));
    res.json({ ok: true });
  });

  // ---------- Database makanan & konten ----------

  app.get('/api/foods', async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 50);
    const cat = String(req.query.category || '');
    const source = String(req.query.source || '');
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    let where = 'WHERE 1=1';
    const params = {};
    if (q) {
      // Semua kata harus cocok (nama Indonesia/Inggris, tag, atau kategori).
      q.split(/\s+/).slice(0, 5).forEach((w, i) => {
        const syn = SYNONYMS[w.toLowerCase()];
        where += ` AND (name LIKE :w${i} OR name_en LIKE :w${i} OR tags LIKE :w${i} OR category LIKE :w${i}${syn ? ` OR (source = 'USDA' AND name LIKE :s${i})` : ''})`;
        params[`w${i}`] = `%${w}%`;
        if (syn) params[`s${i}`] = `%${syn}%`;
      });
    }
    const rank = q ? { qs: `${q}%`, qw: `% ${q}%` } : {};
    if (cat) (where += ' AND category = :cat'), (params.cat = cat);
    if (['KancaMakan', 'TKPI', 'USDA'].includes(source)) (where += ' AND source = :source'), (params.source = source);
    // Urutan: kurasi KancaMakan → TKPI → USDA; saat mencari, nama yang diawali kata kunci lebih dulu.
    const order = q ? 'ORDER BY (name LIKE :qs) DESC, (name LIKE :qw) DESC, rank, length(name), name' : 'ORDER BY rank, name';
    const total = (await db.prepare(`SELECT count(*) n FROM foods ${where}`).get(params)).n;
    const rows = (await db.prepare(`SELECT * FROM foods ${where} ${order} LIMIT :limit OFFSET :offset`).all({ ...params, ...rank, limit, offset }));
    const counts = Object.fromEntries((await db.prepare('SELECT source, count(*) n FROM foods GROUP BY source').all()).map((r) => [r.source, r.n]));
    res.json({ foods: rows.map(rowFood), total, next: offset + rows.length < total ? offset + rows.length : null, counts });
  });

  app.get('/api/foods/:id', async (req, res) => {
    const f = (await db.prepare('SELECT * FROM foods WHERE id = ?').get(req.params.id));
    if (!f) return res.status(404).json({ error: 'Makanan tidak ditemukan' });
    const similar = (await db.prepare('SELECT * FROM foods WHERE category = ? AND id != ? ORDER BY (source = ?) DESC, random() LIMIT 6').all(f.category, f.id, f.source)).map(rowFood);
    res.json({ food: { ...rowFood(f), sourceLabel: SOURCE_LABEL[f.source] ?? f.source }, similar });
  });

  app.get('/api/content', async (_req, res) => res.json({ content: (await contentList(db, { includePremium: true })).map(({ body, ...c }) => c) }));

  app.get('/api/content/:id', async (req, res) => {
    const c = (await contentList(db, { includePremium: true })).find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Konten tidak ditemukan' });
    res.json({ content: c.premium ? { ...c, body: [] } : c });
  });

  // ---------- Tantangan ----------

  // ---------- Tantangan mingguan (disesuaikan per pengguna) ----------
  // Pengguna tidak memilih sendiri: dari semua tantangan, diambil PERSONAL_SIZE yang paling cocok dengan topik
  // profil + topik Rencana Sehatku, lalu bergiliran satu per minggu. Tantangan minggu berjalan dikunci di challenge_weeks.
  const PERSONAL_SIZE = 4;
  
  // PERBAIKAN: Gunakan fallback untuk topics dan days agar tidak undefined
  const CH = CHALLENGES.map((c, sort) => ({ 
    id: c[0], 
    title: c[1], 
    body: c[2], 
    topics: c[3] || [], 
    days: c[4] || [
      'Lakukan langkah kecil hari ini', 'Lakukan langkah kecil hari ini', 'Lakukan langkah kecil hari ini', 
      'Lakukan langkah kecil hari ini', 'Lakukan langkah kecil hari ini', 'Lakukan langkah kecil hari ini', 
      'Lakukan langkah kecil hari ini'
    ], 
    sort 
  }));

  const chById = (id) => CH.find((c) => c.id === id);
  const weekNo = (monday) => Math.floor(Date.parse(`${monday}T00:00:00Z`) / (7 * 864e5));

  /** Urutan tantangan untuk pengguna ini: paling relevan dulu (topik cocok), tantangan umum sebagai pelengkap. */
  const personalList = async (user) => {
    const plan = (await db.prepare('SELECT data FROM plans WHERE user_id = ?').get(user.id));
    const mine = new Set([...JSON.parse(user.topics || '[]'), ...(plan ? JSON.parse(plan.data).topics || [] : [])]);
    const score = (c) => (c.topics.length ? c.topics.filter((t) => mine.has(t)).length * 2 : 1);
    return [...CH].sort((a, b) => score(b) - score(a) || a.sort - b.sort).slice(0, PERSONAL_SIZE);
  };

  /** Tantangan pengguna untuk minggu yang dimulai pada `monday` (ditetapkan sekali, lalu tetap). */
  const assigned = async (user, monday) => {
    const row = (await db.prepare('SELECT challenge_id FROM challenge_weeks WHERE user_id = ? AND week = ?').get(user.id, monday));
    if (row && chById(row.challenge_id)) return chById(row.challenge_id);
    const list = await personalList(user);
    const prev = (await db.prepare('SELECT challenge_id FROM challenge_weeks WHERE user_id = ? AND week = ?').get(user.id, addDays(monday, -7)))?.challenge_id;
    let pick = list[weekNo(monday) % list.length];
    if (pick.id === prev) pick = list[(list.indexOf(pick) + 1) % list.length]; // jangan sama dengan minggu lalu
    (await db.prepare('INSERT OR IGNORE INTO challenge_weeks (user_id, week, challenge_id) VALUES (?,?,?)').run(user.id, monday, pick.id));
    return chById((await db.prepare('SELECT challenge_id FROM challenge_weeks WHERE user_id = ? AND week = ?').get(user.id, monday)).challenge_id);
  };

  /** Jadwal: minggu ini (terkunci) lalu minggu-minggu berikutnya bergiliran dari daftar personal. */
  const schedule = async (user, monday) => {
    const cur = await assigned(user, monday);
    const list = await personalList(user);
    const rest = list.filter((c) => c.id !== cur.id);
    return [cur, ...rest].map((c, k) => ({ c, start: addDays(monday, 7 * k) }));
  };
  /** Judul, deskripsi, dan aksi harian dalam bahasa permintaan. */
  const loc = (c, lang) => {
    const en = lang === 'en' && CHALLENGES_EN[c.id];
    return en ? { title: en[0], body: en[1], days: en[2] } : { title: c.title, body: c.body, days: c.days };
  };
  const withDates = (days, start) => days.map((task, i) => ({ date: addDays(start, i), task }));

  /** Senin dari minggu yang memuat tanggal ini (YYYY-MM-DD). */
  const mondayOf = (day) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const BOARD_SQL = (range) => `SELECT u.id, u.name, u.avatar, count(*) AS n, max(c.day) AS last FROM checkins c JOIN users u ON u.id = c.user_id
    WHERE ${range} AND u.banned = 0 AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE user_id = :me)
    GROUP BY u.id ORDER BY n DESC, last ASC, u.id ASC`;
  /** Papan peringkat: 10 teratas + posisimu sendiri bila di luar 10 besar. */
  const board = async (range, params) => {
    const rows = (await db.prepare(BOARD_SQL(range)).all(params));
    const out = (r, i) => ({ rank: i + 1, name: r.name, initials: initials(r.name), avatar: photoUrl(r.avatar), days: r.n, me: r.id === params.me });
    const top = rows.slice(0, 10).map(out);
    const mine = rows.findIndex((r) => r.id === params.me);
    return { top, me: mine >= 10 ? out(rows[mine], mine) : null };
  };

  app.get('/api/challenges/current', need, async (req, res) => {
    const from = String(req.query.from || '');
    if (!DAY_RE.test(from)) return res.status(400).json({ error: 'Parameter from (Senin, YYYY-MM-DD) wajib' });
    const to = addDays(from, 6);
    const me = req.user.id;
    const [cur, nxt] = await schedule(req.user, from);
    const current = cur.c;
    const L = loc(current, req.lang);
    const days = (await db.prepare('SELECT day FROM checkins WHERE user_id = ? AND challenge_id = ? AND day BETWEEN ? AND ? ORDER BY day').all(me, current.id, from, to)).map((r) => r.day);
    // Ranking minggu ini: semua check-in minggu ini (tiap orang bisa punya tantangan berbeda). Sepanjang waktu: semua check-in.
    const week = await board('c.day BETWEEN :from AND :to', { me, from, to });
    const all = await board('1 = 1', { me });
    const participants = (await db.prepare('SELECT count(DISTINCT user_id) n FROM checkins WHERE day BETWEEN ? AND ?').get(from, to)).n;
    const remind = nxt ? Boolean((await db.prepare('SELECT 1 FROM reminders WHERE user_id = ? AND challenge_id = ?').get(me, nxt.c.id))) : false;
    res.json({
      current: { id: current.id, title: L.title, body: L.body, plan: withDates(L.days, from) },
      next: nxt ? { id: nxt.c.id, title: loc(nxt.c, req.lang).title } : null,
      days,
      board: week.top,
      boardMe: week.me,
      boardAll: all.top,
      boardAllMe: all.me,
      participants,
      remind,
    });
  });

  // Daftar tantanganmu: minggu ini + jadwal berikutnya, masing-masing dengan rincian 7 hari.
  app.get('/api/challenges', need, async (req, res) => {
    const from = String(req.query.from || '');
    if (!DAY_RE.test(from)) return res.status(400).json({ error: 'Parameter from (Senin, YYYY-MM-DD) wajib' });
    const me = req.user.id;
    const out = [];
    for (const [k, { c, start }] of (await schedule(req.user, from)).entries()) {
      const people = (await db.prepare('SELECT count(DISTINCT user_id) n FROM checkins WHERE challenge_id = ?').get(c.id)).n;
      const mine = (await db.prepare('SELECT count(*) n FROM checkins WHERE user_id = ? AND challenge_id = ?').get(me, c.id)).n;
      const remind = Boolean((await db.prepare('SELECT 1 FROM reminders WHERE user_id = ? AND challenge_id = ?').get(me, c.id)));
      const L = loc(c, req.lang);
      out.push({ id: c.id, title: L.title, body: L.body, status: k === 0 ? 'active' : k === 1 ? 'next' : 'upcoming', start, end: addDays(start, 6), plan: withDates(L.days, start), people, myDays: mine, remind });
    }
    res.json({ challenges: out });
  });

  // Check-in: sekali per hari, hanya untuk tantanganmu yang berjalan pada minggu tanggal tersebut.
  app.post('/api/challenges/:id/checkin', need, async (req, res) => {
    const day = String(req.body?.day || '');
    if (!DAY_RE.test(day) || !nearToday(day)) return res.status(400).json({ error: 'Tanggal check-in tidak valid' });
    if (!chById(req.params.id)) return res.status(404).json({ error: 'Tantangan tidak ditemukan' });
    if ((await assigned(req.user, mondayOf(day))).id !== req.params.id) return res.status(400).json({ error: 'Tantangan ini bukan tantanganmu minggu ini' });
    const r = (await db.prepare('INSERT OR IGNORE INTO checkins (user_id, challenge_id, day) VALUES (?,?,?)').run(req.user.id, req.params.id, day));
    if (!r.changes) return res.status(409).json({ error: 'Kamu sudah check-in hari ini. Sampai besok!' });
    res.json({ ok: true });
  });

  app.post('/api/challenges/:id/remind', need, async (req, res) => {
    if (!chById(req.params.id)) return res.status(404).json({ error: 'Tantangan tidak ditemukan' });
    const on = (await db.prepare('SELECT 1 FROM reminders WHERE user_id = ? AND challenge_id = ?').get(req.user.id, req.params.id));
    if (on) (await db.prepare('DELETE FROM reminders WHERE user_id = ? AND challenge_id = ?').run(req.user.id, req.params.id));
    else (await db.prepare('INSERT INTO reminders (user_id, challenge_id) VALUES (?,?)').run(req.user.id, req.params.id));
    res.json({ remind: !on });
  });

  // ---------- Rencana Sehatku ----------

  app.get('/api/plan', need, async (req, res) => {
    const r = (await db.prepare('SELECT * FROM plans WHERE user_id = ?').get(req.user.id));
    res.json({ plan: r ? { ...JSON.parse(r.data), input: r.input, createdAt: r.created_at } : null, days: r ? JSON.parse(r.days) : [] });
  });

  app.put('/api/plan/days', need, async (req, res) => {
    const days = [...new Set((Array.isArray(req.body?.days) ? req.body.days : []).filter((d) => Number.isInteger(d) && d >= 0 && d < 7))];
    const r = (await db.prepare('UPDATE plans SET days = ? WHERE user_id = ?').run(JSON.stringify(days), req.user.id));
    if (!r.changes) return res.status(404).json({ error: 'Belum ada rencana' });
    res.json({ days });
  });

  // ---------- Minat fitur Premium (belum tersedia) ----------

  app.get('/api/premium', need, async (req, res) => {
    const interested = Boolean((await db.prepare("SELECT 1 FROM interest WHERE user_id = ? AND feature = 'premium'").get(req.user.id)));
    const count = (await db.prepare("SELECT count(*) n FROM interest WHERE feature = 'premium'").get()).n;
    res.json({ interested, count });
  });

  app.post('/api/premium/interest', need, async (req, res) => {
    const on = (await db.prepare("SELECT 1 FROM interest WHERE user_id = ? AND feature = 'premium'").get(req.user.id));
    if (on) (await db.prepare("DELETE FROM interest WHERE user_id = ? AND feature = 'premium'").run(req.user.id));
    else (await db.prepare("INSERT INTO interest (user_id, feature) VALUES (?, 'premium')").run(req.user.id));
    const count = (await db.prepare("SELECT count(*) n FROM interest WHERE feature = 'premium'").get()).n;
    res.json({ interested: !on, count });
  });
}
