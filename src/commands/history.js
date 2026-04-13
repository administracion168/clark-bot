const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { isAdmin } = require('../utils/roles');
const { toESTFull, toESTDate, formatDuration } = require('../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('(Admin) View shift history for an employee.')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Employee to look up').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('days')
        .setDescription('How many days back to look (default: 7)')
        .setMinValue(1)
        .setMaxValue(365)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const days = interaction.options.getInteger('days') ?? 7;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const shifts = db.getShiftHistory(target.id, since);
    const emp = db.getEmployee(target.id);

    if (!emp) {
      return interaction.reply({
        content: `❌ No employee record found for **${target.username}**.`,
        ephemeral: true,
      });
    }

    if (shifts.length === 0) {
      return interaction.reply({
        content: `No shifts found for **${target.username}** in the last ${days} days.`,
        ephemeral: true,
      });
    }

    const roleLabel = emp.role === 'chatter' ? '💬 Chatter' : '📣 Marketing';
    const embed = new EmbedBuilder()
      .setColor(emp.role === 'chatter' ? 0x3498db : 0x9b59b6)
      .setTitle(`📋 Shift History — ${target.username}`)
      .setAuthor({
        name: `${target.username} — ${roleLabel}`,
        iconURL: target.displayAvatarURL({ size: 64 }),
      })
      .setFooter({ text: `Last ${days} days` })
      .setTimestamp();

    const lines = shifts.map((sh, i) => {
      const date = toESTDate(sh.clock_in);
      const clockIn = toESTFull(sh.clock_in);
      const clockOut = sh.clock_out ? toESTFull(sh.clock_out) : '⏳ Open';
      const dur = sh.duration_minutes != null ? formatDuration(sh.duration_minutes) : '—';
      const autoTag = sh.auto_closed ? ' ⚠️ AUTO-CLOSED' : '';
      const salesLine = emp.role === 'chatter' && sh.net_sales != null
        ? `\n> 💰 Net Sales: $${sh.net_sales.toFixed(2)}`
        : '';
      const summaryLine = sh.summary ? `\n> ${sh.summary}` : '';
      return `**${i + 1}. ${date}** — ${dur}${autoTag}\n> ${clockIn} → ${clockOut}${salesLine}${summaryLine}`;
    });

    // Discord embed field value limit is 1024 chars; paginate if needed
    const CHUNK_SIZE = 4;
    for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
      const chunk = lines.slice(i, i + CHUNK_SIZE).join('\n\n');
      embed.addFields({
        name: i === 0 ? 'Shifts' : '\u200B',
        value: chunk.slice(0, 1024),
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
