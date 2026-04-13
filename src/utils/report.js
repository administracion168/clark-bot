const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const { toESTDate, toESTFull, formatDuration, getPreviousWeekBounds } = require('./time');

/**
 * Build and send the weekly report to the report channel.
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

  // ── Previous week for comparison ──────────────────────────────────────────
  const prevStart = new Date(new Date(start).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const prevEnd = new Date(new Date(end).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ── Aggregate all employees ────────────────────────────────────────────────
  let totalChatterPay = 0;
  let totalChatterHourly = 0;
  let totalChatterCommission = 0;
  let totalMarketingPay = 0;
  let totalTeamMinutes = 0;
  let totalNetSales = 0;

  const embeds = [];

  // Header embed
  embeds.push(
    new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`📊 Weekly Report — ${label}`)
      .setDescription(`Report generated <t:${Math.floor(Date.now() / 1000)}:F>`)
      .setTimestamp()
  );

  for (const emp of employees) {
    const shifts = db.getWeekShifts(emp.discord_id, start, end);
    const totalMinutes = shifts.reduce((s, sh) => s + (sh.duration_minutes ?? 0), 0);
    const totalHours = totalMinutes / 60;
    const avgHours = shifts.length > 0 ? totalHours / shifts.length : 0;

    totalTeamMinutes += totalMinutes;

    // Build shift list
    const shiftLines = shifts.map((sh, i) => {
      const date = toESTDate(sh.clock_in);
      const dur = formatDuration(sh.duration_minutes ?? 0);
      const autoTag = sh.auto_closed ? ' ⚠️ AUTO-CLOSED' : '';
      const salesLine = emp.role === 'chatter' && sh.net_sales != null
        ? ` | Sales: $${sh.net_sales.toFixed(2)}`
        : '';
      return `**${i + 1}.** ${date} (${dur})${salesLine}${autoTag}\n> ${sh.summary ?? '—'}`;
    }).join('\n');

    let payLine = '';
    let embed;

    if (emp.role === 'chatter') {
      const sales = shifts.reduce((s, sh) => s + (sh.net_sales ?? 0), 0);
      const avgSales = shifts.length > 0 ? sales / shifts.length : 0;
      const hourly = 2 * totalHours;
      const commission = 0.04 * sales;
      const payment = hourly + commission;

      totalNetSales += sales;
      totalChatterHourly += hourly;
      totalChatterCommission += commission;
      totalChatterPay += payment;

      payLine = `💰 **Payment due: ($2 × ${totalHours.toFixed(2)}h) + (4% × $${sales.toFixed(2)}) = $${payment.toFixed(2)}**`;

      embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setAuthor({ name: `💬 ${emp.username} — Chatter` })
        .addFields(
          { name: 'Shifts', value: String(shifts.length), inline: true },
          { name: 'Total Hours', value: formatDuration(totalMinutes), inline: true },
          { name: 'Avg Hours/Shift', value: formatDuration(Math.round(avgHours * 60)), inline: true },
          { name: 'Total Net Sales', value: `$${sales.toFixed(2)}`, inline: true },
          { name: 'Avg Sales/Shift', value: `$${avgSales.toFixed(2)}`, inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
        )
        .addFields({ name: 'Shift Summaries', value: shiftLines || '—' })
        .addFields({ name: '\u200B', value: payLine });
    } else {
      // Marketing
      const payment = emp.weekly_salary ?? 0;
      totalMarketingPay += payment;

      payLine = `💰 **Payment due: $${payment.toFixed(2)} (fixed weekly salary)**`;

      embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setAuthor({ name: `📣 ${emp.username} — Marketing` })
        .addFields(
          { name: 'Shifts', value: String(shifts.length), inline: true },
          { name: 'Total Hours', value: formatDuration(totalMinutes), inline: true },
          { name: 'Avg Hours/Shift', value: formatDuration(Math.round(avgHours * 60)), inline: true },
        )
        .addFields({ name: 'Shift Summaries', value: shiftLines || '—' })
        .addFields({ name: '\u200B', value: payLine });
    }

    embeds.push(embed);
  }

  // ── Payroll & Agency Summary ───────────────────────────────────────────────
  const totalPay = totalChatterPay + totalMarketingPay;

  // Previous week stats for comparison
  const prevEmployees = db.getAllEmployeesWithShifts(prevStart, prevEnd);
  let prevMinutes = 0;
  let prevSales = 0;
  for (const emp of prevEmployees) {
    const shifts = db.getWeekShifts(emp.discord_id, prevStart, prevEnd);
    prevMinutes += shifts.reduce((s, sh) => s + (sh.duration_minutes ?? 0), 0);
    if (emp.role === 'chatter') {
      prevSales += shifts.reduce((s, sh) => s + (sh.net_sales ?? 0), 0);
    }
  }

  const hoursPct = prevMinutes > 0
    ? ((totalTeamMinutes - prevMinutes) / prevMinutes * 100).toFixed(1)
    : 'N/A';
  const salesPct = prevSales > 0
    ? ((totalNetSales - prevSales) / prevSales * 100).toFixed(1)
    : 'N/A';

  const hoursTrend = typeof hoursPct === 'string' ? '' : (Number(hoursPct) >= 0 ? '▲' : '▼');
  const salesTrend = typeof salesPct === 'string' ? '' : (Number(salesPct) >= 0 ? '▲' : '▼');

  // Anomalies
  const allShifts = db.getAllEmployeesWithShifts(start, end).flatMap(emp =>
    db.getWeekShifts(emp.discord_id, start, end)
  );
  const autoClosed = allShifts.filter(s => s.auto_closed).length;
  const shortShifts = allShifts.filter(s => (s.duration_minutes ?? 0) < 30 && !s.auto_closed).length;

  const allEmps = db.getAllEmployees();
  const activeIds = new Set(employees.map(e => e.discord_id));
  const zeroShiftEmps = allEmps.filter(e => !activeIds.has(e.discord_id));
  const zeroShiftNames = zeroShiftEmps.map(e => e.username).join(', ') || 'None';

  let anomalies = [];
  if (autoClosed > 0) anomalies.push(`⚠️ ${autoClosed} auto-closed shift(s)`);
  if (shortShifts > 0) anomalies.push(`⏱️ ${shortShifts} shift(s) under 30 minutes`);
  if (zeroShiftEmps.length > 0) anomalies.push(`😴 Employees with 0 shifts: ${zeroShiftNames}`);

  const summaryEmbed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('📋 Payroll & Agency Summary')
    .addFields(
      {
        name: '💬 Chatter Payroll',
        value: `Hourly: $${totalChatterHourly.toFixed(2)} + Commission: $${totalChatterCommission.toFixed(2)} = **$${totalChatterPay.toFixed(2)}**`,
      },
      {
        name: '📣 Marketing Payroll',
        value: `$${totalMarketingPay.toFixed(2)}`,
      },
      {
        name: '💵 Total Payroll',
        value: `**$${totalPay.toFixed(2)}**`,
      },
      {
        name: '🕐 Total Team Hours',
        value: `${formatDuration(totalTeamMinutes)} ${hoursTrend}${hoursPct !== 'N/A' ? ` (${hoursPct}% vs prev week)` : ''}`,
        inline: true,
      },
      {
        name: '💰 Total Net Sales',
        value: `$${totalNetSales.toFixed(2)} ${salesTrend}${salesPct !== 'N/A' ? ` (${salesPct}% vs prev week)` : ''}`,
        inline: true,
      },
      {
        name: '⚠️ Anomalies',
        value: anomalies.length > 0 ? anomalies.join('\n') : '✅ None',
      },
    );

  embeds.push(summaryEmbed);

  // Discord limits 10 embeds per message; split if needed
  for (let i = 0; i < embeds.length; i += 10) {
    await reportChannel.send({ embeds: embeds.slice(i, i + 10) });
  }
}

module.exports = { sendWeeklyReport };
