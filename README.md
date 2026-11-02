# KancaMakan

MVP aplikasi **komunitas diet dan hidup sehat** (React Native + Expo SDK 58) dengan backend sendiri (Express + **SQLite**) dan fitur AI (Claude) yang memakai **database makanan dan tips hidup sehat**.

- **Gratis, langsung dipakai:** komunitas, Rencana Sehatku (agent AI), tantangan mingguan, dan database makanan.
- **Premium belum tersedia.** Fiturnya hanya ditampilkan lewat demo, dan pengguna bisa mendaftarkan minat (tersimpan di database).

## Menjalankan (2 terminal)

Butuh **Node.js 22.13 atau lebih baru** (versi LTS 22/24 dari https://nodejs.org).

**Terminal 1: backend dan database**

```bash
cd backend
npm install
cp .env.example .env     # opsional: isi ANTHROPIC_API_KEY untuk AI sungguhan
npm run dev              # http://localhost:3000 → cek http://localhost:3000/health
```

Database dibuat otomatis di `backend/data/calmates.db` dan langsung berisi data awal: 74 makanan, 22 tips, 9 konten, 4 tantangan, dan beberapa postingan dari Asisten KancaMakan. Foto unggahan disimpan di `backend/data/uploads/`. Untuk mereset, hapus kedua lokasi itu lalu jalankan ulang backend.

**Terminal 2: aplikasi**

```bash
cd mobile
npm ci                   # wajib dijalankan ulang setelah update (ada paket font baru)
npx expo start --web -c  # browser; atau `npx expo start -c` lalu scan QR dengan Expo Go
```

Aplikasi otomatis memanggil backend di komputer yang menjalankan Expo, pada port 3000. Tidak ada yang perlu diatur:
- **Web:** `http://localhost:3000`
- **HP (Expo Go):** `http://<IP laptop>:3000`. HP dan laptop harus di Wi-Fi yang sama. Kalau macOS menanyakan izin koneksi masuk untuk `node`, pilih **Allow**.

Kalau backend sudah di-deploy, isi `extra.apiUrl` di `mobile/app.json` (misalnya `https://api.kancamakan.id`), lalu jalankan ulang dengan `-c`.

> Jangan jalankan `npx expo install --fix`, `npm install expo`, atau `npm update` tanpa alasan khusus, karena bisa mengganti versi Expo. Cek dengan `grep '"expo"' mobile/package.json`: hasilnya harus `~58.0.20`.

### Tanpa API key

Semua fitur tetap jalan. Fitur AI memakai **generator berbasis database** (tips, info makanan, dan aturan), bukan Claude. Setelah `ANTHROPIC_API_KEY` diisi di `backend/.env` dan backend dijalankan ulang, konten dibuat oleh Claude. Label di aplikasi menyesuaikan ("Asisten · AI" vs "Asisten").

## Desain

Konsep **"Dapur Nusantara"**: hangat, segar, dan menggugah selera.
- **Warna** (`mobile/src/theme.ts`): hijau daun pisang `#12724F`, kunyit `#F5B82E` (pencapaian & aksi AI), cabai `#E5484D` (suka), latar hijau-mint `#F2F7F4`.
- **Huruf:** Plus Jakarta Sans (typeface yang dirancang untuk Jakarta), dimuat lewat `@expo-google-fonts/plus-jakarta-sans`. Semua teks memakai `components/Text.tsx`, yang otomatis memilih file font sesuai ketebalan.
- **Kedalaman:** bayangan berwarna hijau lewat `shadow(level)`, radius bertingkat (hero 28 → kartu 22 → ubin 18 → tombol 16), header melengkung dengan kartu yang menumpuk di atasnya, dan tab bar mengambang dengan tombol posting di tengah.
- **Prinsip UI/UX:** target sentuh minimal 44 px, umpan balik saat ditekan (`Tap`), skeleton loading, emoji topik dan makanan untuk pemindaian cepat, keadaan kosong yang mengajak bertindak, satu animasi di layar pembuka yang menghormati pengaturan "kurangi gerakan", dan cincin fokus yang terlihat untuk pengguna keyboard.

## Fitur

| Fitur | Layar | Data |
|---|---|---|
| Daftar (nama, nama pengguna, kata sandi) + Rencana dengan AI atau manual dalam satu halaman · Masuk | `onboarding/register.tsx`, `onboarding/login.tsx` | `users`, `sessions` (token di HP) |
| Foto profil (galeri/kamera), tampil di postingan & tanggapan | `(tabs)/profile.tsx` | `users.avatar`, `data/uploads` |
| **Rencana Sehatku**: satu kalimat → agent menyusun tujuan, topik, tantangan 7 hari, ide menu (dari database makanan), serta bacaan/video | `onboarding/agent.tsx`, `plan.tsx` | `plans`, `foods`, `content` |
| Beranda komunitas: filter topik, paginasi, tarik untuk memuat ulang | `(tabs)/home.tsx` | `posts`, `likes`, `saves`, `comments` |
| Buat postingan: foto (diunggah ke server), tag makanan dari database, **bantu tulis AI** | `compose.tsx` | `posts`, `data/uploads` |
| Detail postingan: tanggapan, **saran tanggapan AI**, hapus milik sendiri, lapor, blokir | `post/[id].tsx` | `comments`, `reports`, `blocks` |
| **Konten AI dikelola admin**: buat draf dengan AI (dari database makanan & tips) atau tulis sendiri, edit, jadwalkan, terbitkan atas nama Asisten KancaMakan | Dasbor `/admin` → tab Konten AI | `bot_queue`, akun bot `Asisten KancaMakan` |
| **Database makanan**: cari, kategori, perkiraan gizi, tips, diskusi terkait | `(tabs)/foods.tsx`, `food/[id].tsx` | `foods` |
| Tantangan mingguan **disesuaikan per pengguna** (dari topik profil & Rencana Sehatku, bergiliran, minggu berjalan dikunci), rincian 7 hari, check-in sekali sehari, ranking (minggu ini & sepanjang waktu), daftar tantangan, pengingat | `(tabs)/challenges.tsx` | `challenge_weeks`, `checkins`, `reminders` (data tantangan: `CHALLENGES` di `backend/lib/db.js`) |
| Pencarian postingan & makanan | `explore.tsx` | |
| Profil: ubah nama/tujuan/topik, statistik, postinganku/tersimpan, keluar, **hapus akun** | `(tabs)/profile.tsx`, `my.tsx` | |
| **Premium (segera hadir)**: demo cara kerja + "Saya tertarik" | `promo.tsx`, `demo.tsx`, `waitlist.tsx` | `interest` |
| Aturan komunitas | `rules.tsx` | |

### AI yang membumi ke database

Setiap permintaan AI (`backend/lib/ai.js`) berjalan begini:
1. Ambil data yang relevan dari database (`lib/knowledge.js`): makanan dicocokkan berdasarkan kata dan topik, ditambah tips per topik dan daftar konten.
2. Kirim data itu di prompt sebagai **DATA MAKANAN** / **DATA TIPS**, dengan aturan: fakta hanya boleh diambil dari data ini.
3. Validasi keluaran: `food_id` harus ada di tabel `foods`, topik dan jenis harus valid, panjang teks dibatasi, dan pola berbahaya disaring (`isSafe`).
4. Batas pemakaian AI per pengguna per jam. Postingan AI selalu atas nama akun **Asisten KancaMakan**, tidak pernah menyamar sebagai anggota.

### Moderasi & keamanan

- Postingan dan tanggapan yang mempromosikan diet berbahaya (obat pelangsing, memuntahkan makanan, puasa ekstrem) ditolak server (`isHarmful`).
- Postingan yang dilaporkan langsung disembunyikan untuk pelapornya, dan disembunyikan untuk semua orang setelah dilaporkan 3 orang.
- **Sinyal berisiko** di cerita onboarding (misalnya "kurus banget", "muntahin makanan") membuat rencana diarahkan ke makan teratur, tanpa target berat badan, disertai kartu dukungan. Daftar polanya ada di `backend/lib/agent.js` dan perlu ditinjau ahli sebelum rilis.
- Pengguna bisa menghapus akun beserta seluruh datanya (wajib di Play Store/App Store).

## Dua bahasa (Indonesia / English)

- Bahasa awal mengikuti bahasa HP; bisa diganti di halaman awal (ID/EN) dan di **Profil → Bahasa**.
- **Aplikasi:** `t('teks Indonesia')` dari `mobile/src/i18n`. Teks Indonesia sekaligus kuncinya; terjemahan Inggris ada di `mobile/src/i18n/en.ts`. Teks yang belum diterjemahkan tampil dalam bahasa Indonesia. Cek kelengkapan: `npm run check:i18n` (di folder `mobile/`).
- **Server:** aplikasi mengirim `Accept-Language`. Pesan error diterjemahkan di `backend/lib/i18n.js`, tantangan punya versi Inggris (`CHALLENGES_EN`), dan AI (rencana, bantu tulis, saran tanggapan) menulis dalam bahasa pengguna. Push notification memakai bahasa terakhir penerima (`users.lang`).
- Tetap dalam bahasa aslinya: postingan & tanggapan pengguna, konten Asisten dari admin, artikel/video, tips makanan, dan nama makanan TKPI tanpa nama Inggris. Nilai data (topik, tujuan, kategori) disimpan dalam bahasa Indonesia; hanya tampilannya yang diterjemahkan.

## Struktur

```
KancaMakan-main/
├── mobile/                 # Aplikasi Expo (Expo Router, src/app = layar)
│   └── src/
│       ├── app/            # layar
│       ├── components/     # UI, PostCard, Sheet, Toast, Charts (demo)
│       ├── lib/            # query.ts (cache data API), types.ts
│       ├── services/api.ts # klien API + deteksi alamat backend
│       ├── data/sample.ts  # konstanta + data contoh khusus demo Premium
│       └── store.ts        # sesi login & preferensi (Zustand + AsyncStorage)
└── backend/
    ├── server.js           # createApp(): middleware, /health, registrasi route
    ├── lib/db.js           # skema SQLite + seed
    ├── lib/api.js          # akun, komunitas, makanan, konten, tantangan, rencana, minat Premium
    ├── lib/ai.js           # endpoint AI + generator berbasis data (tanpa API key)
    ├── lib/agent.js        # agent Rencana Sehatku + deteksi sinyal berisiko
    ├── lib/knowledge.js    # pencarian makanan/tips untuk prompt
    ├── lib/content.js      # prompt, validasi & penyaring konten
    ├── data/               # foods.js, tips.js, content.js (seed)
    └── test/api.test.js    # npm test (database di memori, Claude ditiru)
```

## API (ringkas)

| | Endpoint |
|---|---|
| Akun | `POST /api/auth/register` · `POST /api/auth/login` · `GET/PATCH/DELETE /api/me` (PATCH: nama, nama pengguna, tujuan) · `POST /api/me/password` · `POST/DELETE /api/me/avatar` |
| Postingan | `GET /api/posts?topic=&q=&food=&saved=1&mine=1&before=` · `POST /api/posts` · `GET/DELETE /api/posts/:id` · `POST /api/posts/:id/{like,save,comments,report}` · `DELETE /api/comments/:id` · `POST /api/users/:id/block` |
| Data | `GET /api/foods?q=&category=` · `GET /api/foods/:id` · `GET /api/content` · `GET /api/content/:id` |
| Tantangan | `GET /api/challenges?from=<Senin>` (daftar) · `GET /api/challenges/current?from=<Senin>` (ranking minggu ini & sepanjang waktu) · `POST /api/challenges/:id/checkin` · `POST /api/challenges/:id/remind` |
| Rencana | `POST /api/agent/plan` · `GET /api/plan` · `PUT /api/plan/days` |
| AI | `POST /api/ai/draft` · `POST /api/ai/replies` |
| Konten AI (admin, header `X-Admin-Token`) | `GET/POST /api/admin/ai` · `POST /api/admin/ai/generate` · `PATCH/DELETE /api/admin/ai/:id` · `POST /api/admin/ai/:id/publish` |
| Premium | `GET /api/premium` · `POST /api/premium/interest` |

Semua endpoint (kecuali makanan, konten, dan pembuatan akun) memakai header `Authorization: Bearer <token>`.

## Sebelum rilis publik

| Bagian | Sekarang | Disarankan |
|---|---|---|
| Hosting | Laptop | Deploy backend (Railway/Render/Fly.io) dengan disk persisten untuk SQLite, atau pindah ke Postgres |
| Akun | Tamu (token di HP) | Tambah login email/OTP agar akun bisa dipakai di beberapa perangkat |
| Foto | Disk server | Object storage (S3/R2) + kompresi |
| Data gizi | Perkiraan (74 makanan) | Verifikasi dan perluas dengan TKPI (Tabel Komposisi Pangan Indonesia) |
| Moderasi | Otomatis + laporan | Dasbor moderator untuk meninjau `reports` |
| Notifikasi | — | Push notification untuk pengingat tantangan (expo-notifications) |
| Premium | Demo + daftar minat | Tracking foto, rencana menu, pembayaran (RevenueCat / Google Play Billing) |
