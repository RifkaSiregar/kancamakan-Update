// Agent onboarding: satu input dari pengguna → "Rencana Sehatku" berisi modul interaktif.
// Ide menu & bacaan diambil dari database (foods, content). Keluaran AI selalu divalidasi.
import { TOPICS, clean, extractJson, isSafe } from './content.js';
import { contentList, findFoods, foodsForPrompt, tipsFor, tipsForPrompt } from './knowledge.js';
import { FOOD_NAMES_EN } from '../data/foods.js';

// Harus sama dengan GOALS di mobile/src/data/sample.ts
export const GOALS = ['Menurunkan berat badan', 'Menjaga berat badan', 'Pola makan lebih sehat'];
export const MEALS = ['Sarapan', 'Makan siang', 'Makan malam', 'Camilan'];

export const MIN_INPUT = 5;
export const MAX_INPUT = 300;

// Sinyal yang perlu disikapi dengan hati-hati (kemungkinan pola makan tidak sehat/gangguan makan).
const CARE = [
  /muntah/i,
  /(tidak|tak|ga|gak|nggak|enggak)\s+(mau\s+)?makan\s+(sama\s+sekali|seharian|berhari|apa[- ]?apa)/i,
  /kurus\s+(banget|sekali|kering)/i,
  /puasa\s+(\d+|beberapa|berhari)/i,
  /(obat|pil)\s+(diet|pelangsing|pencahar)/i,
  /pencahar|laksatif|anoreksia|bulimia|binge/i,
  /(benci|jijik)\s+(sama|dengan|pada)?\s*(tubuh|badan|diri)/i,
  /makan\s+(banyak|berlebihan)\s+(lalu|terus|trus)\s+(nyesel|menyesal|muntah)/i,
  // Padanan bahasa Inggris.
  /\b(throw(ing)?\s+up|vomit(ing)?|purg(e|ing))\b/i,
  /\b(not|stop|don'?t)\s+eat(ing)?\s+(at\s+all|anything|for\s+days|all\s+day)/i,
  /\bstarv(e|ing)\b/i,
  /\bfast(ing)?\s+(for\s+)?(\d+|several|many)\s+days\b/i,
  /\b(diet|slimming)\s+pills?\b|\blaxatives?\b/i,
  /\b(anorexi|bulimi|binge)/i,
  /\b(hate|disgusted\s+(by|with))\s+my\s+(body|self)\b/i,
  /\b(super|really|extremely)\s+skinny\b/i,
];
export const needsCare = (input) => CARE.some((re) => re.test(String(input || '')));

const has = (s, ...w) => w.some((x) => s.includes(x));

/** Tebak topik dari cerita pengguna (dipakai untuk mencari data relevan & mode tanpa AI). */
export function guessTopics(raw) {
  const s = String(raw || '').toLowerCase();
  const t = [];
  // Kata kunci Indonesia + Inggris (cerita bisa ditulis dalam dua bahasa).
  if (has(s, 'warteg', 'kantor', 'warung', 'makan di luar', 'jajan', 'padang', 'kantin', 'office', 'eat out', 'eating out', 'food stall', 'canteen', 'takeout')) t.push('Makan di luar');
  if (has(s, 'gula', 'manis', 'kopi', 'teh', 'boba', 'diabetes', 'sugar', 'sweet', 'coffee', 'tea', 'soda')) t.push('Rendah gula');
  if (has(s, 'vegetarian', 'vegan', 'tidak makan daging', 'nabati', 'plant-based', 'no meat')) t.push('Vegetarian');
  if (has(s, 'camil', 'ngemil', 'snack', 'gorengan', 'fried')) t.push('Camilan');
  if (has(s, 'kos', 'hemat', 'murah', 'budget', 'mahasiswa', 'student', 'cheap', 'boarding')) t.push('Resep hemat');
  if (has(s, 'bekal', 'masak', 'meal prep', 'anak', 'keluarga', 'sibuk', 'cook', 'kids', 'family', 'busy', 'lunchbox')) t.push('Meal prep');
  return t.length ? t.slice(0, 3) : ['Meal prep'];
}

export function guessGoal(raw, care) {
  const s = String(raw || '').toLowerCase();
  if (care) return GOALS[2];
  if (has(s, 'turun', 'langsing', 'diet', 'kurus', 'berat badan', 'gemuk', 'lose weight', 'weight loss', 'slim')) return GOALS[0];
  if (has(s, 'jaga', 'pertahan', 'stabil', 'maintain', 'keep my weight')) return GOALS[1];
  return GOALS[2];
}

/** Kumpulkan data dari database untuk prompt agent. */
export async function planContext(db, input) {
  const topics = guessTopics(input);
  const foods = await findFoods(db, { text: input, topic: topics[0], limit: 14, excludeFried: true });
  for (const f of await findFoods(db, { topic: topics[1] || 'Meal prep', limit: 6, excludeFried: true })) if (!foods.some((x) => x.id === f.id)) foods.push(f);
  const tips = await tipsFor(db, topics[0], 5);
  const content = await contentList(db);
  return { topics, foods, tips, content };
}

export function systemPlan({ foods, tips, content }) {
  return `Kamu adalah agent onboarding aplikasi komunitas makan sehat untuk orang Indonesia.
Pengguna menulis SATU kalimat tentang dirinya. Susun "Rencana Sehatku" yang personal, ramah, dan realistis.

Aturan WAJIB:
- Bahasa Indonesia santai dan menyemangati.
- Ide menu HARUS memakai makanan dari DATA MAKANAN (isi food_id). Fakta makanan hanya dari DATA.
- Jangan menulis angka berat badan, target turun berat badan, angka kalori, atau porsi dalam gram.
- Jangan menyarankan diet ekstrem, melewatkan makan, puasa berhari-hari, obat/suplemen pelangsing.
- Jangan membuat klaim medis. Jika pengguna menyebut penyakit/kehamilan, sarankan konsultasi dokter di "summary".
- Tantangan 7 hari berupa kebiasaan kecil bertahap (satu aksi per hari), bukan larangan keras.

DATA MAKANAN (id | nama | perkiraan gizi | tag | tips):
${foodsForPrompt(foods)}

DATA TIPS:
${tipsForPrompt(tips)}

DATA BACAAN/VIDEO (id: judul):
${content.map((c) => `- ${c.id} (${c.type}): ${c.title}`).join('\n')}

Pilihan yang diizinkan: goal = ${GOALS.join(' | ')}; topics (1–3) dari: ${TOPICS.join(', ')}; meals[].meal = ${MEALS.join(' | ')}.

Jawab HANYA dengan JSON:
{"goal":"...","topics":["..."],"summary":"maks 200 karakter, sapa dan rangkum kondisi pengguna",
"challenge":{"title":"maks 45 karakter","days":["7 aksi harian, masing-masing maks 70 karakter"]},
"meals":[{"meal":"Sarapan","food_id":"id","idea":"ide menu maks 80 karakter"},{"meal":"Makan siang","food_id":"id","idea":"..."},{"meal":"Makan malam","food_id":"id","idea":"..."}],
"picks":["2–3 id bacaan/video"]}`;
}

const strList = (arr, max, n) =>
  (Array.isArray(arr) ? arr : [])
    .filter((x) => typeof x === 'string')
    .map((x) => clean(x, max))
    .filter((x) => x.length >= 3 && isSafe(x))
    .slice(0, n);

/** Validasi rencana dari AI. Mengembalikan null bila tidak layak dipakai. */
export function parsePlan(text, { care = false, foodIds = [], contentIds = [] } = {}) {
  const j = extractJson(text);
  if (!j || typeof j !== 'object') return null;

  const summary = clean(j.summary || '', 220);
  const days = strList(j.challenge?.days, 80, 7);
  if (!summary || !isSafe(summary) || days.length < 5) return null;
  while (days.length < 7) days.push('Ulangi kebiasaan favoritmu minggu ini.');

  const topics = [...new Set((Array.isArray(j.topics) ? j.topics : []).filter((t) => TOPICS.includes(t)))].slice(0, 3);
  const meals = (Array.isArray(j.meals) ? j.meals : [])
    .filter((m) => m && MEALS.includes(m.meal) && typeof m.idea === 'string')
    .map((m) => ({ meal: m.meal, idea: clean(m.idea, 90), food_id: foodIds.includes(m.food_id) ? m.food_id : null }))
    .filter((m) => m.idea.length >= 3 && isSafe(m.idea))
    .slice(0, 3);
  const picks = [...new Set((Array.isArray(j.picks) ? j.picks : []).filter((p) => contentIds.includes(p)))].slice(0, 3);

  return {
    goal: care ? GOALS[2] : GOALS.includes(j.goal) ? j.goal : GOALS[2],
    topics: topics.length ? topics : ['Meal prep'],
    summary,
    challenge: { title: clean(j.challenge?.title || '7 hari kebiasaan sehat', 50) || '7 hari kebiasaan sehat', days },
    meals,
    picks: picks.length ? picks : contentIds.slice(0, 2),
    care,
  };
}

// ---------- rencana tanpa AI (bila ANTHROPIC_API_KEY belum diatur) ----------

const CHALLENGE_RULES = {
  'Makan di luar': ['7 hari makan di luar lebih seimbang', ['Tambah satu sayur setiap makan siang', 'Pilih lauk bakar atau kukus sekali hari ini', 'Minta nasi setengah porsi', 'Ganti es teh manis dengan teh tawar', 'Jalan kaki 10 menit setelah makan siang', 'Bawa bekal dari rumah sekali', 'Bagikan menu warung favoritmu ke komunitas']],
  'Rendah gula': ['7 hari pelan-pelan kurangi gula', ['Catat minuman manis yang kamu minum hari ini', 'Pesan minuman setengah manis', 'Siapkan botol air putih di meja', 'Ganti satu minuman manis dengan air putih', 'Coba kopi atau teh tanpa gula tambahan', 'Pilih buah untuk camilan manis', 'Ceritakan progresmu ke komunitas']],
  Vegetarian: ['7 hari protein nabati', ['Masukkan tempe atau tahu di satu makan', 'Coba resep tempe selain digoreng', 'Tambah kacang-kacangan di camilan', 'Makan sayur dua warna hari ini', 'Coba sayur lodeh atau sayur asem', 'Siapkan bekal sayur dan tahu', 'Bagikan resep andalanmu']],
  Camilan: ['7 hari camilan lebih mengenyangkan', ['Siapkan camilan dari rumah', 'Ganti satu gorengan dengan buah', 'Coba jagung atau ubi rebus', 'Minum air putih sebelum ngemil', 'Coba edamame atau telur rebus', 'Atur jam camilan yang tetap', 'Bagikan camilan favoritmu']],
  'Resep hemat': ['7 hari sehat dengan budget tipis', ['Belanja tempe, tahu, dan telur untuk seminggu', 'Masak satu menu untuk dua kali makan', 'Tambah sayur murah seperti kangkung atau sawi', 'Coba orak-arik telur sayur', 'Bawa air minum sendiri', 'Masak sup sayur sekali banyak', 'Bagikan menu hematmu ke komunitas']],
  'Meal prep': ['7 hari mulai meal prep', ['Tulis tiga menu yang ingin kamu siapkan', 'Belanja bahan untuk tiga hari', 'Masak lauk protein sekali banyak', 'Siapkan sayur potong di kulkas', 'Bawa bekal ke kantor atau kampus', 'Coba satu resep baru', 'Bagikan foto bekalmu ke komunitas']],
};
const CARE_CHALLENGE = ['7 hari makan teratur dan tenang', ['Makan pagi, siang, dan malam di jam yang sama', 'Makan pelan tanpa sambil main HP', 'Tulis satu makanan yang kamu nikmati hari ini', 'Siapkan camilan yang kamu suka', 'Makan bersama teman atau keluarga sekali', 'Istirahat cukup malam ini', 'Ceritakan perasaanmu ke orang yang kamu percaya']];

// Versi bahasa Inggris (rencana tanpa AI saat aplikasi berbahasa Inggris).
const CHALLENGE_RULES_EN = {
  'Makan di luar': ['7 days of more balanced eating out', ['Add a vegetable to every lunch', 'Pick a grilled or steamed side once today', 'Ask for half a portion of rice', 'Swap sweet iced tea for unsweetened tea', 'Walk for 10 minutes after lunch', 'Bring a packed lunch from home once', 'Share your favorite food stall with the community']],
  'Rendah gula': ['7 days of slowly cutting sugar', ['Note the sugary drinks you have today', 'Order a half-sweet drink', 'Keep a water bottle on your desk', 'Swap one sugary drink for water', 'Try coffee or tea with no added sugar', 'Pick fruit for a sweet snack', 'Share your progress with the community']],
  Vegetarian: ['7 days of plant protein', ['Add tempeh or tofu to one meal', 'Try a tempeh recipe that is not fried', 'Add nuts to your snack', 'Eat vegetables of two colors today', 'Try sayur lodeh or sayur asem', 'Pack a lunch of vegetables and tofu', 'Share your go-to recipe']],
  Camilan: ['7 days of more filling snacks', ['Prepare snacks from home', 'Swap one fried snack for fruit', 'Try boiled corn or sweet potato', 'Drink water before snacking', 'Try edamame or a boiled egg', 'Set a regular snack time', 'Share your favorite snack']],
  'Resep hemat': ['7 days of healthy eating on a budget', ['Buy tempeh, tofu, and eggs for the week', 'Cook one dish for two meals', 'Add cheap vegetables like water spinach or mustard greens', 'Try scrambled eggs with vegetables', 'Bring your own drinking water', 'Cook a big batch of vegetable soup', 'Share your budget menu with the community']],
  'Meal prep': ['7 days of starting meal prep', ['Write down three dishes you want to prepare', 'Buy ingredients for three days', 'Cook a big batch of protein', 'Keep chopped vegetables in the fridge', 'Bring a packed lunch to work or campus', 'Try one new recipe', 'Share a photo of your packed lunch with the community']],
};
const CARE_CHALLENGE_EN = ['7 days of regular, calm meals', ['Eat breakfast, lunch, and dinner at the same times', 'Eat slowly without your phone', 'Write down one food you enjoyed today', 'Prepare a snack you like', 'Eat together with friends or family once', 'Get enough rest tonight', 'Share how you feel with someone you trust']];

export async function rulePlan(db, input, name = '', lang = 'id') {
  const en = lang === 'en';
  const nm = (f) => (en ? FOOD_NAMES_EN[f.id] || f.name : f.name);
  const care = needsCare(input);
  const { topics, content } = await planContext(db, input);
  const main = topics[0];
  const pick = async (cats, tag) =>
    (await db.prepare(`SELECT * FROM foods WHERE category IN (${cats.map(() => '?').join(',')}) AND tags NOT LIKE '%digoreng%' AND tags NOT LIKE '%manis%' ${tag ? "AND tags LIKE ?" : ''} ORDER BY random() LIMIT 1`).get(...cats, ...(tag ? [`%${tag}%`] : [])));
  const breakfast = (await pick(['Makanan pokok', 'Lauk hewani'], 'sarapan')) || (await pick(['Lauk hewani']));
  const lunch = main === 'Makan di luar' ? await pick(['Hidangan warung'], 'sayur') : await pick(['Lauk nabati', 'Lauk hewani']);
  const veg = await pick(['Sayur']);
  const dinner = await pick(['Lauk nabati']);
  const meals = (
    en
      ? [
          breakfast && { meal: 'Sarapan', food_id: breakfast.id, idea: `${nm(breakfast)}${breakfast.category === 'Makanan pokok' ? ' with a boiled egg' : ' and whole wheat bread'}` },
          lunch && { meal: 'Makan siang', food_id: lunch.id, idea: lunch.category === 'Hidangan warung' ? `${nm(lunch)} with extra vegetables` : `Rice, ${nm(lunch).toLowerCase()}, and ${veg ? nm(veg).toLowerCase() : 'vegetables'}` },
          dinner && { meal: 'Makan malam', food_id: dinner.id, idea: `${nm(dinner)} with ${veg ? nm(veg).toLowerCase() : 'a clear vegetable soup'}` },
        ]
      : [
          breakfast && { meal: 'Sarapan', food_id: breakfast.id, idea: `${breakfast.name}${breakfast.category === 'Makanan pokok' ? ' dengan telur rebus' : ' dan roti gandum'}` },
          lunch && { meal: 'Makan siang', food_id: lunch.id, idea: lunch.category === 'Hidangan warung' ? `${lunch.name}, ${lunch.tip.charAt(0).toLowerCase()}${lunch.tip.slice(1)}` : `Nasi, ${lunch.name.toLowerCase()}, dan ${veg ? veg.name.toLowerCase() : 'sayur'}` },
          dinner && { meal: 'Makan malam', food_id: dinner.id, idea: `${dinner.name} dengan ${veg ? veg.name.toLowerCase() : 'sayur bening'}` },
        ]
  ).filter(Boolean).map((m) => ({ ...m, idea: clean(m.idea, 90) }));
  const picks = content.filter((c) => topics.includes(c.topic)).map((c) => c.id);
  for (const id of ['piring-seimbang', 'video-sarapan', 'camilan-kenyang']) if (picks.length < 3 && !picks.includes(id)) picks.push(id);
  const [title, days] = care ? (en ? CARE_CHALLENGE_EN : CARE_CHALLENGE) : (en ? CHALLENGE_RULES_EN : CHALLENGE_RULES)[main];
  const goal = guessGoal(input, care);
  const hi = en ? (name ? `Hi ${name}! ` : 'Hi! ') : name ? `Halo ${name}! ` : 'Halo! ';
  const TOPIC_EN = { 'Makan di luar': 'eating out', 'Rendah gula': 'cutting sugar', Vegetarian: 'plant-based eating', Camilan: 'snacks', 'Resep hemat': 'budget meals', 'Meal prep': 'meal prep' };
  return {
    goal,
    topics,
    summary: en
      ? care
        ? `${hi}Thank you for sharing. Let's start with regular meals and feeling comfortable with food. If it feels heavy, talking to a health professional can really help.`
        : `${hi}From your story, let's start with ${TOPIC_EN[main]} in small, realistic steps. No need to count numbers, just stay consistent.`
      : care
      ? `${hi}Terima kasih sudah cerita. Kita mulai dari makan teratur dan merasa nyaman dengan makanan. Kalau terasa berat, bicara dengan tenaga kesehatan bisa sangat membantu.`
      : `${hi}Dari ceritamu, kita mulai dari ${main.toLowerCase()} dengan langkah kecil yang realistis. Tidak perlu menghitung angka, cukup konsisten.`,
    challenge: { title, days: [...days] },
    meals,
    picks: picks.slice(0, 3),
    care,
  };
}

export function validatePlanInput(body) {
  const { input } = body || {};
  if (typeof input !== 'string' || input.trim().length < MIN_INPUT) return 'Ceritakan sedikit tentang dirimu dulu';
  if (input.length > MAX_INPUT) return 'Tulisan terlalu panjang';
  return null;
}
