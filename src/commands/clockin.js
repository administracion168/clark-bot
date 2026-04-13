const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { resolveClarkRole } = require('../utils/roles');
const { toEST } = require('../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clockin')
    .setDescription('Clock in to start your shift.'),

  async execute(interaction) {
    const clarkRole = resolveClarkRole(interaction.member);

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

    return interaction.reply({
      content: `🟢 Clocked in at **${toEST(now)}** — Have a great shift!`,
      ephemeral: true,
    });
  },
};
