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
    role       TEXT NOT NULL CHECK(role IN ('chatter', 'marketing')),
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
`);

// ─── Employees ────────────────────────────────────────────────────────────────

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

// ─── Shifts ───────────────────────────────────────────────────────────────────

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

// Shifts for the current week (Mon 00:00 EST to now)
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

// All employees with at least one shift in a date range (for weekly report)
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

module.exports = {
  upsertEmployee,
  getEmployee,
  setEmployeeRole,
  setWeeklySalary,
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
