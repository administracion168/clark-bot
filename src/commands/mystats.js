const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { resolveClarkRole } = require('../utils/roles');
const { formatDuration, getCurrentWeekBounds } = require('../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mystats')
    .setDescription('View your stats for the current week.'),

  async execute(interaction) {
    const clarkRole = resolveClarkRole(interaction.member);

    if (!clarkRole) {
      return interaction.reply({
        content: "You don't have a valid role assigned. Please contact an admin.",
        ephemeral: true,
      });
    }

    db.upsertEmployee(interaction.user.id, interaction.user.username, clarkRole);

    const { start, end, label } = getCurrentWeekBounds();
    const shifts = db.getWeekShifts(interaction.user.id, start, end);

    const totalMinutes = shifts.reduce((s, sh) => s + (sh.duration_minutes ?? 0), 0);

    const embed = new EmbedBuilder()
      .setColor(clarkRole === 'chatter' ? 0x3498db : 0x9b59b6)
      .setTitle(`📅 My Stats — ${label}`)
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL({ size: 64 }),
      })
      .addFields(
        { name: 'Role', value: clarkRole === 'chatter' ? '💬 Chatter' : '📣 Marketing', inline: true },
        { name: 'Shifts Worked', value: String(shifts.length), inline: true },
        { name: 'Total Hours', value: formatDuration(totalMinutes), inline: true },
      )
      .setTimestamp();

    if (clarkRole === 'chatter') {
      const totalSales = shifts.reduce((s, sh) => s + (sh.net_sales ?? 0), 0);
      const avgSales = shifts.length > 0 ? totalSales / shifts.length : 0;
      embed.addFields(
        { name: 'Total Net Sales', value: `$${totalSales.toFixed(2)}`, inline: true },
        { name: 'Avg Net Sales / Shift', value: `$${avgSales.toFixed(2)}`, inline: true },
      );
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
