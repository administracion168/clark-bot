const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'clark.db'));

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    discord_id TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    role       TEXT NOT NULL,
    weekly_salary REAL
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id       TEXT NOT NULL REFERENCES employees(discord_id),
    clock_in         DATETIME NOT NULL,
    clock_out        DATETIME,
    duration_minutes INTEGER,
    summary          TEXT,
    net_sales        REAL,
    auto_closed      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS departments (
    name            TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    pay_type        TEXT NOT NULL DEFAULT 'hours_only',
    log_channel_id  TEXT,
    chat_channel_id TEXT,
    info_channel_id TEXT,
    role_id         TEXT
  );
`);

// ─── Migration: remove CHECK constraint from employees if present ──────────
(function runMigrations() {
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='employees'"
  ).get();
  if (tableInfo && tableInfo.sql && tableInfo.sql.includes('CHECK(role IN')) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`CREATE TABLE employees_new (
        discord_id TEXT PRIMARY KEY,
        username   TEXT NOT NULL,
        role       TEXT NOT NULL,
        weekly_salary REAL
      );`);
      db.exec('INSERT INTO employees_new SELECT * FROM employees;');
      db.exec('DROP TABLE employees;');
      db.exec('ALTER TABLE employees_new RENAME TO employees;');
    })();
    db.pragma('foreign_keys = ON');
    console.log('[DB] Migration: removed role CHECK constraint from employees.');
  }
})();

// ─── Seed chatter department (the only built-in dept) ────────────────────
(function seedDepartments() {
  db.prepare(
    'INSERT OR IGNORE INTO departments (name, display_name, pay_type) VALUES (?, ?, ?)'
  ).run('chatter', 'Chatter', 'commission');

  // Departments are never auto-deleted on startup.
  // Use /deletedepartment to remove a department manually.

  // Seed reddit department with its fixed log channel
  db.prepare(`
    INSERT OR IGNORE INTO departments (name, display_name, pay_type, log_channel_id)
    VALUES ('reddit', 'Reddit', 'hours_only', '1499560679802404924')
  `).run();
  // Always force the correct log channel for reddit (in case it was changed or corrupted)
  db.prepare(`
    UPDATE departments SET log_channel_id = '1499560679802404924'
    WHERE name = 'reddit'
  `).run();

  // Ensure Instagram department exists and has the correct Discord role_id
  db.prepare(`
    INSERT OR IGNORE INTO departments (name, display_name, pay_type, role_id)
    VALUES ('instagram', 'Instagram', 'hours_only', '1502096268271554590')
  `).run();
  db.prepare(`
    UPDATE departments SET role_id = '1502096268271554590'
    WHERE name = 'instagram'
  `).run();
})();

// ─── Departments ──────────────────────────────────────────────────────────

function getAllDepartments() {
  return db.prepare('SELECT * FROM departments ORDER BY name ASC').all();
}

function getDepartment(name) {
  return db.prepare('SELECT * FROM departments WHERE name = ?').get(name);
}

function deleteDepartment(name) {
  db.prepare('DELETE FROM departments WHERE name = ?').run(name);
}

function createDepartment(name, displayName, payType, channels = {}) {
  db.prepare(`
    INSERT INTO departments (name, display_name, pay_type, log_channel_id, chat_channel_id, info_channel_id, role_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, displayName, payType,
    channels.logChannelId ?? null,
    channels.chatChannelId ?? null,
    channels.infoChannelId ?? null,
    channels.roleId ?? null,
  );
}

// ─── Employees ────────────────────────────────────────────────────────────

function upsertEmployee(discordId, username, role) {
  db.prepare(`
    INSERT INTO employees (discord_id, username, role)
    VALUES (?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, role = excluded.role
  `).run(discordId, username, role);
}

function getEmployee(discordId) {
  return db.prepare('SELECT * FROM employees WHERE discord_id = ?').get(discordId);
}

function setEmployeeRole(discordId, username, role, weeklySalary = null) {
  db.prepare(`
    INSERT INTO employees (discord_id, username, role, weekly_salary)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      username = excluded.username,
      role = excluded.role,
      weekly_salary = excluded.weekly_salary
  `).run(discordId, username, role, weeklySalary);
}

function setWeeklySalary(discordId, amount) {
  db.prepare('UPDATE employees SET weekly_salary = ? WHERE discord_id = ?').run(amount, discordId);
}

// ─── Shifts ───────────────────────────────────────────────────────────────

function getOpenShift(discordId) {
  return db.prepare(`
    SELECT * FROM shifts WHERE discord_id = ? AND clock_out IS NULL
  `).get(discordId);
}

function clockIn(discordId) {
  const stmt = db.prepare('INSERT INTO shifts (discord_id, clock_in) VALUES (?, ?)');
  const info = stmt.run(discordId, new Date().toISOString());
  return info.lastInsertRowid;
}

function clockOut(shiftId, summary, netSales) {
  const now = new Date();
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
  const clockInDate = new Date(shift.clock_in);
  const durationMinutes = Math.round((now - clockInDate) / 60000);

  db.prepare(`
    UPDATE shifts
    SET clock_out = ?, duration_minutes = ?, summary = ?, net_sales = ?
    WHERE id = ?
  `).run(now.toISOString(), durationMinutes, summary, netSales ?? null, shiftId);

  return { ...shift, clock_out: now.toISOString(), duration_minutes: durationMinutes, summary, net_sales: netSales ?? null };
}

function autoCloseShift(shiftId) {
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
  const clockInDate = new Date(shift.clock_in);
  const clockOut = new Date(clockInDate.getTime() + 12 * 60 * 60 * 1000);
  const durationMinutes = 12 * 60;

  db.prepare(`
    UPDATE shifts
    SET clock_out = ?, duration_minutes = ?, summary = ?, auto_closed = 1
    WHERE id = ?
  `).run(clockOut.toISOString(), durationMinutes, 'AUTO-CLOSED: Shift exceeded 12 hours', shiftId);

  return db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
}

function getAllOpenShifts() {
  return db.prepare('SELECT * FROM shifts WHERE clock_out IS NULL').all();
}

function getWeekShifts(discordId, weekStart, weekEnd) {
  return db.prepare(`
    SELECT * FROM shifts
    WHERE discord_id = ?
      AND clock_in >= ?
      AND clock_in <= ?
      AND clock_out IS NOT NULL
    ORDER BY clock_in ASC
  `).all(discordId, weekStart, weekEnd);
}

function getShiftHistory(discordId, sinceISO) {
  return db.prepare(`
    SELECT * FROM shifts
    WHERE discord_id = ? AND clock_in >= ?
    ORDER BY clock_in DESC
  `).all(discordId, sinceISO);
}

function getAllEmployeesWithShifts(weekStart, weekEnd) {
  return db.prepare(`
    SELECT DISTINCT e.*
    FROM employees e
    INNER JOIN shifts s ON s.discord_id = e.discord_id
    WHERE s.clock_in >= ? AND s.clock_in <= ? AND s.clock_out IS NOT NULL
  `).all(weekStart, weekEnd);
}

function getAllEmployees() {
  return db.prepare('SELECT * FROM employees').all();
}


// ─── Models & Tickets (ticket system) ────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS models (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    role_id         TEXT NOT NULL UNIQUE,
    telegram_chat_id TEXT,
    link_code       TEXT UNIQUE,
    linked          INTEGER NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number        INTEGER NOT NULL,
    model_id             INTEGER NOT NULL REFERENCES models(id),
    chatter_discord_id   TEXT NOT NULL,
    chatter_username     TEXT NOT NULL,
    channel_id           TEXT,
    type                 TEXT NOT NULL,
    description          TEXT NOT NULL,
    price                TEXT,
    priority             TEXT NOT NULL DEFAULT 'normal',
    client_estimated_time TEXT,
    status               TEXT NOT NULL DEFAULT 'pending',
    model_estimated_days INTEGER,
    deny_reason          TEXT,
    telegram_message_id  TEXT,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at          DATETIME,
    completed_at         DATETIME
  );

  CREATE TABLE IF NOT EXISTS ticket_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id   INTEGER NOT NULL REFERENCES tickets(id),
    sender      TEXT NOT NULL,
    sender_name TEXT,
    message     TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Model functions ───────────────────────────────────────────────────────────

function createModel(name, roleId, linkCode) {
  db.prepare(
    'INSERT OR IGNORE INTO models (name, role_id, link_code) VALUES (?, ?, ?)'
  ).run(name, roleId, linkCode);
}

function getModel(id) {
  return db.prepare('SELECT * FROM models WHERE id = ?').get(id);
}

function getModelByRoleId(roleId) {
  return db.prepare('SELECT * FROM models WHERE role_id = ?').get(roleId);
}

function getModelByLinkCode(code) {
  return db.prepare('SELECT * FROM models WHERE link_code = ?').get(code);
}

function getModelByTelegramId(telegramChatId) {
  return db.prepare('SELECT * FROM models WHERE telegram_chat_id = ?').get(telegramChatId);
}

function getAllModels() {
  return db.prepare('SELECT * FROM models ORDER BY name ASC').all();
}

function getLinkedModels() {
  return db.prepare('SELECT * FROM models WHERE linked = 1 ORDER BY name ASC').all();
}

function linkModelTelegram(modelId, telegramChatId) {
  db.prepare(
    'UPDATE models SET telegram_chat_id = ?, linked = 1, link_code = NULL WHERE id = ?'
  ).run(telegramChatId, modelId);
}

function setModelLanguage(modelId, lang) {
  db.prepare('UPDATE models SET language = ? WHERE id = ?').run(lang, modelId);
}

function deleteModel(id) {
  db.prepare('DELETE FROM models WHERE id = ?').run(id);
}

function deactivateModel(id) {
  db.prepare(
    'UPDATE models SET linked = 0, telegram_chat_id = NULL, link_code = NULL WHERE id = ?'
  ).run(id);
}

function setModelAirtableTableId(id, airtableTableId) {
  db.prepare('UPDATE models SET airtable_table_id = ? WHERE id = ?').run(airtableTableId, id);
}

// Migration: add language column if it doesn't exist yet
try { db.exec("ALTER TABLE models ADD COLUMN language TEXT NOT NULL DEFAULT 'en'"); } catch (_) {}
// Migration: add airtable_table_id column to models if it doesn't exist yet
try { db.exec("ALTER TABLE models ADD COLUMN airtable_table_id TEXT"); } catch (_) {}

// ─── Ideas ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS ideas (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id            INTEGER NOT NULL REFERENCES models(id),
    type                TEXT NOT NULL,
    link                TEXT NOT NULL,
    notes               TEXT,
    status              TEXT NOT NULL DEFAULT 'pending',
    created_at          TEXT NOT NULL,
    completed_at        TEXT,
    telegram_message_id TEXT,
    airtable_record_id  TEXT
  );
`);

function createIdea({ modelId, type, link, notes }) {
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO ideas (model_id, type, link, notes, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(modelId, type, link, notes || null, now);
  return db.prepare('SELECT * FROM ideas WHERE id = ?').get(info.lastInsertRowid);
}

function getIdea(id) {
  return db.prepare('SELECT * FROM ideas WHERE id = ?').get(id);
}

function getModelPendingIdeas(modelId) {
  return db.prepare(`
    SELECT * FROM ideas WHERE model_id = ? AND status = 'pending'
    ORDER BY created_at ASC
  `).all(modelId);
}

function getModelAllIdeas(modelId) {
  return db.prepare(`
    SELECT * FROM ideas WHERE model_id = ?
    ORDER BY created_at DESC
  `).all(modelId);
}

function completeIdea(id) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE ideas SET status = 'completed', completed_at = ? WHERE id = ?
  `).run(now, id);
  return db.prepare('SELECT * FROM ideas WHERE id = ?').get(id);
}

function updateIdeaAirtableId(id, airtableRecordId) {
  db.prepare('UPDATE ideas SET airtable_record_id = ? WHERE id = ?').run(airtableRecordId, id);
}

function updateIdeaTelegramMessageId(id, telegramMessageId) {
  db.prepare('UPDATE ideas SET telegram_message_id = ? WHERE id = ?').run(telegramMessageId, id);
}

// ─── Config (key/value store for bot settings) ────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function getConfig(key) {
  return db.prepare('SELECT value FROM config WHERE key = ?').get(key)?.value ?? null;
}

function setConfig(key, value) {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
}

// ── Ticket functions ──────────────────────────────────────────────────────────

function createTicket(modelId, chatterDiscordId, chatterUsername, type, description, price, priority, clientEstimatedTime) {
  const count = db.prepare('SELECT COUNT(*) as c FROM tickets').get().c;
  const ticketNumber = count + 1;
  const info = db.prepare(`
    INSERT INTO tickets (ticket_number, model_id, chatter_discord_id, chatter_username, type, description, price, priority, client_estimated_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ticketNumber, modelId, chatterDiscordId, chatterUsername, type, description, price || null, priority, clientEstimatedTime || null);
  return info.lastInsertRowid;
}

function getTicket(id) {
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
}

function getTicketByChannelId(channelId) {
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function updateTicketChannel(ticketId, channelId) {
  db.prepare('UPDATE tickets SET channel_id = ? WHERE id = ?').run(channelId, ticketId);
}

function updateTicketTelegram(ticketId, telegramMessageId) {
  db.prepare('UPDATE tickets SET telegram_message_id = ? WHERE id = ?').run(telegramMessageId, ticketId);
}

function updateTicketStatus(ticketId, status, extra = {}) {
  const now = new Date().toISOString();
  if (status === 'accepted') {
    db.prepare('UPDATE tickets SET status = ?, model_estimated_days = ?, accepted_at = ? WHERE id = ?')
      .run(status, extra.modelEstimatedDays ?? null, now, ticketId);
  } else if (status === 'denied') {
    db.prepare('UPDATE tickets SET status = ?, deny_reason = ? WHERE id = ?')
      .run(status, extra.denyReason ?? null, ticketId);
  } else if (status === 'completed') {
    db.prepare('UPDATE tickets SET status = ?, completed_at = ? WHERE id = ?')
      .run(status, now, ticketId);
  } else {
    db.prepare('UPDATE tickets SET status = ? WHERE id = ?').run(status, ticketId);
  }
}

function addTicketMessage(ticketId, sender, senderName, message) {
  db.prepare(
    'INSERT INTO ticket_messages (ticket_id, sender, sender_name, message) VALUES (?, ?, ?, ?)'
  ).run(ticketId, sender, senderName, message);
}

function getTicketMessages(ticketId) {
  return db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC').all(ticketId);
}

function getAllTickets({ status = null, modelId = null, limit = 25, offset = 0 } = {}) {
  let query = `
    SELECT t.*, m.name AS model_name
    FROM tickets t
    LEFT JOIN models m ON m.id = t.model_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (modelId) { query += ' AND t.model_id = ?'; params.push(modelId); }
  query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(query).all(...params);
}

function getTicketByNumber(ticketNumber) {
  return db.prepare(`
    SELECT t.*, m.name AS model_name
    FROM tickets t
    LEFT JOIN models m ON m.id = t.model_id
    WHERE t.ticket_number = ?
  `).get(ticketNumber);
}

function countAllTickets({ status = null, modelId = null } = {}) {
  let query = 'SELECT COUNT(*) as c FROM tickets t WHERE 1=1';
  const params = [];
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (modelId) { query += ' AND t.model_id = ?'; params.push(modelId); }
  return db.prepare(query).get(...params).c;
}

module.exports = {
  // Departments
  getAllDepartments,
  getDepartment,
  createDepartment,
  deleteDepartment,
  // Models
  createModel,
  getModel,
  getModelByRoleId,
  getModelByLinkCode,
  getModelByTelegramId,
  getAllModels,
  getLinkedModels,
  linkModelTelegram,
  setModelLanguage,
  setModelAirtableTableId,
  deleteModel,
  deactivateModel,
  // Tickets
  createTicket,
  getTicket,
  getTicketByChannelId,
  updateTicketChannel,
  updateTicketTelegram,
  updateTicketStatus,
  addTicketMessage,
  getTicketMessages,
  getAllTickets,
  countAllTickets,
  getTicketByNumber,
  // Ideas
  createIdea,
  getIdea,
  getModelPendingIdeas,
  getModelAllIdeas,
  completeIdea,
  updateIdeaAirtableId,
  updateIdeaTelegramMessageId,
  // Config
  getConfig,
  setConfig,
  // Employees
  upsertEmployee,
  getEmployee,
  setEmployeeRole,
  setWeeklySalary,
  // Shifts
  getOpenShift,
  clockIn,
  clockOut,
  autoCloseShift,
  getAllOpenShifts,
  getWeekShifts,
  getShiftHistory,
  getAllEmployeesWithShifts,
  getAllEmployees,
};
