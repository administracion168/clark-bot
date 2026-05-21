// All times stored as UTC ISO strings in DB; displayed as EST (UTC-5).

const EST_OFFSET_MS = -5 * 60 * 60 * 1000;

/**
 * Format a UTC Date (or ISO string) as HH:MM EST
 */
function toEST(dateOrISO) {
  const d = typeof dateOrISO === 'string' ? new Date(dateOrISO) : dateOrISO;
  const est = new Date(d.getTime() + EST_OFFSET_MS);
  const hh = String(est.getUTCHours()).padStart(2, '0');
  const mm = String(est.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} EST`;
}

/**
 * Format a UTC Date as a human-readable date+time in EST: "Mon Apr 08, 14:30 EST"
 */
function toESTFull(dateOrISO) {
  const d = typeof dateOrISO === 'string' ? new Date(dateOrISO) : dateOrISO;
  const est = new Date(d.getTime() + EST_OFFSET_MS);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = days[est.getUTCDay()];
  const month = months[est.getUTCMonth()];
  const date = est.getUTCDate();
  const hh = String(est.getUTCHours()).padStart(2, '0');
  const mm = String(est.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${date}, ${hh}:${mm} EST`;
}

/**
 * Format a UTC Date as a short date in EST: "Apr 08"
 */
function toESTDate(dateOrISO) {
  const d = typeof dateOrISO === 'string' ? new Date(dateOrISO) : dateOrISO;
  const est = new Date(d.getTime() + EST_OFFSET_MS);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[est.getUTCMonth()]} ${String(est.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Convert minutes to a readable "Xh Ym" string.
 */
function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Get the start (Monday 00:00 EST) and end (Sunday 23:59:59 EST)
 * of the PREVIOUS week, returned as UTC ISO strings.
 */
function getPreviousWeekBounds() {
  const now = new Date();
  // Current day in EST
  const estNow = new Date(now.getTime() + EST_OFFSET_MS);

  // Day of week: 0=Sun, 1=Mon … 6=Sat
  const dow = estNow.getUTCDay();
  // Days since last Monday (if today is Mon, dow=1, offset=0 for this week)
  // We want PREVIOUS week so we go back to last Monday - 7 days
  const daysToThisMonday = (dow === 0 ? 6 : dow - 1);
  const thisMondayEST = new Date(estNow);
  thisMondayEST.setUTCDate(estNow.getUTCDate() - daysToThisMonday);
  thisMondayEST.setUTCHours(0, 0, 0, 0);

  const prevMondayEST = new Date(thisMondayEST);
  prevMondayEST.setUTCDate(thisMondayEST.getUTCDate() - 7);

  const prevSundayEST = new Date(prevMondayEST);
  prevSundayEST.setUTCDate(prevMondayEST.getUTCDate() + 6);
  prevSundayEST.setUTCHours(23, 59, 59, 999);

  // Convert back to UTC for DB queries
  const startUTC = new Date(prevMondayEST.getTime() - EST_OFFSET_MS);
  const endUTC = new Date(prevSundayEST.getTime() - EST_OFFSET_MS);

  return {
    start: startUTC.toISOString(),
    end: endUTC.toISOString(),
    label: `${toESTDate(startUTC)} – ${toESTDate(endUTC)}`,
  };
}

/**
 * Get current week bounds (Mon 00:00 EST to now) for /mystats
 */
function getCurrentWeekBounds() {
  const now = new Date();
  const estNow = new Date(now.getTime() + EST_OFFSET_MS);
  const dow = estNow.getUTCDay();
  const daysToMonday = (dow === 0 ? 6 : dow - 1);
  const mondayEST = new Date(estNow);
  mondayEST.setUTCDate(estNow.getUTCDate() - daysToMonday);
  mondayEST.setUTCHours(0, 0, 0, 0);

  const sundayEST = new Date(mondayEST);
  sundayEST.setUTCDate(mondayEST.getUTCDate() + 6);
  sundayEST.setUTCHours(23, 59, 59, 999);

  const startUTC = new Date(mondayEST.getTime() - EST_OFFSET_MS);
  const endUTC = new Date(sundayEST.getTime() - EST_OFFSET_MS);

  return {
    start: startUTC.toISOString(),
    end: endUTC.toISOString(),
    label: `${toESTDate(startUTC)} – ${toESTDate(endUTC)}`,
  };
}

module.exports = { toEST, toESTFull, toESTDate, formatDuration, getPreviousWeekBounds, getCurrentWeekBounds };
