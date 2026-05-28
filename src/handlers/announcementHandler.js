const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const db = require('../database');
const { isAdmin } = require('../utils/roles');
const { sendAnnouncementToModel } = require('../telegram/index');

// Temporarily stores selected model IDs while the modal is open
// userId → string[] (model IDs or 'ALL')
const pendingSelections = new Map();

async function handleAnnouncementInteraction(interaction) {
  const { customId } = interaction;

  // ── Button: open model selector ───────────────────────────────────────────
  if (customId === 'announce_btn') {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const models = db.getLinkedModels();
    if (!models.length) {
      return interaction.reply({
        content: '❌ No models are currently linked to Telegram.',
        ephemeral: true,
      });
    }

    const options = [
      {
        label: '📢 All models',
        value: 'ALL',
        description: `Send to all ${models.length} linked models`,
      },
      ...models.map((m) => ({
        label: m.name,
        value: String(m.id),
        description: `Send to ${m.name} only`,
      })),
    ];

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('announce_select')
        .setPlaceholder('Select one or more models...')
        .setMinValues(1)
        .setMaxValues(options.length)
        .addOptions(options),
    );

    return interaction.reply({
      content: '📢 **Who should receive this announcement?**',
      components: [row],
      ephemeral: true,
    });
  }

  // ── Select menu: store selection, open modal ──────────────────────────────
  if (customId === 'announce_select') {
    const selected = interaction.values; // string[]
    pendingSelections.set(interaction.user.id, selected);

    const modal = new ModalBuilder()
      .setCustomId('announce_modal')
      .setTitle('Send Announcement');

    const textInput = new TextInputBuilder()
      .setCustomId('announce_text')
      .setLabel('Message')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Write your announcement here...')
      .setMaxLength(1000)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    return interaction.showModal(modal);
  }

  // ── Modal submit: send to Telegram ────────────────────────────────────────
  if (customId === 'announce_modal') {
    await interaction.deferReply({ ephemeral: true });

    const text = interaction.fields.getTextInputValue('announce_text').trim();
    const selected = pendingSelections.get(interaction.user.id) ?? [];
    pendingSelections.delete(interaction.user.id);

    const allModels = db.getLinkedModels();

    // Resolve which models to send to
    const targets = selected.includes('ALL')
      ? allModels
      : allModels.filter((m) => selected.includes(String(m.id)));

    if (!targets.length) {
      return interaction.editReply({ content: '❌ No valid models found. Try again.' });
    }

    let sent = 0;
    let failed = 0;

    for (const model of targets) {
      const ok = await sendAnnouncementToModel(model.telegram_chat_id, text);
      if (ok) sent++;
      else failed++;
    }

    const names = targets.map((m) => `**${m.name}**`).join(', ');
    const summary = failed > 0
      ? `✅ Sent to ${sent} model(s): ${names}\n⚠️ Failed for ${failed} model(s).`
      : `✅ Announcement sent to ${sent} model(s): ${names}`;

    return interaction.editReply({ content: summary });
  }
}

module.exports = { handleAnnouncementInteraction };
