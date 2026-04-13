const cron = require('node-cron');
const db = require('../database');
const { sendWeeklyReport } = require('./report');
const { getLogChannelId } = require('./roles');
const { EmbedBuilder } = require('discord.js');

/**
 * Start all scheduled jobs.
 * @param {import('discord.js').Client} client
 */
function startScheduler(client) {
  // ── Auto-close check: every hour ──────────────────────────────────────────
  cron.schedule('0 * * * *', async () => {
    const openShifts = db.getAllOpenShifts();
    const twelfveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    for (const shift of openShifts) {
      const clockIn = new Date(shift.clock_in);
      if (clockIn <= twelfveHoursAgo) {
        const closed = db.autoCloseShift(shift.id);
        console.log(`[AutoClose] Shift #${shift.id} for ${shift.discord_id} auto-closed.`);

        // Post warning to the role-specific log channel (or shared fallback)
        try {
          const emp = db.getEmployee(shift.discord_id);
          const logChannel = await client.channels.fetch(getLogChannelId(emp?.role));

          const embed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('⚠️ Shift Auto-Closed')
            .setDescription(`Shift for **${emp?.username ?? shift.discord_id}** was automatically closed after 12 hours.`)
            .addFields(
              { name: 'Clock In', value: closed.clock_in, inline: true },
              { name: 'Clock Out', value: closed.clock_out, inline: true },
              { name: 'Duration', value: '12h 0m', inline: true },
            )
            .setTimestamp();

          await logChannel.send({ embeds: [embed] });
        } catch (err) {
          console.error('[AutoClose] Failed to post log embed:', err.message);
        }

        // DM the employee
        try {
          const user = await client.users.fetch(shift.discord_id);
          await user.send(
            '⚠️ **Your shift was auto-closed after 12 hours.** If this was a mistake, please contact an admin.'
          );
        } catch (err) {
          console.error(`[AutoClose] Failed to DM ${shift.discord_id}:`, err.message);
        }
      }
    }
  });

  // ── Weekly report: every Monday at 03:00 AM EST (= 08:00 UTC) ─────────────
  // Cron runs in server local time — we schedule in UTC explicitly
  cron.schedule('0 8 * * 1', async () => {
    console.log('[Scheduler] Sending weekly report...');
    try {
      await sendWeeklyReport(client);
    } catch (err) {
      console.error('[Scheduler] Weekly report failed:', err);
    }
  }, { timezone: 'UTC' });

  console.log('[Scheduler] Jobs started: auto-close (hourly), weekly report (Mon 03:00 EST).');
}

module.exports = { startScheduler };
