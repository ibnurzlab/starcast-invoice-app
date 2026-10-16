# Starcast.id Invoice Generator

Aplikasi **full-stack generator invoice** untuk reseller diecast **Starcast.id**. Membuat nomor invoice berurutan, menyimpan riwayat, dan mencetak / menyimpan invoice berukuran A4 sebagai PDF.

Tersedia **dua varian backend** yang berbagi frontend yang sama: Node.js + SQLite untuk pengembangan/deployment lokal, dan Cloudflare Workers + D1 untuk deployment serverless.

---

## ✨ Fitur

- **Generate nomor invoice berurutan** secara otomatis dengan format `INV-<tahun>-<urut>` (counter per tahun, aman dari duplikasi).
- **CRUD invoice lengkap** — buat, buka, ubah, dan hapus invoice.
- **Preview A4 live** dengan tata letak siap cetak, plus tombol **Cetak / Simpan PDF**.
- **Riwayat invoice** dengan pencarian berdasarkan nomor invoice atau nama reseller.
- **Perhitungan otomatis** subtotal, **diskon**, **ongkir**, dan total.
- Data reseller, metode pembayaran, status pembayaran, dan catatan.
- Item dinamis (keterangan, harga, qty) dengan pengurutan.
- Validasi input di backend menggunakan **Zod**.

## 🧱 Tech Stack

| Lapisan | Teknologi |
| --- | --- |
| Frontend | HTML, Vanilla JavaScript, Tailwind CSS |
| Backend (lokal) | Node.js, Express, better-sqlite3 |
| Backend (serverless) | Cloudflare Workers, Hono, Cloudflare D1 |
| Validasi | Zod |
| Runtime DB | SQLite (lokal) / D1 (Cloudflare) |

## 📁 Struktur Project

```
.
├── backend/            # Express + SQLite (better-sqlite3)
│   ├── src/
│   │   ├── app.js          # Setup Express & static frontend
│   │   ├── server.js       # Entry point
│   │   ├── db.js           # Koneksi & skema SQLite
│   │   ├── migrate.js      # Inisialisasi skema
│   │   ├── nextNumber.js   # Generator nomor invoice
│   │   ├── validators.js   # Skema validasi Zod
│   │   └── routes/
│   │       └── invoices.js # REST API invoice
│   └── data/               # File database SQLite (diabaikan git)
├── cf/                 # Cloudflare Worker + D1
│   ├── src/index.js        # API Hono + serve frontend
│   ├── migrations/         # Migrasi D1
│   └── wrangler.toml
├── frontend/           # Frontend statis (dipakai kedua backend)
│   ├── index.html
│   └── assets/app.js
├── pages/              # Konfigurasi Cloudflare Pages
└── package.json        # Skrip helper
```

## 🚀 Menjalankan

### Varian 1 — Node.js + SQLite (lokal)

```bash
cd backend
npm install
npm run dev
```

Buka <http://localhost:4000>. Database tersimpan di `backend/data/starcast.db` (dibuat otomatis saat pertama dijalankan).

Untuk inisialisasi skema secara manual:

```bash
npm run init-db
```

### Varian 2 — Cloudflare Worker + D1 (serverless)

```bash
cd cf
npm install
npx wrangler login
npx wrangler d1 create starcast-db
```

Salin `database_id` hasil perintah di atas ke `cf/wrangler.toml`, lalu:

```bash
npm run db:local     # terapkan migrasi ke D1 lokal
npm run dev          # jalankan dev server (http://127.0.0.1:8787)
```

Deploy ke production:

```bash
npm run db:remote    # terapkan migrasi ke D1 remote
npm run deploy
```

## 🔌 API Endpoints

Base URL: `/api`

| Method | Endpoint | Deskripsi |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/invoices?limit=&search=` | Daftar invoice (dengan pencarian opsional) |
| `GET` | `/api/invoices/:id` | Detail invoice |
| `POST` | `/api/invoices/next-number` | Ambil nomor invoice berikutnya |
| `POST` | `/api/invoices` | Buat invoice baru |
| `PUT` | `/api/invoices/:id` | Perbarui invoice |
| `DELETE` | `/api/invoices/:id` | Hapus invoice |

## ⚙️ Konfigurasi Environment

- **Backend lokal:** `PORT` (default `4000`), `DB_PATH` (opsional, override lokasi database).
- **Cloudflare:** token API untuk `wrangler` diletakkan di `cf/.env` sebagai `CLOUDFLARE_API_TOKEN` (file ini **tidak** di-commit).

## 📄 Lisensi

Belum ditentukan.
