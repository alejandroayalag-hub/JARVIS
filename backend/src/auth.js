import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

export function hashPassword(p) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(p, salt, 32).toString('hex')}`;
}

export function verifyPassword(p, hash) {
  const [salt, key] = hash.split(':');
  return timingSafeEqual(scryptSync(p, Buffer.from(salt, 'hex'), 32), Buffer.from(key, 'hex'));
}

const sha = (t) => createHash('sha256').update(t).digest('hex');

// Crea (o resetea) usuario; devuelve la contraseña generada, que solo se ve una vez.
export function addUser(db, name) {
  const pw = randomBytes(9).toString('base64url');
  db.prepare(`INSERT INTO users(name, pass_hash) VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET pass_hash = excluded.pass_hash, token_hash = NULL`).run(name, hashPassword(pw));
  return pw;
}

export function login(db, name, password) {
  const u = db.prepare('SELECT id, name, pass_hash FROM users WHERE name = ?').get(name);
  if (!u || !verifyPassword(String(password ?? ''), u.pass_hash)) return null;
  const token = randomBytes(32).toString('hex');
  db.prepare('UPDATE users SET token_hash = ? WHERE id = ?').run(sha(token), u.id);
  return { token, user: { id: u.id, name: u.name } };
}

export function userFromToken(db, token) {
  if (!token) return null;
  return db.prepare('SELECT id, name FROM users WHERE token_hash = ?').get(sha(token)) ?? null;
}
