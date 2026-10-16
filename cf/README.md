# Starcast Cloudflare (Worker + D1)

Frontend disajikan dari folder `../frontend`, API di `src/index.js`, database Cloudflare D1.

## Setup awal
```bash
cd cf
npm install
npx wrangler login
npx wrangler d1 create starcast-db
```

Salin `database_id` ke `wrangler.toml`.

## Migrasi database
Lokal:
```bash
npm run db:local
```

Remote:
```bash
npm run db:remote
```

## Jalankan lokal
```bash
npm run dev
```
Buka `http://127.0.0.1:8787`

## Deploy
```bash
npm run db:remote
npm run deploy
```

Setelah deploy, URL Worker akan menjadi frontend + API Starcast.id.