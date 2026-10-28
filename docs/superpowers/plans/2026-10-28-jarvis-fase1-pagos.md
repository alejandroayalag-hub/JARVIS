# JARVIS Fase 1a — Pagos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend en alex-llm + app Android para que Alex y Tere no pierdan ningún pago: avisos de corte y de pago que insisten hasta tener monto/comprobante, lectura local del comprobante y alta de pagos platicando.

**Architecture:** Backend Node 22 sin dependencias externas (`node:http`, `node:sqlite`, `node:test`, `node:crypto`), puerto 3019, solo alcanzable por Tailscale. El servidor calcula la lista de recordatorios de los próximos 14 días; la app Expo la descarga y la programa como notificaciones **locales** (sin FCM). Ollama local para chat (texto→acción JSON) y visión (comprobante→monto).

**Tech Stack:** Node 22.22 (`node:sqlite`), Ollama HTTP API, Expo SDK 54 + expo-notifications + expo-background-task + expo-image-picker + expo-secure-store + expo-local-authentication, APK por EAS (`preview` → apk), igual que `~/gessi/mobile`.

**Spec:** `docs/superpowers/specs/2026-10-28-jarvis-design.md`

**Fuera de este plan (plan 1b):** agenda + Google Calendar, notas de voz (Whisper), consulta a Claude con permiso. Fase 2: casa.

## Global Constraints

- Puerto backend **3019**; escucha en `0.0.0.0` pero el firewall (ufw) solo permite `tailscale0`.
- Zona horaria fija `America/Mexico_City` (`TZ` en el servicio y en cálculos).
- Horas de los 4 avisos: **09:00, 13:00, 17:00, 20:30**, en una constante `HORAS_AVISO`.
- Usuarios: exactamente "Alex" y "Tere". JARVIS se dirige a ellos así, tono formal y elegante.
- `owner_id = NULL` significa **conjunto**; si no, personal y **oculto** para el otro en TODA respuesta (listas, recordatorios, chat, fotos).
- Pagos y fotos **nunca** salen de alex-llm: ningún `fetch` a host que no sea `OLLAMA_URL` (localhost).
- Dinero en **centavos enteros** (`INTEGER`), nunca float.
- Fotos comprimidas en la app a JPEG ancho máx 1600 px, calidad 0.6 (~300 KB).
- Respaldo diario 03:30 a `$NAS_DIR/jarvis/`, 30 días.

## Review Focus

1. **Día 31 / 29-30 en meses cortos** — pago el 31 vence el último día de febrero, no se brinca el mes. Test en Task 2.
2. **Usuario A pide recurso personal de B por id** (GET foto, POST monto, PATCH pago) — 404, no 403 (no revelar que existe). Test en Task 4.
3. **Foto subida dos veces / dos abonos** — se suman, no se reemplazan; si el total ≥ monto, queda pagado. Test en Task 3.
4. **Monto no capturado al llegar el día de pago** (corte sin respuesta) — el aviso de pago pide el monto en vez de mostrar "$null". Test en Task 2.
5. **Ollama caído o modelo no cargado** (fines de semana con Lexium usando la GPU) — subir foto sigue funcionando: queda "sin leer" y se pide monto manual; chat responde "en este momento no puedo pensar, Alex" sin 500. Tests en Tasks 5 y 6.

---

## File Structure

```
backend/
  package.json            "type":"module", scripts.test = "node --test"
  src/db.js               abrir SQLite, migraciones, helpers de visibilidad
  src/periodos.js         lógica pura de periodicidad y fechas (sin DB)
  src/recordatorios.js    lógica pura: pagos+periodos+ahora → lista de avisos
  src/pagos.js            casos de uso sobre DB: alta, monto, abono, resumen
  src/auth.js             scrypt, tokens
  src/ollama.js           cliente mínimo Ollama (chat JSON, visión)
  src/comprobante.js      foto → monto leído (usa ollama.js)
  src/chat.js             texto → acción → respuesta con persona JARVIS
  src/server.js           router node:http, endpoints
  src/cli.js              add-user, set-password
  test/*.test.js
  deploy/jarvis-api.service, deploy/backup.sh, deploy/jarvis-backup.timer
app/                      Expo SDK 54 (estructura de ~/gessi/mobile)
  App.js, src/api.js, src/notificaciones.js, src/screens/{Login,Pagos,Pago,Chat}.js
```

---

### Task 1: Esqueleto backend, DB y usuarios

**Files:**
- Create: `backend/package.json`, `backend/src/db.js`, `backend/src/auth.js`, `backend/src/cli.js`, `backend/.gitignore` (`data/`), `backend/test/auth.test.js`

**Interfaces:**
- Produces:
  - `openDb(path: string) -> DatabaseSync` (crea tablas si no existen). Tablas:
    - `users(id INTEGER PK, name TEXT UNIQUE, pass_hash TEXT, token_hash TEXT)`
    - `payments(id INTEGER PK, owner_id INTEGER NULL REFERENCES users, name TEXT, every_months INTEGER DEFAULT 1, start_month TEXT /*YYYY-MM*/, pay_day INTEGER, cut_day INTEGER NULL, fixed_cents INTEGER NULL, active INTEGER DEFAULT 1)`
    - `periods(id INTEGER PK, payment_id INTEGER, period TEXT /*YYYY-MM*/, amount_cents INTEGER NULL, paid_cents INTEGER DEFAULT 0, UNIQUE(payment_id, period))`
    - `receipts(id INTEGER PK, period_id INTEGER, user_id INTEGER, file TEXT, read_cents INTEGER NULL, cents INTEGER NULL, created_at TEXT)`
  - `visibleWhere(alias: string) -> string` → `"(alias.owner_id IS NULL OR alias.owner_id = :uid)"`
  - `hashPassword(p) -> string`, `verifyPassword(p, hash) -> bool` (scrypt, salt aleatorio)
  - `login(db, name, password) -> {token, user:{id,name}} | null` (token 32 bytes hex; se guarda sha256)
  - `userFromToken(db, token) -> {id,name} | null`
  - CLI: `node src/cli.js add-user <Nombre>` imprime una contraseña aleatoria una vez.

- [ ] **Step 1: Test** `auth.test.js`: con `openDb(':memory:')` y usuario "Alex" creado, `login(db,'Alex',pw)` devuelve token; `userFromToken(db, token).name === 'Alex'`; contraseña mala → `null`; token basura → `null`.
- [ ] **Step 2:** `cd backend && node --test` → FAIL (módulos no existen).
- [ ] **Step 3:** Implementar `db.js`, `auth.js`, `cli.js`.
- [ ] **Step 4:** `node --test` → PASS. (Node 22 imprime `ExperimentalWarning` de sqlite: aceptable.)
- [ ] **Step 5:** Commit `feat(backend): db, usuarios y login`.

### Task 2: Periodos y recordatorios (lógica pura)

**Files:**
- Create: `backend/src/periodos.js`, `backend/src/recordatorios.js`, `backend/test/periodos.test.js`, `backend/test/recordatorios.test.js`

**Interfaces:**
- Produces:
  - `periodsDue(payment, fromMonth: 'YYYY-MM', toMonth) -> string[]` — meses donde toca: `(mesesEntre(start_month, m) % every_months) === 0` y `m >= start_month`.
  - `dayIn(month: 'YYYY-MM', day: number) -> 'YYYY-MM-DD'` — recorta al último día del mes.
  - `HORAS_AVISO = ['09:00','13:00','17:00','20:30']`
  - `buildReminders({payments, periods, now: Date, days = 14}) -> Array<{at: string /*ISO local MX*/, kind: 'corte'|'pago'|'monto'|'atrasado', paymentId, period, text}>`
    Reglas por periodo (state = fila de `periods` o vacío):
    - `corte`: si `cut_day` y `amount_cents == null` → 4 avisos el día de corte. Texto: `"{nombre}, hoy cortó la {name}. ¿Cuál es el monto a pagar?"` — `{nombre}` queda literal; la app lo reemplaza por el nombre del usuario.
    - `monto`: día de pago, sin `amount_cents` y sin `fixed_cents` → 4 avisos pidiendo el monto (Review Focus 4).
    - `pago`: día de pago, monto conocido (`amount_cents ?? fixed_cents`) y `paid_cents < monto` → 4 avisos `"{nombre}, hoy vence {name}: faltan $X. Aún no recibo el comprobante."`
    - `atrasado`: cada día después del día de pago mientras falte → 4 avisos, mismo texto con "venció el DD".
    - Solo avisos con `at > now`.

- [ ] **Step 1: Tests** `periodos.test.js`:
  - `dayIn('2027-02', 31) === '2027-02-28'`, `dayIn('2028-02', 31) === '2028-02-29'`, `dayIn('2026-11', 30) === '2026-11-30'`.
  - bimestral desde `2026-10`: `periodsDue(p,'2026-10','2027-03')` → `['2026-10','2026-12','2027-02']`.
  - anual desde `2026-03`: entre `2026-01` y `2027-12` → `['2026-03','2027-03']`.
- [ ] **Step 2: Tests** `recordatorios.test.js` (now = `2026-11-10T08:00` MX):
  - Walmart corte 10 pago 30, sin periodo → 4 `corte` el 10-11 a las 09:00/13:00/17:00/20:30.
  - mismo pago con `amount_cents=450000` → 0 `corte`; 4 `pago` el 30-11 con "faltan $4,500.00".
  - `paid_cents=200000` → 4 `pago` con "faltan $2,500.00"; `paid_cents=450000` → ninguno.
  - sin monto y sin `fixed_cents` al día de pago → kind `monto` (no texto con "null").
  - now = `2026-12-02T10:00`, sin pagar → `atrasado` 13:00/17:00/20:30 del 02-12 y 4 por día hasta día 14.
  - now = `2026-11-10T14:00` → solo 17:00 y 20:30 del corte.
- [ ] **Step 3:** `node --test` → FAIL.
- [ ] **Step 4:** Implementar. Formato de dinero `Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'})`. Fechas con `TZ=America/Mexico_City` (poner `process.env.TZ` en `package.json` test script: `"test":"TZ=America/Mexico_City node --test"`).
- [ ] **Step 5:** PASS. Commit `feat(backend): periodos y recordatorios`.

### Task 3: Casos de uso de pagos

**Files:**
- Create: `backend/src/pagos.js`, `backend/test/pagos.test.js`

**Interfaces:**
- Consumes: `openDb`, `visibleWhere`, `periodsDue`, `buildReminders`.
- Produces (todas reciben `uid` y respetan visibilidad; recurso ajeno → `null`):
  - `createPayment(db, uid, {name, shared: bool, every_months, start_month, pay_day, cut_day?, fixed_cents?}) -> payment`
  - `listPayments(db, uid) -> Array<payment & {current: period|null, status: 'pendiente'|'pagado'|'atrasado'|'sin_monto'}>`
  - `updatePayment(db, uid, id, patch) -> payment|null`, `deletePayment(db, uid, id) -> bool` (soft: `active=0`)
  - `setAmount(db, uid, paymentId, period, cents) -> period|null`
  - `addPayment(db, uid, paymentId, period, {cents, file, read_cents}) -> {period, remaining_cents}|null` — suma a `paid_cents`.
  - `remindersFor(db, uid, now) -> ReturnType<buildReminders>` (solo pagos visibles).
  - `summary(db, uid, month) -> {paid_cents, pending: [{name, remaining_cents}], late: [name]}`

- [ ] **Step 1: Tests** (usuarios Alex=1, Tere=2):
  - Tere crea personal "Gym"; `listPayments(db,1)` no lo trae; `setAmount(db,1,gymId,…)` → `null`.
  - Alex crea "Walmart" `shared:true`; Tere lo ve; Tere `setAmount` → Alex lo ve con monto.
  - Dos `addPayment` de 200000 y 250000 sobre monto 450000 → `paid_cents=450000`, `remaining_cents=0`, status `pagado` (Review Focus 3).
  - `summary` de Alex no incluye "Gym".
- [ ] **Step 2:** FAIL. **Step 3:** implementar (periodo se crea perezoso con `INSERT … ON CONFLICT DO NOTHING`). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(backend): casos de uso de pagos`.

### Task 4: Servidor HTTP

**Files:**
- Create: `backend/src/server.js`, `backend/test/server.test.js`

**Interfaces:**
- Consumes: Task 1 y Task 3. `readReceipt` (Task 5) y `handleChat` (Task 6) se inyectan: `createServer({db, dataDir, readReceipt, handleChat}) -> http.Server`.
- Produces endpoints (JSON salvo fotos; todos menos login exigen `Authorization: Bearer <token>`; recurso ajeno o inexistente → 404):
  - `POST /api/login {name,password}` → `{token,user}` | 401
  - `GET /api/payments` · `POST /api/payments` · `PATCH /api/payments/:id` · `DELETE /api/payments/:id`
  - `POST /api/payments/:id/periods/:period/amount {cents}`
  - `POST /api/payments/:id/periods/:period/receipt` body `image/jpeg` (máx 5 MB → 413) → guarda en `dataDir/fotos/<uuid>.jpg`, llama `readReceipt(buffer)`; si lee monto → `addPayment`; si no → `{needs_amount:true, receipt_id}`
  - `POST /api/receipts/:id/amount {cents}` → completa un comprobante sin leer
  - `GET /api/receipts/:id/photo` → jpeg
  - `GET /api/reminders` → `remindersFor(now)`
  - `POST /api/chat {text}` → `{reply}`
- `listen(3019,'0.0.0.0')` solo si `import.meta.main`-equivalente (`process.argv[1]` es server.js), para que los tests no se cuelguen (lección de Lexium).

- [ ] **Step 1: Tests** (servidor en puerto 0, `fetch` nativo):
  - sin token → 401; login malo → 401.
  - Alex sube comprobante de su pago personal; Tere `GET /api/receipts/<ese id>/photo` → 404 (Review Focus 2). Igual `PATCH /api/payments/<personal de Alex>`.
  - receipt con `readReceipt` falso que devuelve `{cents:450000}` → pago queda `pagado`.
  - receipt con `readReceipt` que devuelve `{cents:null}` → `needs_amount:true`; luego `/api/receipts/:id/amount` → suma.
  - body de 6 MB → 413.
- [ ] **Step 2:** FAIL. **Step 3:** implementar router con `URLPattern`-free regex simple. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(backend): API HTTP`.

### Task 5: Lectura de comprobante con visión local

**Files:**
- Create: `backend/src/ollama.js`, `backend/src/comprobante.js`, `backend/test/comprobante.test.js`

**Interfaces:**
- Produces:
  - `ollamaChat({model, messages, format?, images?}, {url = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434', timeoutMs = 60000, fetchImpl = fetch}) -> Promise<string>` (contenido del mensaje; lanza en error/timeout). `keep_alive: '5m'` para soltar VRAM.
  - `readReceipt(buffer, {chat = ollamaChat, model = process.env.JARVIS_VISION_MODEL ?? 'qwen2.5vl:7b'}) -> Promise<{cents: number|null}>` — pide JSON `{"monto": number|null}` con `format` schema; convierte a centavos con `Math.round(monto*100)`; cualquier error/JSON inválido/monto ≤ 0 → `{cents:null}`.
  - Prompt (copia exacta): `"Es un comprobante de pago o transferencia bancaria en México. Devuelve solo el monto pagado en pesos (el importe de la operación, no saldos ni comisiones). Si no se lee con claridad, devuelve null."`

- [ ] **Step 1: Tests** con `chat` falso: `'{"monto":4500}'` → `450000`; `'{"monto":"4,500.50"}'` → `450050`; `'{"monto":null}'` → `null`; chat que lanza `ECONNREFUSED` → `null` (Review Focus 5); `'basura'` → `null`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(backend): leer monto de comprobante con visión local`.
- [ ] **Step 6 (fin de semana, en alex-llm):** `ollama pull qwen2.5vl:7b`; con 3 fotos reales de comprobantes, `node -e` llamando `readReceipt` → anotar aciertos en `docs/pruebas-vision.md`. Si falla >1 de 3, probar otro modelo en `JARVIS_VISION_MODEL`.

### Task 6: Chat con persona JARVIS (texto → acción)

**Files:**
- Create: `backend/src/chat.js`, `backend/test/chat.test.js`

**Interfaces:**
- Consumes: `ollamaChat`, `createPayment`, `setAmount`, `listPayments`, `summary`.
- Produces: `handleChat(db, user, text, {chat = ollamaChat, model = process.env.JARVIS_MODEL ?? 'qwen3:14b', today}) -> Promise<{reply: string}>`
  - Paso 1: el LLM devuelve JSON (schema con `format`) `{accion: 'alta_pago'|'monto'|'resumen'|'listar'|'charla', ...campos}`. Para `alta_pago`: `{nombre, conjunto: bool, cada_meses, dia_pago, dia_corte|null, monto|null, mes_inicio}`; `conjunto` es `true` solo si el usuario lo dijo ("conjunta", "con Tere/Alex").
  - Paso 2: el **código** ejecuta la acción (el LLM no toca la DB ni hace cuentas) y arma la respuesta con plantillas en tono formal: `"Entendido, {nombre}. Registré {pago}, cada {n} mes(es), con pago el día {d}{ y corte el día c}. Será {personal|compartido con Tere}."`
  - `charla` → segunda llamada con system prompt de persona: `"Eres JARVIS, el asistente de la casa de Alex y Tere. Hablas en español de México, formal y elegante, breve. Te diriges al usuario por su nombre ({nombre}). No inventes datos de pagos: solo usa los que te doy."`
  - Si falta un campo obligatorio (día de pago), responde preguntándolo; no crea nada.
  - Ollama caído → `{reply: "Disculpe, {nombre}, en este momento no puedo pensar con claridad. Intente de nuevo en unos minutos."}` (Review Focus 5).

- [ ] **Step 1: Tests** con `chat` falso que devuelve JSON fijo:
  - `alta_pago` Walmart corte 10 pago 30 conjunto → existe pago con `owner_id NULL`; reply contiene "compartido con Tere" para Alex.
  - `alta_pago` sin `conjunto` → personal.
  - `alta_pago` sin `dia_pago` → no crea; reply contiene "¿Qué día".
  - `resumen` → reply contiene el total formateado de `summary`.
  - chat que lanza → reply de disculpa con "Alex".
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(backend): chat JARVIS con acciones de pagos`.

### Task 7: Despliegue en alex-llm y respaldos

**Files:**
- Create: `backend/deploy/jarvis-api.service`, `backend/deploy/backup.sh`, `backend/deploy/jarvis-backup.service`, `backend/deploy/jarvis-backup.timer`, `backend/deploy/README.md`

**Interfaces:**
- Servicio systemd `jarvis-api`: usuario `jarvis`, `WorkingDirectory=/srv/jarvis/backend`, `Environment=TZ=America/Mexico_City JARVIS_DATA=/srv/jarvis/data`, `ExecStart=/usr/bin/node src/server.js`, `Restart=always`.
- `backup.sh`: `sqlite3`-free → `node -e` con `VACUUM INTO '/tmp/jarvis-<fecha>.db'`, luego `rsync -a` de la db + `data/fotos/` a `$NAS_DIR/jarvis/<fecha>/`, borrar carpetas > 30 días. Timer `OnCalendar=*-*-* 03:30`.
- ufw: `allow in on tailscale0 to any port 3019`; nada más.

- [ ] **Step 1:** ⛔ Prerrequisito: SSH a alex-llm (hoy la llave no está autorizada; Alex agrega `~/.ssh/id_ed25519.pub` y dice el usuario) y ruta de montaje del NAS.
- [ ] **Step 2:** rsync de `backend/` a `/srv/jarvis/backend`, instalar units, `systemctl enable --now jarvis-api jarvis-backup.timer`, `node src/cli.js add-user Alex` y `Tere` (contraseñas → `credentials.md`, nunca a git).
- [ ] **Step 3: Verificar:** `curl http://100.86.154.99:3019/api/login` con Alex → 200 desde esta máquina por Tailscale; `curl` desde la LAN por IP local → bloqueado.
- [ ] **Step 4: Verificar respaldo:** `systemctl start jarvis-backup` → carpeta del día en el NAS; restaurar en `/tmp` y abrir con `openDb` → mismos pagos. Documentar restauración en `deploy/README.md`.
- [ ] **Step 5:** Commit `chore: despliegue y respaldos en alex-llm`.

### Task 8: App Android — login, pagos y comprobantes

**Files:**
- Create: `app/` con `npx create-expo-app@latest app --template blank` (SDK 54), `app/eas.json` (copiar de `~/gessi/mobile/eas.json`), `app/src/api.js`, `app/src/screens/Login.js`, `app/src/screens/Pagos.js`, `app/src/screens/Pago.js`, `app/App.js`

**Interfaces:**
- Consumes: endpoints de Task 4. `API_URL = 'http://100.86.154.99:3019'` en `app.json > extra`.
- `api.js`: `login(name, pw)`, `get(path)`, `post(path, body)`, `uploadReceipt(paymentId, period, uri)`; token en `expo-secure-store`.
- Login: elegir Alex/Tere + contraseña, una vez. Después, `expo-local-authentication` (huella) al abrir.
- Pagos: lista con nombre, "Compartido"/"Personal", estado (colores: pendiente ámbar, pagado verde, atrasado rojo, sin monto gris), monto restante. Botón "+" abre el chat (alta platicando).
- Pago: capturar monto del periodo; "Subir comprobante" → `expo-image-picker` (cámara o galería) → `ImageManipulator` a ancho 1600, `compress: 0.6` → upload; si `needs_amount`, pide monto manual; historial de fotos del pago.
- `android.usesCleartextTraffic: true` vía `expo-build-properties` (HTTP dentro de Tailscale, que ya cifra).

- [ ] **Step 1:** Crear proyecto y pantallas.
- [ ] **Step 2: Verificar** en emulador o cel con Expo Go contra backend local (`node src/server.js` con `JARVIS_DATA=./data`): login, alta de pago por API, ver lista, subir foto, ver "pagado".
- [ ] **Step 3:** Commit `feat(app): login, pagos y comprobantes`.

### Task 9: App — notificaciones locales y chat

**Files:**
- Create: `app/src/notificaciones.js`, `app/src/screens/Chat.js`
- Modify: `app/App.js`

**Interfaces:**
- `syncReminders() -> Promise<number>`: `GET /api/reminders` → `cancelAllScheduledNotificationsAsync()` → `scheduleNotificationAsync` por aviso con trigger `{type:'date', date}`; reemplaza `{nombre}` por el nombre del usuario; título "JARVIS". Devuelve cuántos programó.
- Se llama: al abrir la app, tras cualquier cambio (monto, comprobante, alta) y en `expo-background-task` (mínimo que permita Android, ~15 min).
- Tocar la notificación abre la pantalla Pago de ese periodo (`data: {paymentId, period}`).
- Canal Android "Pagos" importancia alta.
- Chat: burbujas, campo de texto, `POST /api/chat`. Sin voz (plan 1b).

- [ ] **Step 1:** Implementar.
- [ ] **Step 2: Verificar** con un pago de prueba cuyo corte sea hoy: con datos y Wi-Fi APAGADOS después de sincronizar, la notificación suena a la hora. Subir comprobante en el cel de Alex → en el cel de Tere, tras abrir la app, desaparecen los avisos pendientes.
- [ ] **Step 3:** `eas build -p android --profile preview` → APK. Instalar en los dos celulares (con Tailscale de la cuenta de Alex; a Tere se le comparte el equipo alex-llm o se agrega a la tailnet).
- [ ] **Step 4:** Commit `feat(app): avisos locales y chat`.

---

## Prerrequisitos de Alex (no bloquean Tasks 1–6, 8)

- Autorizar mi llave SSH en alex-llm + usuario (Task 7).
- Ruta del NAS en alex-llm (Task 7).
- Fin de semana con GPU libre para probar visión y chat reales (Task 5 Step 6, Task 7).
- Tailscale en el cel de Tere.
