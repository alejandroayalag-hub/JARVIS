import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, token_hash TEXT);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY, owner_id INTEGER REFERENCES users(id), name TEXT NOT NULL,
  every_months INTEGER NOT NULL DEFAULT 1, start_month TEXT NOT NULL, pay_day INTEGER NOT NULL,
  cut_day INTEGER, fixed_cents INTEGER, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS periods(
  id INTEGER PRIMARY KEY, payment_id INTEGER NOT NULL REFERENCES payments(id), period TEXT NOT NULL,
  amount_cents INTEGER, paid_cents INTEGER NOT NULL DEFAULT 0, UNIQUE(payment_id, period));
CREATE TABLE IF NOT EXISTS receipts(
  id INTEGER PRIMARY KEY, period_id INTEGER NOT NULL REFERENCES periods(id), user_id INTEGER NOT NULL,
  file TEXT NOT NULL, read_cents INTEGER, cents INTEGER, created_at TEXT NOT NULL);
`;

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

// Conjunto (owner NULL) o del propio usuario; requiere parámetro :uid.
export const visibleWhere = (alias) => `(${alias}.owner_id IS NULL OR ${alias}.owner_id = :uid)`;
