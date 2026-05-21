const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { resolveClarkRole, getLogChannelId } = require('../utils/roles');
const { toEST } = require('../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clockin')
    .setDescription('Clock in to start your shift.'),

  async execute(interaction) {
    let clarkRole = resolveClarkRole(interaction.member);

    // Fallback 1: roles.cache may be empty for uncached members after a bot restart.
    // Re-fetch the member from Discord to get a fresh role list.
    if (!clarkRole) {
      try {
        const freshMember = await interaction.guild.members.fetch(interaction.user.id);
        clarkRole = resolveClarkRole(freshMember);
      } catch (_) {}
    }

    // Fallback 2: if role still not found, check if admin already assigned
    // this employee to a department manually via /setrole
    if (!clarkRole) {
      const stored = db.getEmployee(interaction.user.id);
      if (stored?.role) clarkRole = stored.role;
    }

    if (!clarkRole) {
      return interaction.reply({
        content: "You don't have a valid role assigned. Please contact an admin.",
        ephemeral: true,
      });
    }

    // Sync employee record
    db.upsertEmployee(interaction.user.id, interaction.user.username, clarkRole);

    // Check for existing open shift
    const open = db.getOpenShift(interaction.user.id);
    if (open) {
      return interaction.reply({
        content: 'You already have an open shift. Use `/clockout` first.',
        ephemeral: true,
      });
    }

    db.clockIn(interaction.user.id);
    const now = new Date();

    await interaction.reply({
      content: `🟢 Clocked in at **${toEST(now)}** — Have a great shift!`,
      ephemeral: true,
    });

    // Post public clock-in notification to the department log channel
    try {
      const dept = db.getDepartment(clarkRole);
      const logChannel = await interaction.client.channels.fetch(getLogChannelId(clarkRole));
      const avatarURL = interaction.user.displayAvatarURL({ size: 64 });
      const deptLabel = dept?.display_name ?? clarkRole;

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setAuthor({ name: `${interaction.user.username} — ${deptLabel}`, iconURL: avatarURL })
        .setDescription(`🟢 **${interaction.user.username}** has clocked in.`)
        .addFields({ name: 'Clock In', value: toEST(now), inline: true })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[Clockin] Failed to post log embed:', err.message);
    }
  },
};
