const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const db          = require('../database');
const { sendIdeaToModel }   = require('../telegram/index');
const { createIdeaRecord }  = require('../utils/airtable');

const TYPE_LABELS = {
  reddit: { label: 'Reddit',           emoji: '💡', color: 0xff4500 },
  reels:  { label: 'Instagram Reels',  emoji: '🎬', color: 0xe1306c },
};

// ── Step 1: button clicked → show model selector ──────────────────────────────

async function handleIdeasButton(interaction, type) {
  const models = db.getLinkedModels();

  if (!models.length) {
    return interaction.reply({
      content: '❌ No models are linked yet. Use `/setupmodel` first.',
      ephemeral: true,
    });
  }

  const info   = TYPE_LABELS[type];
  const select = new StringSelectMenuBuilder()
    .setCustomId(`ideas_select_${type}`)
    .setPlaceholder('Select a model…')
    .addOptions(models.map(m => ({ label: m.name, value: String(m.id) })));

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({
    content: `${info.emoji} **New ${info.label} Idea** — Select the model:`,
    components: [row],
    ephemeral: true,
  });
}

// ── Step 2: model selected → show modal ───────────────────────────────────────

async function handleIdeasSelect(interaction, type) {
  const modelId = interaction.values[0];
  const model   = db.getModel(parseInt(modelId, 10));

  if (!model) {
    return interaction.update({ content: '❌ Model not found.', components: [] });
  }

  const info  = TYPE_LABELS[type];
  const modal = new ModalBuilder()
    .setCustomId(`ideas_modal_${type}_${modelId}`)
    .setTitle(`${info.emoji} New ${info.label} Idea — ${model.name}`);

  const linkInput = new TextInputBuilder()
    .setCustomId('idea_link')
    .setLabel('Idea Link')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://...')
    .setRequired(true)
    .setMaxLength(500);

  const notesInput = new TextInputBuilder()
    .setCustomId('idea_notes')
    .setLabel('Important Notes')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Add any context, instructions or important details here…')
    .setRequired(false)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(linkInput),
    new ActionRowBuilder().addComponents(notesInput),
  );

  await interaction.showModal(modal);
}

// ── Step 3: modal submitted → save + send to Telegram + Airtable ──────────────

async function handleIdeasModal(interaction, type, modelId) {
  await interaction.deferReply({ ephemeral: true });

  const model = db.getModel(parseInt(modelId, 10));
  if (!model) {
    return interaction.editReply({ content: '❌ Model not found.' });
  }

  if (!model.telegram_chat_id) {
    return interaction.editReply({
      content: `❌ **${model.name}** hasn't linked their Telegram yet.`,
    });
  }

  const link  = interaction.fields.getTextInputValue('idea_link').trim();
  const notes = interaction.fields.getTextInputValue('idea_notes').trim();

  // 1. Save to DB
  const idea = db.createIdea({ modelId: model.id, type, link, notes });

  // 2. Send to Telegram and store message_id
  try {
    const msgId = await sendIdeaToModel(idea, model);
    if (msgId) db.updateIdeaTelegramMessageId(idea.id, String(msgId));
  } catch (err) {
    console.error('[Ideas] Failed to send Telegram message:', err.message);
  }

  // 3. Create Airtable record in the Reddit or Reels table (fire-and-forget)
  createIdeaRecord({
    modelName: model.name,
    type,
    link,
    notes,
    createdAt: idea.created_at,
  }).then(recordId => {
    if (recordId) db.updateIdeaAirtableId(idea.id, recordId);
  }).catch(err => console.error('[Airtable] Error:', err.message));

  const info = TYPE_LABELS[type];
  await interaction.editReply({
    content: `✅ **${info.label}** idea sent to **${model.name}** on Telegram.\n🔗 ${link}`,
  });
}

// ── Main router ───────────────────────────────────────────────────────────────

async function handleContentIdeasInteraction(interaction) {
  const id = interaction.customId ?? '';

  if (id === 'ideas_reddit_btn') return handleIdeasButton(interaction, 'reddit');
  if (id === 'ideas_reels_btn')  return handleIdeasButton(interaction, 'reels');

  if (id === 'ideas_select_reddit') return handleIdeasSelect(interaction, 'reddit');
  if (id === 'ideas_select_reels')  return handleIdeasSelect(interaction, 'reels');
}

// ── Modal handler (called from interactionCreate.js) ─────────────────────────

async function handleIdeasModalSubmit(interaction) {
  const id = interaction.customId; // ideas_modal_reddit_123 or ideas_modal_reels_123
  if (id.startsWith('ideas_modal_reddit_')) {
    const modelId = id.replace('ideas_modal_reddit_', '');
    return handleIdeasModal(interaction, 'reddit', modelId);
  }
  if (id.startsWith('ideas_modal_reels_')) {
    const modelId = id.replace('ideas_modal_reels_', '');
    return handleIdeasModal(interaction, 'reels', modelId);
  }
}

module.exports = { handleContentIdeasInteraction, handleIdeasModalSubmit };
