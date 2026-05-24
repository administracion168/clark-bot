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

// ── Step 1: button clicked → show model selector (multi-select) ───────────────

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
    .setPlaceholder('Select one or more models…')
    .setMinValues(1)
    .setMaxValues(models.length)
    .addOptions(models.map(m => ({ label: m.name, value: String(m.id) })));

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({
    content: `${info.emoji} **New ${info.label} Idea** — Select the model(s):`,
    components: [row],
    ephemeral: true,
  });
}

// ── Step 2: model(s) selected → show modal ────────────────────────────────────

async function handleIdeasSelect(interaction, type) {
  const modelIds = interaction.values; // array of id strings

  const info      = TYPE_LABELS[type];
  const modelList = modelIds
    .map(id => db.getModel(parseInt(id, 10)))
    .filter(Boolean);

  if (!modelList.length) {
    return interaction.update({ content: '❌ Model(s) not found.', components: [] });
  }

  // Encode all IDs in the modal customId (comma-separated)
  const idsParam = modelIds.join(',');

  const titleSuffix = modelList.length === 1
    ? modelList[0].name
    : `${modelList.length} models`;

  const modal = new ModalBuilder()
    .setCustomId(`ideas_modal_${type}_${idsParam}`)
    .setTitle(`${info.emoji} New ${info.label} Idea — ${titleSuffix}`);

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

// ── Step 3: modal submitted → save + send to each model ───────────────────────

async function handleIdeasModal(interaction, type, idsParam) {
  await interaction.deferReply({ ephemeral: true });

  const modelIds = idsParam.split(',').map(id => parseInt(id, 10));
  const models   = modelIds.map(id => db.getModel(id)).filter(Boolean);

  if (!models.length) {
    return interaction.editReply({ content: '❌ No valid models found.' });
  }

  const link  = interaction.fields.getTextInputValue('idea_link').trim();
  const notes = interaction.fields.getTextInputValue('idea_notes').trim();
  const info  = TYPE_LABELS[type];

  const results = { sent: [], skipped: [] };

  for (const model of models) {
    if (!model.telegram_chat_id) {
      results.skipped.push(`${model.name} (no Telegram)`);
      continue;
    }

    // 1. Save to DB
    const idea = db.createIdea({ modelId: model.id, type, link, notes });

    // 2. Send to Telegram
    try {
      const msgId = await sendIdeaToModel(idea, model);
      if (msgId) db.updateIdeaTelegramMessageId(idea.id, String(msgId));
    } catch (err) {
      console.error(`[Ideas] Failed to send Telegram to ${model.name}:`, err.message);
    }

    // 3. Airtable (fire-and-forget)
    createIdeaRecord({
      modelName: model.name,
      type,
      link,
      notes,
      createdAt: idea.created_at,
    }).then(recordId => {
      if (recordId) db.updateIdeaAirtableId(idea.id, recordId);
    }).catch(err => console.error('[Airtable] Error:', err.message));

    results.sent.push(model.name);
  }

  // Build confirmation message
  const lines = [];
  if (results.sent.length) {
    lines.push(`✅ **${info.label}** idea sent to: **${results.sent.join(', ')}**`);
  }
  if (results.skipped.length) {
    lines.push(`⚠️ Skipped (no Telegram): ${results.skipped.join(', ')}`);
  }
  lines.push(`🔗 ${link}`);

  await interaction.editReply({ content: lines.join('\n') });
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
  const id = interaction.customId; // ideas_modal_reddit_1,2,3 or ideas_modal_reels_5
  if (id.startsWith('ideas_modal_reddit_')) {
    const idsParam = id.replace('ideas_modal_reddit_', '');
    return handleIdeasModal(interaction, 'reddit', idsParam);
  }
  if (id.startsWith('ideas_modal_reels_')) {
    const idsParam = id.replace('ideas_modal_reels_', '');
    return handleIdeasModal(interaction, 'reels', idsParam);
  }
}

module.exports = { handleContentIdeasInteraction, handleIdeasModalSubmit };
