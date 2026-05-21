const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');
const db = require('../database');
const { sendRequestToModel, forwardToModel, notifyModelCancelledByChatter } = require('../telegram/index');

const TYPE_OPTIONS = [
  { label: '🎬 Custom Video',  value: 'video',    description: 'A personalised video' },
  { label: '📸 Custom Photo',  value: 'photo',    description: 'A personalised photo' },
  { label: '🎙️ Custom Audio',  value: 'audio',    description: 'A personalised audio/voice note' },
  { label: '❓ Question',      value: 'question', description: 'Ask the model something' },
  { label: '📋 Other',         value: 'other',    description: 'Anything else' },
];

function typeLabel(type) {
  return TYPE_OPTIONS.find(t => t.value === type)?.label ?? type;
}

// ── Step 1: "New Request" button clicked → show model select ─────────────────

async function handleNewRequest(interaction) {
  const memberRoleIds = new Set(interaction.member.roles.cache.map(r => r.id));
  const models = db.getLinkedModels().filter(m => memberRoleIds.has(m.role_id));

  if (models.length === 0) {
    return interaction.reply({
      content: '❌ No models available for your account. Contact an admin.',
      ephemeral: true,
    });
  }

  const options = models.map(m => {
    const role = interaction.guild.roles.cache.get(m.role_id);
    return { label: role?.name ?? m.name, value: String(m.id) };
  });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('req_select_model')
      .setPlaceholder('Select the model...')
      .addOptions(options)
  );

  return interaction.reply({ content: '**Step 1 of 3** — Select the model:', components: [row], ephemeral: true });
}

// ── Step 2: Model selected → show type select ─────────────────────────────────

async function handleSelectModel(interaction) {
  const modelId = interaction.values[0];

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`req_select_type_${modelId}`)
      .setPlaceholder('Select request type...')
      .addOptions(TYPE_OPTIONS)
  );

  return interaction.update({ content: '**Step 2 of 3** — Select the request type:', components: [row] });
}

// ── Step 3: Type selected → show details modal ────────────────────────────────

async function handleSelectType(interaction, modelId, type) {
  const modal = new ModalBuilder()
    .setCustomId(`req_modal_${modelId}_${type}`)
    .setTitle('Request Details');

  const descInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe exactly what the client wants...')
    .setRequired(true);

  const priceInput = new TextInputBuilder()
    .setCustomId('price')
    .setLabel('Price ($)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 50')
    .setRequired(false);

  const priorityInput = new TextInputBuilder()
    .setCustomId('priority')
    .setLabel('Priority (urgent / normal)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('normal')
    .setValue('normal')
    .setRequired(true);

  const estimateInput = new TextInputBuilder()
    .setCustomId('estimate')
    .setLabel('Client requested delivery time')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 2 days')
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(priceInput),
    new ActionRowBuilder().addComponents(priorityInput),
    new ActionRowBuilder().addComponents(estimateInput),
  );

  return interaction.showModal(modal);
}

// ── Step 4: Modal submitted → create channel + send to Telegram ───────────────

async function handleModalSubmit(interaction, modelId, type) {
  await interaction.deferReply({ ephemeral: true });

  const description = interaction.fields.getTextInputValue('description').trim();
  const price       = interaction.fields.getTextInputValue('price').trim() || null;
  const priorityRaw = interaction.fields.getTextInputValue('priority').trim().toLowerCase();
  const estimate    = interaction.fields.getTextInputValue('estimate').trim() || null;
  const priority    = priorityRaw === 'urgent' ? 'urgent' : 'normal';

  const model = db.getModel(parseInt(modelId));
  if (!model) return interaction.editReply('❌ Model not found.');

  const guild       = interaction.guild;
  const chatter     = interaction.user;
  const modelRole   = guild.roles.cache.get(model.role_id);
  const everyoneId  = guild.roles.everyone.id;

  // Find admin role for permissions
  const adminRoleId = process.env.ADMIN_ROLE_ID;

  // Create ticket in DB first to get the ticket number
  const ticketId = db.createTicket(
    model.id, chatter.id, chatter.username,
    type, description, price, priority, estimate
  );
  const ticket = db.getTicket(ticketId);

  // Channel name: req-modelname-NNN
  const channelName = `req-${(model.name).toLowerCase().replace(/\s+/g, '-')}-${String(ticket.ticket_number).padStart(3, '0')}`;

  // Build permission overwrites
  const permOverwrites = [
    { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
  ];
  if (modelRole) {
    permOverwrites.push({
      id: modelRole.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }
  if (adminRoleId) {
    permOverwrites.push({
      id: adminRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
      ],
    });
  }

  // Create ticket channel in the same category as the current channel
  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: interaction.channel.parentId ?? null,
    permissionOverwrites: permOverwrites,
    reason: `Clark: ticket #${ticket.ticket_number} by ${chatter.username}`,
  });

  db.updateTicketChannel(ticketId, ticketChannel.id);

  // Post summary embed in ticket channel
  const priorityTag = priority === 'urgent' ? '🔴 URGENT' : '🟢 Normal';
  const embed = new EmbedBuilder()
    .setColor(priority === 'urgent' ? 0xe74c3c : 0x5865f2)
    .setTitle(`📋 Request #${ticket.ticket_number} — ${typeLabel(type)}`)
    .setAuthor({ name: chatter.username, iconURL: chatter.displayAvatarURL({ size: 64 }) })
    .addFields(
      { name: 'Type',     value: typeLabel(type),         inline: true },
      { name: 'Priority', value: priorityTag,             inline: true },
      { name: 'Price',    value: price ? `$${price}` : 'Not specified', inline: true },
      { name: 'Client estimate', value: estimate ?? 'Not specified', inline: true },
      { name: 'Status',   value: '⏳ Waiting for model response', inline: true },
      { name: 'Description', value: description },
    )
    .setTimestamp();

  const replyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`req_reply_${ticketId}`)
      .setLabel('💬 Reply to Model')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`req_cancel_${ticketId}`)
      .setLabel('🚫 Cancel Request')
      .setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({ embeds: [embed], components: [replyRow] });
  db.addTicketMessage(ticketId, 'chatter', chatter.username, description);

  // Send to Telegram
  const fullTicket = { ...ticket, model };
  await sendRequestToModel(fullTicket, model);

  await interaction.editReply(`✅ Request #${ticket.ticket_number} created! → ${ticketChannel}`);
}

// ── Chatter replies to model ──────────────────────────────────────────────────

async function handleReplyButton(interaction, ticketId) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

  const modal = new ModalBuilder()
    .setCustomId(`req_replymsg_${ticketId}`)
    .setTitle('Reply to Model');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('message')
        .setLabel('Your message')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    )
  );

  return interaction.showModal(modal);
}

async function handleReplyModal(interaction, ticketId) {
  const message = interaction.fields.getTextInputValue('message').trim();
  const ticket  = db.getTicket(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

  db.addTicketMessage(ticketId, 'chatter', interaction.user.username, message);

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setAuthor({ name: `${interaction.user.username} — Chatter` })
    .setDescription(message)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
  await forwardToModel(ticketId, interaction.user.username, message);
}

// ── Chatter cancels request ───────────────────────────────────────────────────

async function handleCancelButton(interaction, ticketId) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

  const modal = new ModalBuilder()
    .setCustomId(`req_cancelreason_${ticketId}`)
    .setTitle('Cancel Request');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for cancellation')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('e.g. The client decided not to purchase')
        .setRequired(true)
    )
  );

  return interaction.showModal(modal);
}

async function handleCancelModal(interaction, ticketId) {
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const ticket = db.getTicket(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

  db.updateTicketStatus(ticketId, 'cancelled');
  db.addTicketMessage(ticketId, 'system', 'Clark', `🚫 Cancelled by chatter — reason: ${reason}`);

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle(`🚫 Request #${ticket.ticket_number} Cancelled`)
    .setDescription(`Cancelled by **${interaction.user.username}** (Support)`)
    .addFields({ name: 'Reason', value: reason })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  // Notify the model on Telegram
  await notifyModelCancelledByChatter(ticketId, reason);

  // Close channel after 10 seconds
  setTimeout(async () => {
    try {
      const ch = await interaction.client.channels.fetch(ticket.channel_id);
      await ch.delete(`Clark: ticket #${ticket.ticket_number} cancelled`);
    } catch (err) {
      console.error('[Ticket] Failed to delete channel after cancel:', err.message);
    }
  }, 10000);
}

// ── Chatter confirms received → delete channel ────────────────────────────────

async function handleConfirmReceived(interaction, ticketId) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

  db.updateTicketStatus(ticketId, 'completed');
  db.addTicketMessage(ticketId, 'system', 'Clark', '✅ Chatter confirmed receipt. Ticket completed.');

  await interaction.reply({ content: '✅ Confirmed! Closing ticket in 5 seconds...', ephemeral: false });

  setTimeout(async () => {
    try {
      const ch = await interaction.client.channels.fetch(ticket.channel_id);
      await ch.delete(`Clark: ticket #${ticket.ticket_number} completed`);
    } catch (err) {
      console.error('[Ticket] Failed to delete channel:', err.message);
    }
  }, 5000);
}

// ── Main router ───────────────────────────────────────────────────────────────

async function handleTicketInteraction(interaction) {
  const id = interaction.customId ?? '';

  // Button: new request
  if (id === 'req_new') return handleNewRequest(interaction);

  // Select: model chosen
  if (id === 'req_select_model') return handleSelectModel(interaction);

  // Select: type chosen  (req_select_type_{modelId})
  if (id.startsWith('req_select_type_')) {
    const modelId = id.replace('req_select_type_', '');
    const type = interaction.values[0];
    return handleSelectType(interaction, modelId, type);
  }

  // Modal: details submitted  (req_modal_{modelId}_{type})
  if (id.startsWith('req_modal_')) {
    const parts = id.split('_');
    const modelId = parts[2];
    const type = parts[3];
    return handleModalSubmit(interaction, modelId, type);
  }

  // Button: reply to model  (req_reply_{ticketId})
  if (id.startsWith('req_reply_')) {
    const ticketId = parseInt(id.replace('req_reply_', ''));
    return handleReplyButton(interaction, ticketId);
  }

  // Modal: reply message  (req_replymsg_{ticketId})
  if (id.startsWith('req_replymsg_')) {
    const ticketId = parseInt(id.replace('req_replymsg_', ''));
    return handleReplyModal(interaction, ticketId);
  }

  // Button: cancel request  (req_cancel_{ticketId})
  if (id.startsWith('req_cancel_')) {
    const ticketId = parseInt(id.replace('req_cancel_', ''));
    return handleCancelButton(interaction, ticketId);
  }

  // Modal: cancel reason  (req_cancelreason_{ticketId})
  if (id.startsWith('req_cancelreason_')) {
    const ticketId = parseInt(id.replace('req_cancelreason_', ''));
    return handleCancelModal(interaction, ticketId);
  }

  // Button: confirm received  (req_received_{ticketId})
  if (id.startsWith('req_received_')) {
    const ticketId = parseInt(id.replace('req_received_', ''));
    return handleConfirmReceived(interaction, ticketId);
  }
}

module.exports = { handleTicketInteraction };
