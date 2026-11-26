# Perbaikan deployment PALASENA di Vercel (SQLite tetap dipakai)

## Kenapa perlu Turso?
Aplikasi tetap memakai SQLite/libSQL dan file `palasena.db` lokal tetap disimpan sebagai sumber migrasi. Namun, Vercel Functions tidak menyediakan file database lokal yang persisten untuk perubahan data. Karena itu, deployment Vercel harus menghubungkan aplikasi ke database SQLite-compatible jarak jauh (Turso/libSQL). Jangan mengandalkan file `palasena.db` di dalam deployment untuk menyimpan perubahan.

## 1. Buat database remote
1. Buat akun dan database di Turso.
2. Buat database baru yang kosong.
3. Salin nilai database URL dan token akses.
4. Jangan kirim token/password ke chat atau masukkan ke GitHub.

## 2. Siapkan project di komputer
1. Backup folder project asli terlebih dahulu.
2. Ganti file project dengan isi folder ini, atau salin file yang sudah diperbarui.
3. Pastikan `palasena.db` asli tetap berada di folder utama.
4. Buka terminal di folder yang berisi `package.json`.
5. Jalankan `npm install`.

## 3. Migrasikan data SQLite lama (jalankan satu kali)
Windows PowerShell:

```powershell
$env:TURSO_DATABASE_URL="libsql://URL-DATABASE-KAMU.turso.io"
$env:TURSO_AUTH_TOKEN="TOKEN-DATABASE-KAMU"
node migrate-db.js
```

Jalankan hanya sekali pada database remote yang masih kosong. Script menyalin ID, nama, username, hash password, role, status, tanggal dibuat, nama rimba, kelas, NIS, NISN, dan angkatan. Password pengguna tidak diubah karena yang disalin adalah hash password.

## 4. Atur Environment Variables di Vercel
Buka Vercel Dashboard → project `palasena-apk` → Settings → Environment Variables. Tambahkan:

- `JWT_SECRET`: string acak minimal 32 karakter.
- `TURSO_DATABASE_URL`: URL database Turso.
- `TURSO_AUTH_TOKEN`: token database Turso.
- `ADMIN_USERNAME`: username admin lama (opsional jika akun admin sudah ikut termigrasi).
- `ADMIN_PASSWORD`: password admin lama (opsional jika akun admin sudah ikut termigrasi; wajib bila database remote kosong dan perlu membuat admin pertama).

Pilih environment Production (dan Preview jika dipakai), simpan, lalu redeploy.

## 5. GitHub
Jangan upload `node_modules` atau `.env`. Upload `package.json`, `package-lock.json`, `.gitignore`, `server.js`, `migrate-db.js`, `public/`, dan `palasena.db` hanya bila memang ingin menyimpan salinan backup lokal di repository. Database remote adalah sumber data live setelah migrasi. Setelah migrasi berhasil dan sudah diverifikasi, hapus file database dari pelacakan GitHub (tetap simpan salinan lokal sebagai backup): `git rm --cached palasena.db` lalu commit dan push. File lokal tidak ikut terhapus karena perintah memakai `--cached`.

## 6. Uji lokal
Untuk menjalankan dengan file SQLite lokal, hapus sementara `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN` dari terminal lokal, lalu jalankan:

```bash
npm start
```

Lokal akan menggunakan `palasena.db`. Jangan jalankan `migrate-db.js` lebih dari sekali untuk database remote yang sudah terisi.
