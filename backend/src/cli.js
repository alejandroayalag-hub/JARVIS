import { openDb } from './db.js';
import { mkdirSync } from 'node:fs';
import { addUser } from './auth.js';

const [cmd, name] = process.argv.slice(2);
const dir = process.env.JARVIS_DATA ?? './data';
mkdirSync(dir, { recursive: true });
const db = openDb(`${dir}/jarvis.db`);
if (cmd === 'add-user' && name) console.log(`${name}: ${addUser(db, name)}`);
else console.error('uso: node src/cli.js add-user <Nombre>   (también resetea contraseña)');
