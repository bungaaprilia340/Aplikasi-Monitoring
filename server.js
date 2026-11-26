require('express-async-errors');
const express = require('express');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const { pathToFileURL } = require('url');

const PROD = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
const SECRET = process.env.JWT_SECRET || 'ganti-rahasia-ini';
if (PROD && (!process.env.JWT_SECRET || SECRET.length < 32)) {
  throw new Error('Konfigurasi JWT_SECRET belum benar. Isi dengan string acak minimal 32 karakter di Environment Variables.');
}

// Lokal memakai file SQLite yang sama. Di Vercel, gunakan database SQLite-compatible
// jarak jauh (Turso/libSQL), karena filesystem function Vercel tidak persisten.
if (PROD && (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)) {
  throw new Error('TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN wajib diatur di Vercel.');
}
const db = createClient(PROD
  ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
  : { url: pathToFileURL(path.join(__dirname, 'palasena.db')).href }
);

const get = async (sql, args = []) => {
  const result = await db.execute({ sql, args });
  return result.rows[0] || null;
};
const all = async (sql, args = []) => {
  const result = await db.execute({ sql, args });
  return result.rows;
};
const run = async (sql, args = []) => {
  const result = await db.execute({ sql, args });
  return { changes: Number(result.rowsAffected || 0), lastInsertRowid: result.lastInsertRowid };
};

async function initDb() {
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'anggota',
    status TEXT NOT NULL DEFAULT 'aktif',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const columns = await all('PRAGMA table_info(users)');
  const have = columns.map((column) => column.name);
  for (const [column, type] of [['nama_rimba', 'TEXT'], ['kelas', 'TEXT'], ['nis', 'TEXT'], ['nisn', 'TEXT'], ['angkatan', 'INTEGER']]) {
    if (!have.includes(column)) await db.execute(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
  }

  const admin = await get("SELECT 1 AS found FROM users WHERE role='admin' LIMIT 1");
  if (!admin) {
    if (PROD && !process.env.ADMIN_PASSWORD) {
      throw new Error('ADMIN_PASSWORD wajib diatur untuk membuat akun admin pertama.');
    }
    const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    await run('INSERT INTO users(nama,username,password_hash,role) VALUES (?,?,?,?)',
      ['Administrator', username, bcrypt.hashSync(password, 10), 'admin']);
    console.log(`Akun admin dibuat -> username: ${username}`);
    if (!process.env.ADMIN_PASSWORD) console.warn('PERINGATAN: password admin lokal default masih admin123. Segera ganti!');
  }
}
const dbReady = initDb();

const PENGURUS = ['ketum', 'sekretaris', 'bendahara', 'pembina'];
const ASSIGNABLE = ['anggota', ...PENGURUS];
const INTERNAL = ['admin', ...PENGURUS];
const MANAGE_ROLES = ['admin', 'ketum'];

/* ---------- Pembatas percobaan (anti tebak password) ---------- */
const counters = new Map();
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of counters) if (value.reset < now) counters.delete(key);
}, 60e3);
sweep.unref();
const hit = (key, windowMs) => {
  const now = Date.now();
  let counter = counters.get(key);
  if (!counter || counter.reset < now) {
    counter = { n: 0, reset: now + windowMs };
    counters.set(key, counter);
  }
  counter.n++;
  return counter;
};
const secsLeft = (counter) => Math.max(1, Math.ceil((counter.reset - Date.now()) / 1000));
const tooMany = (res, seconds) => res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(seconds / 60)} menit.` });
const str = (value) => (typeof value === 'string' ? value : '');
const DUMMY = bcrypt.hashSync('hash-pengganti-agar-waktu-sama', 10);
const okPw = (password) => password.length > 0 && Buffer.byteLength(password) <= 72;

const app = express();
app.disable('x-powered-by');
if (PROD) app.set('trust proxy', 1);
app.use(async (req, res, next) => {
  try { await dbReady; next(); }
  catch (error) {
    console.error('Database initialization failed:', error);
    res.status(503).json({ error: 'Database belum siap. Periksa konfigurasi database di Vercel.' });
  }
});
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const setCookie = (res, user) => {
  const token = jwt.sign({ id: user.id }, SECRET, { algorithm: 'HS256', expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 864e5, secure: PROD });
};
const getUser = async (req) => {
  try {
    const { id } = jwt.verify(req.cookies.token, SECRET, { algorithms: ['HS256'] });
    return await get('SELECT id,nama,username,role,status FROM users WHERE id=?', [id]);
  } catch { return null; }
};
const auth = async (req, res, next) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Belum login' });
  req.user = user;
  next();
};
const internalOnly = (req, res, next) =>
  INTERNAL.includes(req.user.role) ? next() : res.status(403).json({ error: 'Khusus pengurus' });

// Di lokal Express menyajikan halaman. Di Vercel file public disajikan CDN Vercel;
// semua data tetap dilindungi oleh autentikasi pada endpoint /api.
app.get(['/dashboard.html', '/anggota.html'], async (req, res, next) => (await getUser(req)) ? next() : res.redirect('/'));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/register', async (req, res) => {
  const counter = hit('reg:' + req.ip, 3600e3);
  if (counter.n > 10) return tooMany(res, secsLeft(counter));
  const nama = str(req.body?.nama).trim();
  const username = str(req.body?.username).trim().toLowerCase();
  const password = str(req.body?.password);
  if (nama.length < 2) return res.status(400).json({ error: 'Nama lengkap wajib diisi' });
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) return res.status(400).json({ error: 'Username 3-20 karakter: huruf kecil, angka, titik, atau underscore' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  if (!okPw(password)) return res.status(400).json({ error: 'Password terlalu panjang (maksimal 72 karakter)' });
  try {
    const result = await run("INSERT INTO users(nama,username,password_hash,role,status) VALUES (?,?,?, 'anggota','aktif')",
      [nama.slice(0, 60), username, bcrypt.hashSync(password, 10)]);
    setCookie(res, { id: Number(result.lastInsertRowid) });
    res.json({ ok: true });
  } catch (error) {
    if (String(error.message).toLowerCase().includes('unique')) return res.status(409).json({ error: 'Username sudah dipakai' });
    throw error;
  }
});

app.post('/api/login', async (req, res) => {
  const username = str(req.body?.username).trim().toLowerCase().slice(0, 40);
  const password = str(req.body?.password);
  const key = 'fail:' + req.ip + '|' + username;
  const total = hit('ip:' + req.ip, 15 * 60e3);
  if (total.n > 30) return tooMany(res, secsLeft(total));
  const failed = counters.get(key);
  if (failed && failed.reset > Date.now() && failed.n >= 5) return tooMany(res, secsLeft(failed));
  const user = await get('SELECT * FROM users WHERE username=?', [username]);
  const match = bcrypt.compareSync(okPw(password) ? password : 'x', user ? user.password_hash : DUMMY);
  if (!user || !okPw(password) || !match) {
    hit(key, 15 * 60e3);
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  counters.delete(key);
  setCookie(res, user);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { res.clearCookie('token', { path: '/' }); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json(req.user));

app.get('/api/dashboard', auth, async (req, res) => {
  const count = async (where, args = []) => Number((await get(`SELECT COUNT(*) AS c FROM users WHERE ${where}`, args)).c);
  const data = {
    user: req.user,
    stats: {
      anggotaAktif: await count("role='anggota' AND status='aktif'"),
      anggotaNonaktif: await count("role='anggota' AND status='nonaktif'"),
      pengurus: await count(`role IN (${PENGURUS.map(() => '?').join(',')})`, PENGURUS),
    },
  };
  if (INTERNAL.includes(req.user.role)) {
    data.canManageRoles = MANAGE_ROLES.includes(req.user.role);
    data.users = await all('SELECT id,nama,username,role,status FROM users ORDER BY nama');
  }
  res.json(data);
});

app.patch('/api/users/:id/status', auth, internalOnly, async (req, res) => {
  const { status } = req.body || {};
  if (!['aktif', 'nonaktif'].includes(status)) return res.status(400).json({ error: 'Status tidak valid' });
  await run("UPDATE users SET status=? WHERE id=? AND role!='admin'", [status, Number(req.params.id)]);
  res.json({ ok: true });
});

app.patch('/api/users/:id/role', auth, async (req, res) => {
  if (!MANAGE_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Hanya admin atau Ketua Umum' });
  const { role } = req.body || {};
  const id = Number(req.params.id);
  if (!ASSIGNABLE.includes(role)) return res.status(400).json({ error: 'Jabatan tidak valid' });
  if (id === req.user.id) return res.status(400).json({ error: 'Tidak bisa mengubah jabatan sendiri' });
  const result = await run("UPDATE users SET role=? WHERE id=? AND role!='admin'", [role, id]);
  if (!result.changes) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
  res.json({ ok: true });
});

const JABATAN_ORDER = "CASE role WHEN 'ketum' THEN 1 WHEN 'sekretaris' THEN 2 WHEN 'bendahara' THEN 3 WHEN 'pembina' THEN 4 ELSE 5 END";
app.get('/api/anggota', auth, async (req, res) => {
  const internal = INTERNAL.includes(req.user.role);
  const rows = await all(
    `SELECT id,nama,role,nama_rimba,kelas,nis,nisn,angkatan FROM users
     WHERE status='aktif' AND role!='admin' ORDER BY ${JABATAN_ORDER}, nama COLLATE NOCASE`
  );
  res.json({
    meId: req.user.id,
    canEdit: MANAGE_ROLES.includes(req.user.role),
    anggota: rows.map((row) => (internal ? row : { ...row, nis: null, nisn: null })),
  });
});

app.patch('/api/anggota/:id', auth, async (req, res) => {
  if (!MANAGE_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Hanya admin atau Ketua Umum yang boleh mengubah data' });
  const id = Number(req.params.id);
  const body = req.body || {};
  const val = (value, max) => str(value).trim().slice(0, max) || null;
  const nama = str(body.nama).trim();
  if (nama.length < 2) return res.status(400).json({ error: 'Nama lengkap wajib diisi' });
  const nis = val(body.nis, 20);
  const nisn = val(body.nisn, 20);
  if ((nis && !/^\d+$/.test(nis)) || (nisn && !/^\d+$/.test(nisn))) return res.status(400).json({ error: 'NIS dan NISN hanya boleh berisi angka' });
  let angkatan = null;
  const ang = String(body.angkatan ?? '').trim();
  if (ang !== '') {
    angkatan = Number(ang);
    if (!Number.isInteger(angkatan) || angkatan < 1 || angkatan > 99) return res.status(400).json({ error: 'Angkatan harus angka 1-99' });
  }
  const target = await get("SELECT id,role FROM users WHERE id=? AND role!='admin'", [id]);
  if (!target) return res.status(404).json({ error: 'Anggota tidak ditemukan' });
  let role = target.role;
  if (body.role !== undefined && body.role !== target.role) {
    if (!ASSIGNABLE.includes(body.role)) return res.status(400).json({ error: 'Jabatan tidak valid' });
    if (id === req.user.id) return res.status(400).json({ error: 'Tidak bisa mengubah jabatan sendiri' });
    role = body.role;
  }
  await run('UPDATE users SET nama=?,nama_rimba=?,kelas=?,nis=?,nisn=?,angkatan=?,role=? WHERE id=?',
    [nama.slice(0, 60), val(body.nama_rimba, 40), val(body.kelas, 20), nis, nisn, angkatan, role, id]);
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error('Request failed:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server. Periksa Runtime Logs Vercel.' });
});

// Vercel mendeteksi dan menjalankan Express app yang diekspor dari server.js.
// Saat lokal, file ini tetap bisa dijalankan dengan: npm start
module.exports = app;
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Jalan di http://localhost:${port}`));
}
