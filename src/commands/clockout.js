const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const db = require('../database');
const { resolveClarkRole } = require('../utils/roles');
const { toEST, toESTFull, formatDuration } = require('../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clockout')
    .setDescription('Clock out and submit your shift summary.'),

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

    const open = db.getOpenShift(interaction.user.id);
    if (!open) {
      return interaction.reply({
        content: "You don't have an open shift. Use `/clockin` first.",
        ephemeral: true,
      });
    }

    // Build modal
    const modal = new ModalBuilder()
      .setCustomId(`clockout_modal_${open.id}`)
      .setTitle('Clock Out');

    const summaryInput = new TextInputBuilder()
      .setCustomId('summary')
      .setLabel('Shift Summary')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('What did you work on this shift?')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(summaryInput));

    if (clarkRole === 'chatter') {
      const salesInput = new TextInputBuilder()
        .setCustomId('net_sales')
        .setLabel('Net Sales ($)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 150.00')
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(salesInput));
    }

    await interaction.showModal(modal);
  },

  // Called from interactionCreate when modal is submitted
  async handleModal(interaction, client) {
    // Extract shift ID from custom ID: "clockout_modal_{shiftId}"
    const shiftId = parseInt(interaction.customId.split('_')[2], 10);

    const summary = interaction.fields.getTextInputValue('summary').trim();
    let netSales = null;

    const emp = db.getEmployee(interaction.user.id);
    if (emp?.role === 'chatter') {
      const rawSales = interaction.fields.getTextInputValue('net_sales').trim();
      netSales = parseFloat(rawSales);
      if (isNaN(netSales) || netSales < 0) {
        return interaction.reply({
          content: '❌ Invalid net sales amount. Please enter a valid positive number (e.g. 150.00).',
          ephemeral: true,
        });
      }
    }

    const shift = db.clockOut(shiftId, summary, netSales);

    // Ephemeral confirmation
    await interaction.reply({
      content: `🔴 Clocked out — Shift duration: **${formatDuration(shift.duration_minutes)}**. Thanks!`,
      ephemeral: true,
    });

    // Post embed to log channel
    try {
      const logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
      const avatarURL = interaction.user.displayAvatarURL({ size: 64 });

      const roleLabel = emp?.role === 'chatter' ? '💬 Chatter' : '📣 Marketing';
      const color = shift.auto_closed ? 0xe74c3c : 0x2ecc71;

      const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${interaction.user.username} — ${roleLabel}`, iconURL: avatarURL })
        .addFields(
          { name: 'Clock In', value: toESTFull(shift.clock_in), inline: true },
          { name: 'Clock Out', value: toESTFull(shift.clock_out), inline: true },
          { name: 'Duration', value: formatDuration(shift.duration_minutes), inline: true },
          { name: 'Shift Summary', value: summary },
        );

      if (emp?.role === 'chatter' && netSales !== null) {
        embed.addFields({ name: 'Net Sales', value: `$${netSales.toFixed(2)}`, inline: true });
      }

      embed.setTimestamp();
      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[Clockout] Failed to post log embed:', err.message);
    }
  },
};
