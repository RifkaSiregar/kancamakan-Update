// Database SQLite lewat klien libSQL.
// - Lokal: file backend/data/calmates.db (atur lewat DB_PATH).
// - Online (Vercel): Turso, cukup isi TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { CONTENT } from '../data/content.js';
import { FOODS } from '../data/foods.js';
import { TIPS } from '../data/tips.js';

export const BOT_NAME = 'Asisten KancaMakan';

// Tantangan mingguan: [id, judul, deskripsi, topik terkait, 7 aksi harian (Senin–Minggu)].
// Topik kosong = cocok untuk semua orang. Tiap pengguna mendapat tantangan yang paling sesuai dengan topik & rencananya.
export const CHALLENGES = [
  ['sarapan-protein', '7 hari sarapan berprotein', 'Sarapan dengan sumber protein setiap hari (telur, tempe, tahu, susu), lalu check-in. Foto boleh dilewati.', [], [
    'Sarapan dengan telur rebus atau dadar',
    'Coba tempe atau tahu untuk sarapan',
    'Tambahkan segelas susu atau yoghurt',
    'Sarapan nasi/roti + lauk protein',
    'Siapkan sarapan malam sebelumnya',
    'Coba bubur kacang hijau atau oat dengan susu',
    'Bagikan menu sarapan favoritmu',
  ]],
  ['tanpa-minuman-manis', 'Minggu tanpa minuman manis', 'Ganti minuman manis dengan air putih atau teh tawar. Check-in setiap hari kamu berhasil.', ['Rendah gula'], [
    'Catat minuman manis yang biasa kamu minum',
    'Ganti satu minuman manis dengan air putih',
    'Pesan teh atau kopi tanpa gula',
    'Bawa botol air minum sendiri',
    'Coba infused water dari buah',
    'Lewati minuman manis saat makan siang',
    'Sehari penuh tanpa minuman manis',
  ]],
  ['tambah-sayur', 'Tambah sayur setiap makan siang', 'Pastikan ada minimal satu porsi sayur di makan siangmu, di rumah maupun di warung.', [], [
    'Tambah satu porsi sayur di makan siang',
    'Coba sayur berwarna hijau tua (bayam, kangkung)',
    'Pilih lauk berkuah sayur (sayur asem, sop)',
    'Isi setengah piring dengan sayur',
    'Coba sayur yang jarang kamu makan',
    'Tambah lalapan atau timun di makan siang',
    'Masak atau pesan menu sayur favoritmu',
  ]],
  ['jalan-kaki', 'Jalan kaki 10 menit setelah makan', 'Jalan santai sebentar setelah makan siang atau malam. Kebiasaan kecil, manfaat besar.', [], [
    'Jalan kaki 10 menit setelah makan siang',
    'Jalan kaki 10 menit setelah makan malam',
    'Pakai tangga, bukan lift, sekali hari ini',
    'Ajak teman atau keluarga jalan santai',
    'Jalan kaki ke warung atau tempat terdekat',
    'Jalan 15 menit, sedikit lebih lama',
    'Jalan santai pagi di akhir pekan',
  ]],
  ['bekal-sendiri', '7 hari bawa bekal', 'Siapkan bekal dari rumah untuk makan siang. Lebih hemat, lebih terkontrol.', ['Meal prep', 'Resep hemat'], [
    'Tulis menu bekal untuk 3 hari',
    'Belanja bahan bekal sekaligus',
    'Masak lauk untuk 2 hari sekaligus',
    'Bawa bekal nasi + lauk + sayur',
    'Siapkan sayur potong di kulkas',
    'Bawa bekal dan camilan buah',
    'Bagikan foto bekalmu ke komunitas',
  ]],
  ['camilan-cerdas', 'Minggu camilan cerdas', 'Ganti camilan gorengan dan manis dengan pilihan yang lebih mengenyangkan.', ['Camilan', 'Rendah gula'], [
    'Siapkan camilan dari rumah',
    'Ganti satu gorengan dengan buah',
    'Coba ubi, jagung, atau pisang rebus',
    'Minum air putih sebelum ngemil',
    'Coba edamame atau kacang rebus',
    'Atur jam camilan yang tetap',
    'Bagikan camilan sehat favoritmu',
  ]],
  ['protein-nabati', '7 hari protein nabati', 'Masukkan tempe, tahu, atau kacang-kacangan di menu harianmu.', ['Vegetarian', 'Resep hemat'], [
    'Tambahkan tempe di satu kali makan',
    'Coba tahu kukus atau pepes tahu',
    'Camilan kacang-kacangan',
    'Masak tempe selain digoreng',
    'Coba sayur lodeh dengan tempe',
    'Siapkan bekal tahu dan sayur',
    'Bagikan resep tempe/tahu andalanmu',
  ]],
  ['warung-seimbang', 'Makan di warung lebih seimbang', 'Tetap makan di luar, tapi pilih lauk dan porsi yang lebih seimbang.', ['Makan di luar'], [
    'Pilih lauk bakar atau kukus',
    'Tambah sayur di pesananmu',
    'Minta nasi setengah porsi',
    'Pesan teh tawar, bukan es teh manis',
    'Pilih menu berkuah bening',
    'Coba warung dengan pilihan sayur banyak',
    'Bagikan menu warung sehat favoritmu',
  ]],
  ['kurangi-gorengan', 'Minggu kurangi gorengan', 'Kurangi gorengan pelan-pelan, satu langkah setiap hari.', ['Camilan', 'Makan di luar'], [
    'Hitung gorengan yang kamu makan hari ini',
    'Kurangi satu gorengan dari biasanya',
    'Ganti lauk goreng dengan bakar/rebus',
    'Coba camilan tanpa digoreng',
    'Makan siang tanpa gorengan',
    'Masak dengan sedikit minyak (tumis/kukus)',
    'Sehari penuh tanpa gorengan',
  ]],
];

// Versi bahasa Inggris dari CHALLENGES (urutan aksi harian sama).
export const CHALLENGES_EN = {
  'sarapan-protein': ['7 days of protein breakfasts', 'Have a protein source at breakfast every day (eggs, tempeh, tofu, milk), then check in. Photos are optional.', [
    'Have a boiled egg or an omelette for breakfast',
    'Try tempeh or tofu for breakfast',
    'Add a glass of milk or yogurt',
    'Breakfast with rice/bread + a protein side',
    'Prepare breakfast the night before',
    'Try mung bean porridge or oats with milk',
    'Share your favorite breakfast',
  ]],
  'tanpa-minuman-manis': ['A week without sugary drinks', 'Swap sugary drinks for water or unsweetened tea. Check in every day you manage it.', [
    'Note the sugary drinks you usually have',
    'Swap one sugary drink for water',
    'Order tea or coffee without sugar',
    'Bring your own water bottle',
    'Try fruit-infused water',
    'Skip sugary drinks at lunch',
    'A whole day without sugary drinks',
  ]],
  'tambah-sayur': ['Add vegetables to every lunch', 'Make sure there is at least one serving of vegetables at lunch, at home or at a food stall.', [
    'Add a serving of vegetables to lunch',
    'Try a dark green vegetable (spinach, water spinach)',
    'Pick a vegetable soup side (sayur asem, sop)',
    'Fill half your plate with vegetables',
    "Try a vegetable you rarely eat",
    'Add fresh greens or cucumber to lunch',
    'Cook or order your favorite vegetable dish',
  ]],
  'jalan-kaki': ['10-minute walk after meals', 'Take a short, easy walk after lunch or dinner. A small habit with big benefits.', [
    'Walk for 10 minutes after lunch',
    'Walk for 10 minutes after dinner',
    'Take the stairs instead of the lift once today',
    'Invite a friend or family member for a walk',
    'Walk to a nearby shop or place',
    'Walk for 15 minutes, a little longer',
    'Take a relaxed morning walk on the weekend',
  ]],
  'bekal-sendiri': ['7 days of packed lunches', 'Pack lunch from home. More affordable, easier to control.', [
    'Write a lunch menu for 3 days',
    'Buy lunch ingredients in one go',
    'Cook protein sides for 2 days at once',
    'Pack rice + protein + vegetables',
    'Keep chopped vegetables in the fridge',
    'Pack lunch with a fruit snack',
    'Share a photo of your packed lunch with the community',
  ]],
  'camilan-cerdas': ['A week of smart snacks', 'Swap fried and sugary snacks for more filling options.', [
    'Prepare snacks from home',
    'Swap one fried snack for fruit',
    'Try boiled sweet potato, corn, or banana',
    'Drink water before snacking',
    'Try edamame or boiled peanuts',
    'Set a regular snack time',
    'Share your favorite healthy snack',
  ]],
  'protein-nabati': ['7 days of plant protein', 'Add tempeh, tofu, or beans to your daily meals.', [
    'Add tempeh to one meal',
    'Try steamed tofu or pepes tahu',
    'Snack on nuts or beans',
    'Cook tempeh without frying it',
    'Try sayur lodeh with tempeh',
    'Pack a lunch of tofu and vegetables',
    'Share your go-to tempeh/tofu recipe',
  ]],
  'warung-seimbang': ['More balanced food-stall meals', 'Keep eating out, but choose more balanced sides and portions.', [
    'Pick a grilled or steamed side',
    'Add vegetables to your order',
    'Ask for half a portion of rice',
    'Order unsweetened tea instead of sweet iced tea',
    'Pick a dish with clear broth',
    'Try a stall with lots of vegetable options',
    'Share your favorite healthy food-stall dish',
  ]],
  'kurangi-gorengan': ['A week of fewer fried foods', 'Cut down on fried foods slowly, one step each day.', [
    'Count the fried foods you eat today',
    'Have one fewer fried food than usual',
    'Swap a fried side for grilled/boiled',
    'Try a snack that is not fried',
    'Have lunch without fried foods',
    'Cook with little oil (stir-fry/steam)',
    'A whole day without fried foods',
  ]],
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT 'Pola makan lebih sehat',
  topics TEXT NOT NULL DEFAULT '[]',
  is_bot INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'Bagikan',
  topic TEXT NOT NULL,
  food_label TEXT NOT NULL DEFAULT '',
  food_id TEXT REFERENCES foods(id),
  text TEXT NOT NULL,
  photo TEXT,
  ai INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS posts_topic ON posts(topic);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id);
CREATE TABLE IF NOT EXISTS likes (user_id INTEGER NOT NULL, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY (user_id, post_id));
CREATE TABLE IF NOT EXISTS saves (user_id INTEGER NOT NULL, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY (user_id, post_id));
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS blocks (user_id INTEGER NOT NULL, blocked_id INTEGER NOT NULL, PRIMARY KEY (user_id, blocked_id));
CREATE TABLE IF NOT EXISTS foods (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, portion TEXT NOT NULL,
  kcal REAL, protein REAL, fat REAL, carb REAL, fiber REAL, tags TEXT NOT NULL DEFAULT '', tip TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS tips (id TEXT PRIMARY KEY, topic TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content (id TEXT PRIMARY KEY, data TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, sort INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS checkins (user_id INTEGER NOT NULL, challenge_id TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (user_id, challenge_id, day));
CREATE TABLE IF NOT EXISTS reminders (user_id INTEGER NOT NULL, challenge_id TEXT NOT NULL, PRIMARY KEY (user_id, challenge_id));
CREATE TABLE IF NOT EXISTS plans (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  input TEXT NOT NULL, data TEXT NOT NULL, days TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS interest (
  user_id INTEGER NOT NULL, feature TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, feature)
);
CREATE TABLE IF NOT EXISTS ai_log (user_id INTEGER NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_id INTEGER,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS notif_user ON notifications(user_id, id DESC);
CREATE TABLE IF NOT EXISTS login_log (ip TEXT NOT NULL, created_at INTEGER NOT NULL);
-- Konten Asisten yang dikelola admin: draf (publish_at NULL) atau terjadwal. Saat jadwal tiba, dipindah ke posts.
CREATE TABLE IF NOT EXISTS bot_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'Bagikan',
  topic TEXT NOT NULL,
  food_label TEXT NOT NULL DEFAULT '',
  food_id TEXT,
  text TEXT NOT NULL,
  ai INTEGER NOT NULL DEFAULT 0,
  publish_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Video yang sudah diunggah tapi belum dipakai di postingan (langkah 1 dari 2).
CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, file TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
-- Tantangan yang ditetapkan untuk tiap pengguna per minggu (dikunci supaya tidak berubah di tengah minggu).
CREATE TABLE IF NOT EXISTS challenge_weeks (user_id INTEGER NOT NULL, week TEXT NOT NULL, challenge_id TEXT NOT NULL, PRIMARY KEY (user_id, week));
CREATE TABLE IF NOT EXISTS mod_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, target TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
`;

// Postingan awal dari akun Asisten KancaMakan supaya beranda tidak kosong di hari pertama.
const BOT_POSTS = [
  ['Bagikan', 'Makan di luar', 'Formula warteg', 'sayur-asem', 'Formula warteg yang gampang diingat: satu lauk protein, dua sayur, nasi secukupnya. Sayur asem dan tempe bacem bisa jadi pasangan andalan. Apa kombinasi warteg favoritmu?'],
  ['Tanya', 'Rendah gula', 'Minuman manis', 'es-teh-manis', 'Siapa yang lagi mengurangi minuman manis? Ceritakan triknya di sini, misalnya pesan setengah manis atau ganti teh tawar.'],
  ['Resep', 'Resep hemat', 'Pepes tahu', 'pepes-tahu', 'Resep hemat pepes tahu: hancurkan tahu, campur telur, daun bawang, bawang putih, dan garam. Bungkus daun pisang, kukus 20 menit. Tanpa minyak!'],
  ['Bagikan', 'Meal prep', 'Stok lauk protein', 'dada-ayam-rebus', 'Tips meal prep: rebus dada ayam lalu suwir, simpan di kulkas. Bisa jadi lauk 2–3 hari, tinggal ditumis dengan bumbu berbeda.'],
  ['Tanya', 'Camilan', 'Camilan sore', 'jagung-rebus', 'Camilan sore apa yang bikin kamu kenyang sampai makan malam? Jagung rebus, pisang, atau edamame?'],
  ['Bagikan', 'Vegetarian', 'Tempe & tahu', 'tempe-kukus', 'Tempe dan tahu adalah protein nabati yang murah. Coba variasi tempe kukus atau tahu kukus dengan kecap dan cabai rawit.'],
];

/**
 * Pembungkus kecil di atas klien libSQL dengan gaya mirip node:sqlite, tetapi async:
 *   await db.prepare(sql).get(...args) / .all(...) / .run(...)
 * Argumen boleh posisi (?, ?) atau satu objek bernama (:nama).
 */
export class Db {
  constructor(client) {
    this.client = client;
  }
  static args(a) {
    if (a.length === 1 && a[0] && typeof a[0] === 'object' && !Array.isArray(a[0]) && !(a[0] instanceof Uint8Array)) {
      return Object.fromEntries(Object.entries(a[0]).filter(([, v]) => v !== undefined));
    }
    return a.map((v) => (v === undefined ? null : v));
  }
  static plain(rs) {
    return rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));
  }
  async query(sql, args = []) {
    return this.client.execute({ sql, args });
  }
  prepare(sql) {
    return {
      get: async (...a) => Db.plain(await this.query(sql, Db.args(a)))[0],
      all: async (...a) => Db.plain(await this.query(sql, Db.args(a))),
      run: async (...a) => {
        const r = await this.query(sql, Db.args(a));
        return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid === undefined ? undefined : Number(r.lastInsertRowid) };
      },
    };
  }
  exec(sql) {
    return this.client.executeMultiple(sql);
  }
  /** Jalankan banyak perintah sekaligus dalam satu transaksi: [[sql, args], ...]. */
  async batch(list, chunk = 400) {
    for (let i = 0; i < list.length; i += chunk) {
      await this.client.batch(list.slice(i, i + chunk).map(([sql, args = []]) => ({ sql, args: Db.args(Array.isArray(args) ? args : [args]) })), 'write');
    }
  }
}

/** Tambah kolom baru pada database lama (migrasi ringan). */
async function migrate(db) {
  const cols = (await db.prepare('PRAGMA table_info(foods)').all()).map((c) => c.name);
  const add = async (name, def) => !cols.includes(name) && (await db.exec(`ALTER TABLE foods ADD COLUMN ${name} ${def}`));
  await add('source', "TEXT NOT NULL DEFAULT 'KancaMakan'");
  await add('name_en', "TEXT NOT NULL DEFAULT ''");
  await add('sugar', 'REAL');
  await add('sodium', 'REAL');
  await add('rank', 'INTEGER NOT NULL DEFAULT 0');
  await db.exec('CREATE INDEX IF NOT EXISTS foods_source ON foods(source, rank, name)');

  // Postingan: video (opsional).
  const pcols = (await db.prepare('PRAGMA table_info(posts)').all()).map((c) => c.name);
  if (!pcols.includes('video')) await db.exec('ALTER TABLE posts ADD COLUMN video TEXT');

  // Akun: nama pengguna + kata sandi (opsional), status nonaktif, token push.
  const ucols = (await db.prepare('PRAGMA table_info(users)').all()).map((c) => c.name);
  const addU = async (name, def) => !ucols.includes(name) && (await db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`));
  await addU('handle', 'TEXT');
  await addU('pass_hash', 'TEXT');
  await addU('banned', 'INTEGER NOT NULL DEFAULT 0');
  await addU('push_token', 'TEXT');
  await addU('avatar', 'TEXT');
  await addU('lang', "TEXT NOT NULL DEFAULT 'id'"); // bahasa aplikasi terakhir (untuk teks push)
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_handle ON users(handle) WHERE handle IS NOT NULL');
  await db.exec('CREATE INDEX IF NOT EXISTS foods_category ON foods(category)');
  await db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

  // Ganti nama aplikasi CalMates → KancaMakan pada data lama.
  await db.exec("UPDATE foods SET source = 'KancaMakan' WHERE source = 'CalMates'");
  await db.prepare("UPDATE users SET name = ? WHERE is_bot = 1 AND name = 'Asisten CalMates'").run(BOT_NAME);
}

/** Tag otomatis dari nilai gizi per 100 g (acuan klaim BPOM yang disederhanakan). */
function autoTags(name, cat, p, f, c, fiber, sugar) {
  const t = [];
  if (p >= 12) t.push('tinggi protein');
  if (fiber != null && fiber >= 6) t.push('tinggi serat');
  if (f != null && f <= 3 && cat !== 'Minuman') t.push('rendah lemak');
  if (sugar != null && sugar >= 22.5) t.push('manis');
  if (/goreng|fried/i.test(name)) t.push('digoreng');
  if (/mentah|raw|kering|dried/i.test(name)) t.push('bahan mentah');
  return t.join(',');
}

/** Data makanan dari sumber terbuka (dibuat oleh scripts/import-foods.mjs). */
// Dibaca dengan path tetap (bukan template) supaya file ikut terbawa saat di-deploy ke Vercel.
const tryRead = (read) => {
  try {
    return read();
  } catch {
    return null;
  }
};
const EXTRA = [
  [() => tryRead(() => readFileSync(new URL('../data/foods_tkpi.json', import.meta.url), 'utf8')), 'TKPI', 1],
  [() => tryRead(() => readFileSync(new URL('../data/foods_usda.json', import.meta.url), 'utf8')), 'USDA', 2],
];

/** Alamat database: Turso (online) atau file lokal. */
export function dbUrl(path) {
  if (path === ':memory:') return ':memory:';
  if (!path && process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  if (!path && process.env.VERCEL) throw new Error('TURSO_DATABASE_URL belum diatur di Environment Variables Vercel.');
  const file = path || process.env.DB_PATH || new URL('../data/calmates.db', import.meta.url).pathname;
  if (/^(libsql|https?|wss?|file):/.test(file)) return file;
  const abs = isAbsolute(file) ? file : resolve(file);
  mkdirSync(dirname(abs), { recursive: true });
  return `file:${abs}`;
}

/**
 * Buka database, buat tabel, migrasi, dan isi data awal.
 * Data referensi (ribuan makanan) hanya ditulis ulang bila isinya berubah (versi disimpan di tabel meta),
 * sehingga server online tidak mengisi ulang setiap kali menyala.
 */
export function connectDb(path) {
  const url = dbUrl(path);
  const remote = !url.startsWith('file:') && url !== ':memory:';
  const db = new Db(createClient({ url, authToken: remote ? process.env.TURSO_AUTH_TOKEN : undefined }));
  db.url = url;
  db.remote = remote;
  return db;
}

export async function initDb(db, { seedData = true } = {}) {
  if (db.url.startsWith('file:')) await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec(SCHEMA);
  await migrate(db);
  // Database online (Turso) yang sudah terisi tidak diisi ulang otomatis: jalankan `npm run seed` dari laptop bila data makanan berubah.
  if (seedData) {
    const seeded = db.remote && (await db.prepare("SELECT value FROM meta WHERE key = 'seed'").get());
    if (!seeded) await seed(db);
  }
  return db;
}

export async function openDb(path, opts) {
  return initDb(connectDb(path), opts);
}

/** Versi data referensi: berubah otomatis bila isi file data berubah. */
function seedVersion() {
  const h = createHash('sha1').update(JSON.stringify([FOODS, TIPS, CONTENT, CHALLENGES, BOT_POSTS]));
  for (const [read] of EXTRA) h.update(read() ?? '');
  return h.digest('hex').slice(0, 16);
}

/** Isi data referensi (bila berubah) dan konten awal (hanya sekali). */
export async function seed(db, { force = false } = {}) {
  const version = seedVersion();
  const cur = await db.prepare("SELECT value FROM meta WHERE key = 'seed'").get();
  const stmts = [];
  if (force || cur?.value !== version) {
    const F = `INSERT INTO foods (id,name,category,portion,kcal,protein,fat,carb,fiber,tags,tip) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, portion=excluded.portion, kcal=excluded.kcal,
      protein=excluded.protein, fat=excluded.fat, carb=excluded.carb, fiber=excluded.fiber, tags=excluded.tags, tip=excluded.tip`;
    for (const r of FOODS) stmts.push([F, r]);
    stmts.push(["UPDATE foods SET source = 'KancaMakan', rank = 0 WHERE id IN (" + FOODS.map(() => '?').join(',') + ')', FOODS.map((r) => r[0])]);

    // Ribuan makanan tambahan (TKPI & USDA), nilai per 100 g.
    const X = `INSERT INTO foods (id,name,name_en,category,portion,kcal,protein,fat,carb,fiber,sugar,sodium,tags,tip,source,rank)
      VALUES (?,?,?,?,'100 g',?,?,?,?,?,?,?,?,'',?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_en=excluded.name_en, category=excluded.category, kcal=excluded.kcal,
      protein=excluded.protein, fat=excluded.fat, carb=excluded.carb, fiber=excluded.fiber, sugar=excluded.sugar, sodium=excluded.sodium,
      tags=excluded.tags, source=excluded.source, rank=excluded.rank`;
    for (const [read, source, rank] of EXTRA) {
      const raw = read();
      if (!raw) continue;
      for (const [id, name, en, cat, kcal, p, fat, carb, fiber, sugar, na] of JSON.parse(raw)) {
        stmts.push([X, [id, name, source === 'USDA' ? '' : en, cat, kcal, p ?? 0, fat ?? 0, carb ?? 0, fiber, sugar, na, autoTags(`${name} ${en}`, cat, p ?? 0, fat, carb, fiber, sugar), source, rank]]);
      }
    }
    for (const r of TIPS) stmts.push(['INSERT INTO tips (id,topic,title,body) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET topic=excluded.topic, title=excluded.title, body=excluded.body', r]);
    CONTENT.forEach((x, i) => stmts.push(['INSERT INTO content (id,data,sort) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, sort=excluded.sort', [x.id, JSON.stringify(x), i]]));
    CHALLENGES.forEach(([id, title, body], i) => stmts.push(['INSERT INTO challenges (id,title,body,sort) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, body=excluded.body, sort=excluded.sort', [id, title, body, i]]));
    stmts.push(["INSERT INTO meta (key, value) VALUES ('seed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [version]]);
    await db.batch(stmts);
  }

  if (!(await db.prepare('SELECT id FROM users WHERE is_bot = 1').get())) {
    const r = await db.prepare("INSERT INTO users (name, is_bot, goal) VALUES (?, 1, 'Pola makan lebih sehat')").run(BOT_NAME);
    const P = "INSERT INTO posts (user_id, kind, topic, food_label, food_id, text, created_at) VALUES (?,?,?,?,?,?, strftime('%Y-%m-%dT%H:%M:%fZ','now', ?))";
    await db.batch(BOT_POSTS.map(([kind, topic, label, foodId, text], i) => [P, [r.lastInsertRowid, kind, topic, label, foodId, text, `-${(BOT_POSTS.length - i) * 3} hours`]]));
  }
  return { seeded: stmts.length };
}

const botCache = new WeakMap();
export async function botId(db) {
  if (!botCache.has(db)) botCache.set(db, (await db.prepare('SELECT id FROM users WHERE is_bot = 1').get()).id);
  return botCache.get(db);
}
