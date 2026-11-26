const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

const PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.JWT_SECRET || 'ganti-rahasia-ini';
if (PROD && (!process.env.JWT_SECRET || SECRET.length < 16)) {
  console.error('FATAL: set JWT_SECRET (minimal 16 karakter acak) saat NODE_ENV=production.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) console.warn('PERINGATAN: JWT_SECRET belum diatur. Hanya boleh untuk percobaan lokal.');

const PENGURUS = ['ketum', 'sekretaris', 'bendahara', 'pembina'];
const ASSIGNABLE = ['anggota', ...PENGURUS];
const INTERNAL = ['admin', ...PENGURUS];
const MANAGE_ROLES = ['admin', 'ketum'];

const db = new DatabaseSync(path.join(__dirname, 'palasena.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'anggota',
  status TEXT NOT NULL DEFAULT 'aktif',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);

// Kolom data anggota (ditambahkan otomatis ke database lama)
const have = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
for (const [col, type] of [['nama_rimba', 'TEXT'], ['kelas', 'TEXT'], ['nis', 'TEXT'], ['nisn', 'TEXT'], ['angkatan', 'INTEGER']])
  if (!have.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);

if (!db.prepare("SELECT 1 FROM users WHERE role='admin'").get()) {
  if (PROD && !process.env.ADMIN_PASSWORD) {
    console.error('FATAL: set ADMIN_PASSWORD untuk membuat akun admin pertama.');
    process.exit(1);
  }
  const u = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const p = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users(nama,username,password_hash,role) VALUES (?,?,?,?)')
    .run('Administrator', u, bcrypt.hashSync(p, 10), 'admin');
  console.log(`Akun admin dibuat -> username: ${u}`);
  if (!process.env.ADMIN_PASSWORD) console.warn('PERINGATAN: ADMIN_PASSWORD belum diatur, memakai "admin123". Segera ganti!');
}

/* ---------- Pembatas percobaan (anti tebak password) ---------- */
const counters = new Map();   // key -> { n, reset }
const sweep = setInterval(() => { const t = Date.now(); for (const [k, v] of counters) if (v.reset < t) counters.delete(k); }, 60e3);
sweep.unref();
const hit = (key, windowMs) => {
  const now = Date.now(); let c = counters.get(key);
  if (!c || c.reset < now) { c = { n: 0, reset: now + windowMs }; counters.set(key, c); }
  c.n++; return c;
};
const secsLeft = (c) => Math.max(1, Math.ceil((c.reset - Date.now()) / 1000));
const tooMany = (res, s) => res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(s / 60)} menit.` });
const str = (v) => (typeof v === 'string' ? v : '');
const DUMMY = bcrypt.hashSync('hash-pengganti-agar-waktu-sama', 10);
const okPw = (pw) => pw.length > 0 && Buffer.byteLength(pw) <= 72;   // batas bcrypt

const app = express();
app.disable('x-powered-by');
if (PROD) app.set('trust proxy', 1);

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

// Mengembalikan user dari database, atau null jika token tidak valid / akun sudah tidak ada
const getUser = (req) => {
  try {
    const { id } = jwt.verify(req.cookies.token, SECRET, { algorithms: ['HS256'] });
    return db.prepare('SELECT id,nama,username,role,status FROM users WHERE id=?').get(id) || null;
  } catch { return null; }
};
const auth = (req, res, next) => {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: 'Belum login' });
  req.user = u; next();
};
const internalOnly = (req, res, next) =>
  INTERNAL.includes(req.user.role) ? next() : res.status(403).json({ error: 'Khusus pengurus' });

// Halaman dashboard tidak bisa dibuka tanpa login
app.get(['/dashboard.html', '/anggota.html'], (req, res, next) => (getUser(req) ? next() : res.redirect('/')));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/register', (req, res) => {
  const ip = req.ip;
  const c = hit('reg:' + ip, 3600e3);
  if (c.n > 10) return tooMany(res, secsLeft(c));
  const nama = str(req.body?.nama).trim();
  const un = str(req.body?.username).trim().toLowerCase();
  const pw = str(req.body?.password);
  if (nama.length < 2) return res.status(400).json({ error: 'Nama lengkap wajib diisi' });
  if (!/^[a-z0-9_.]{3,20}$/.test(un)) return res.status(400).json({ error: 'Username 3-20 karakter: huruf kecil, angka, titik, atau underscore' });
  if (pw.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  if (!okPw(pw)) return res.status(400).json({ error: 'Password terlalu panjang (maksimal 72 karakter)' });
  try {
    const r = db.prepare("INSERT INTO users(nama,username,password_hash,role,status) VALUES (?,?,?, 'anggota','aktif')")
      .run(nama.slice(0, 60), un, bcrypt.hashSync(pw, 10));
    setCookie(res, { id: Number(r.lastInsertRowid) });
    res.json({ ok: true });
  } catch (e) {
    res.status(409).json({ error: 'Username sudah dipakai' });
  }
});

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const un = str(req.body?.username).trim().toLowerCase().slice(0, 40);
  const pw = str(req.body?.password);
  const key = 'fail:' + ip + '|' + un;

  const all = hit('ip:' + ip, 15 * 60e3);                    // semua percobaan dari 1 IP
  if (all.n > 30) return tooMany(res, secsLeft(all));
  const f = counters.get(key);                                // gagal berulang untuk username yang sama
  if (f && f.reset > Date.now() && f.n >= 5) return tooMany(res, secsLeft(f));

  const u = db.prepare('SELECT * FROM users WHERE username=?').get(un);
  // Selalu jalankan bcrypt (juga saat akun tidak ada) agar waktu respons sama
  const match = bcrypt.compareSync(okPw(pw) ? pw : 'x', u ? u.password_hash : DUMMY);
  if (!u || !okPw(pw) || !match) {
    hit(key, 15 * 60e3);
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  counters.delete(key);
  setCookie(res, u);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { res.clearCookie('token', { path: '/' }); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json(req.user));

app.get('/api/dashboard', auth, (req, res) => {
  const count = (where, ...p) => db.prepare(`SELECT COUNT(*) c FROM users WHERE ${where}`).get(...p).c;
  const data = {
    user: req.user,
    stats: {
      anggotaAktif: count("role='anggota' AND status='aktif'"),
      anggotaNonaktif: count("role='anggota' AND status='nonaktif'"),
      pengurus: count(`role IN (${PENGURUS.map(() => '?').join(',')})`, ...PENGURUS),
    },
  };
  if (INTERNAL.includes(req.user.role)) {
    data.canManageRoles = MANAGE_ROLES.includes(req.user.role);
    data.users = db.prepare('SELECT id,nama,username,role,status FROM users ORDER BY nama').all();
  }
  res.json(data);
});

app.patch('/api/users/:id/status', auth, internalOnly, (req, res) => {
  const { status } = req.body || {};
  if (!['aktif', 'nonaktif'].includes(status)) return res.status(400).json({ error: 'Status tidak valid' });
  db.prepare("UPDATE users SET status=? WHERE id=? AND role!='admin'").run(status, Number(req.params.id));
  res.json({ ok: true });
});

app.patch('/api/users/:id/role', auth, (req, res) => {
  if (!MANAGE_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Hanya admin atau Ketua Umum' });
  const { role } = req.body || {};
  const id = Number(req.params.id);
  if (!ASSIGNABLE.includes(role)) return res.status(400).json({ error: 'Jabatan tidak valid' });
  if (id === req.user.id) return res.status(400).json({ error: 'Tidak bisa mengubah jabatan sendiri' });
  const r = db.prepare("UPDATE users SET role=? WHERE id=? AND role!='admin'").run(role, id);
  if (!r.changes) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
  res.json({ ok: true });
});

const JABATAN_ORDER = "CASE role WHEN 'ketum' THEN 1 WHEN 'sekretaris' THEN 2 WHEN 'bendahara' THEN 3 WHEN 'pembina' THEN 4 ELSE 5 END";

// Daftar anggota aktif. NIS & NISN hanya dikirim ke pengurus/admin.
app.get('/api/anggota', auth, (req, res) => {
  const internal = INTERNAL.includes(req.user.role);
  const rows = db.prepare(
    `SELECT id,nama,role,nama_rimba,kelas,nis,nisn,angkatan FROM users
     WHERE status='aktif' AND role!='admin' ORDER BY ${JABATAN_ORDER}, nama COLLATE NOCASE`).all();
  res.json({
    meId: req.user.id,
    canEdit: MANAGE_ROLES.includes(req.user.role),
    anggota: rows.map((r) => (internal ? { ...r } : { ...r, nis: null, nisn: null })),
  });
});

// Edit data anggota (admin / Ketua Umum)
app.patch('/api/anggota/:id', auth, (req, res) => {
  if (!MANAGE_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Hanya admin atau Ketua Umum yang boleh mengubah data' });
  const id = Number(req.params.id);
  const b = req.body || {};
  const val = (v, max) => str(v).trim().slice(0, max) || null;

  const nama = str(b.nama).trim();
  if (nama.length < 2) return res.status(400).json({ error: 'Nama lengkap wajib diisi' });
  const nis = val(b.nis, 20), nisn = val(b.nisn, 20);
  if ((nis && !/^\d+$/.test(nis)) || (nisn && !/^\d+$/.test(nisn))) return res.status(400).json({ error: 'NIS dan NISN hanya boleh berisi angka' });
  let angkatan = null;
  const ang = String(b.angkatan ?? '').trim();
  if (ang !== '') {
    angkatan = Number(ang);
    if (!Number.isInteger(angkatan) || angkatan < 1 || angkatan > 99) return res.status(400).json({ error: 'Angkatan harus angka 1-99' });
  }

  const target = db.prepare("SELECT id,role FROM users WHERE id=? AND role!='admin'").get(id);
  if (!target) return res.status(404).json({ error: 'Anggota tidak ditemukan' });
  let role = target.role;
  if (b.role !== undefined && b.role !== target.role) {
    if (!ASSIGNABLE.includes(b.role)) return res.status(400).json({ error: 'Jabatan tidak valid' });
    if (id === req.user.id) return res.status(400).json({ error: 'Tidak bisa mengubah jabatan sendiri' });
    role = b.role;
  }
  db.prepare('UPDATE users SET nama=?,nama_rimba=?,kelas=?,nis=?,nisn=?,angkatan=?,role=? WHERE id=?')
    .run(nama.slice(0, 60), val(b.nama_rimba, 40), val(b.kelas, 20), nis, nisn, angkatan, role, id);
  res.json({ ok: true });
});

app.use((err, req, res, next) => res.status(400).json({ error: 'Permintaan tidak valid' }));

app.listen(process.env.PORT || 3000, () => console.log('Jalan di http://localhost:' + (process.env.PORT || 3000)));
