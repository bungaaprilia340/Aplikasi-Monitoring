// Pemakaian: node reset-admin.js <username> <passwordbaru>
// Dipakai kalau lupa username/password admin.
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const [, , user, pass] = process.argv;
if (!user || !pass || pass.length < 6) {
  console.log('Pemakaian: node reset-admin.js <username> <passwordbaru>   (password minimal 6 karakter)');
  process.exit(1);
}
const db = new DatabaseSync(path.join(__dirname, 'palasena.db'));
const admin = db.prepare("SELECT id FROM users WHERE role='admin'").get();
if (!admin) { console.log('Belum ada akun admin. Jalankan "npm start" sekali dulu.'); process.exit(1); }
try {
  db.prepare('UPDATE users SET username=?, password_hash=? WHERE id=?').run(user.toLowerCase(), bcrypt.hashSync(pass, 10), admin.id);
  console.log('Akun admin diperbarui. Username:', user.toLowerCase());
} catch (e) {
  console.log('Gagal: username itu sudah dipakai akun lain.');
  process.exit(1);
}
