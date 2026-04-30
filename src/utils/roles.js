const db = require('../database');

/**
 * Resolve a guild member's Clark department from their Discord roles.
 * Checks dynamically against the departments table.
 * Returns the department name (lowercase) or null if none found.
 */
function resolveClarkRole(member) {
  const departments = db.getAllDepartments();
  const deptNames = new Set(departments.map(d => d.name.toLowerCase()));
  const memberRoleName = member.roles.cache
    .map(r => r.name.toLowerCase())
    .find(r => deptNames.has(r));
  return memberRoleName ?? null;
}

/**
 * Check if a member is an admin (Administrator permission OR has ADMIN_ROLE_ID env role).
 */
function isAdmin(member) {
  if (member.permissions.has('Administrator')) return true;
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  if (adminRoleId && member.roles.cache.has(adminRoleId)) return true;
  return false;
}

/**
 * Return the correct log channel ID for a given Clark role.
 * Looks up the department's dedicated log_channel_id, falls back to LOG_CHANNEL_ID.
 */
function getLogChannelId(role) {
  if (role) {
    const dept = db.getDepartment(role);
    if (dept?.log_channel_id) return dept.log_channel_id;
  }
  return process.env.LOG_CHANNEL_ID;
}

module.exports = { resolveClarkRole, isAdmin, getLogChannelId };
