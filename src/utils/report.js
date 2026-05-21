const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const { formatDuration, getPreviousWeekBounds } = require('./time');

/**
 * Build and send the weekly report to the report channel.
 * Shows a single summary embed: total hours + total sales for the week.
 * @param {import('discord.js').Client} client
 * @param {object} [bounds] — optional override; defaults to previous week
 */
async function sendWeeklyReport(client, bounds) {
  const { start, end, label } = bounds ?? getPreviousWeekBounds();

  const reportChannel = await client.channels.fetch(process.env.REPORT_CHANNEL_ID).catch(() => null);
  if (!reportChannel) {
    console.error('[Report] REPORT_CHANNEL_ID not found or bot lacks access.');
    return;
  }

  const employees = db.getAllEmployeesWithShifts(start, end);

  if (employees.length === 0) {
    await reportChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle(`📊 Weekly Report — ${label}`)
          .setDescription('No shifts recorded this week.')
          .setTimestamp(),
      ],
    });
    return;
  }

  // ── Aggregate totals across all employees ─────────────────────────────────
  let totalMinutes = 0;
  let totalSales   = 0;

  // Per-employee rows for the breakdown field
  const rows = [];

  for (const emp of employees) {
    const shifts = db.getWeekShifts(emp.discord_id, start, end);
    const empMinutes = shifts.reduce((s, sh) => s + (sh.duration_minutes ?? 0), 0);
    const empSales   = shifts.reduce((s, sh) => s + (sh.net_sales ?? 0), 0);

    totalMinutes += empMinutes;
    totalSales   += empSales;

    const dept = db.getDepartment(emp.role);
    const isCommission = dept?.pay_type === 'commission';

    const salesPart = isCommission ? ` | Sales: $${empSales.toFixed(2)}` : '';
    rows.push(`• **${emp.username}** — ${formatDuration(empMinutes)}${salesPart}`);
  }

  // ── Build single summary embed ────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`📊 Weekly Report — ${label}`)
    .addFields(
      { name: '🕐 Total Hours', value: formatDuration(totalMinutes), inline: true },
      { name: '💰 Total Sales', value: `$${totalSales.toFixed(2)}`, inline: true },
    )
    .setTimestamp();

  // Add employee breakdown in chunks safe for Discord (≤1024 chars per field)
  const CHUNK = 1024;
  let chunk = '';
  let first = true;
  for (const row of rows) {
    const line = chunk ? '\n' + row : row;
    if ((chunk + line).length > CHUNK) {
      embed.addFields({ name: first ? '👥 Breakdown' : '​', value: chunk });
      first = false;
      chunk = row;
    } else {
      chunk += line;
    }
  }
  if (chunk) embed.addFields({ name: first ? '👥 Breakdown' : '​', value: chunk });

  await reportChannel.send({ embeds: [embed] });
}

module.exports = { sendWeeklyReport };
