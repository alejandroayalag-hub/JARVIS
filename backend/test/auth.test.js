import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addUser, login, userFromToken } from '../src/auth.js';

test('login con contraseña correcta da token que identifica al usuario', () => {
  const db = openDb(':memory:');
  const pw = addUser(db, 'Alex');
  const r = login(db, 'Alex', pw);
  assert.ok(r.token);
  assert.equal(r.user.name, 'Alex');
  assert.equal(userFromToken(db, r.token).name, 'Alex');
});

test('contraseña mala o token basura no entran', () => {
  const db = openDb(':memory:');
  addUser(db, 'Alex');
  assert.equal(login(db, 'Alex', 'mala'), null);
  assert.equal(login(db, 'Nadie', 'x'), null);
  assert.equal(userFromToken(db, 'basura'), null);
  assert.equal(userFromToken(db, undefined), null);
});
