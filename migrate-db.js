// Jalankan SEKALI setelah database Turso dibuat dan env TURSO_DATABASE_URL serta
// TURSO_AUTH_TOKEN sudah diisi. Script ini menyalin seluruh tabel users dari
// palasena.db lokal ke database remote, termasuk hash password dan ID.
const path = require('path');
const { pathToFileURL } = require('url');
const { createClient } = require('@libsql/client');

async function main() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('Isi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN terlebih dahulu.');
  }
  const local = createClient({ url: pathToFileURL(path.join(__dirname, 'palasena.db')).href });
  const remote = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    await remote.execute(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'anggota',
      status TEXT NOT NULL DEFAULT 'aktif',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      nama_rimba TEXT, kelas TEXT, nis TEXT, nisn TEXT, angkatan INTEGER
    )`);
    const localRows = (await local.execute('SELECT id,nama,username,password_hash,role,status,created_at,nama_rimba,kelas,nis,nisn,angkatan FROM users ORDER BY id')).rows;
    const remoteRows = (await remote.execute('SELECT COUNT(*) AS total FROM users')).rows;
    if (Number(remoteRows[0].total) > 0) {
      throw new Error('Database remote sudah berisi data. Migrasi dihentikan agar data tidak tertimpa/duplikat.');
    }
    for (const row of localRows) {
      await remote.execute({
        sql: `INSERT INTO users(id,nama,username,password_hash,role,status,created_at,nama_rimba,kelas,nis,nisn,angkatan)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [row.id, row.nama, row.username, row.password_hash, row.role, row.status, row.created_at,
          row.nama_rimba, row.kelas, row.nis, row.nisn, row.angkatan],
      });
    }
    console.log(`Berhasil menyalin ${localRows.length} akun dari palasena.db ke database remote.`);
  } finally {
    local.close();
    remote.close();
  }
}
main().catch((error) => { console.error('Migrasi gagal:', error.message); process.exit(1); });
