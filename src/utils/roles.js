/**
 * Resolve a guild member's Clark role ("chatter" or "marketing") from their Discord roles.
 * Returns null if they have neither.
 */
function resolveClarkRole(member) {
  const roleNames = member.roles.cache.map(r => r.name.toLowerCase());
  if (roleNames.includes('chatter')) return 'chatter';
  if (roleNames.includes('marketing')) return 'marketing';
  return null;
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

module.exports = { resolveClarkRole, isAdmin };
