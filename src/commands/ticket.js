const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isAdmin } = require('../utils/roles');
const db = require('../database');

const STATUS_LABELS = {
  pending:   '⏳ Pending',
  accepted:  '🔄 Accepted',
  completed: '✅ Completed',
  cancelled: '🚫 Cancelled',
  denied:    '❌ Denied',
};

const TYPE_LABELS = {
  video:    '🎬 Custom Video',
  photo:    '📸 Custom Photo',
  audio:    '🎙️ Custom Audio',
  question: '❓ Question',
  other:    '📋 Other',
};

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('(Admin) View full details of a specific request by number.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(opt =>
      opt.setName('number')
        .setDescription('The request number (e.g. 8)')
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const number = interaction.options.getInteger('number');
    const ticketRaw = db.getTicketByNumber(number);

    if (!ticketRaw) {
      return interaction.reply({ content: `❌ Request #${number} not found.`, ephemeral: true });
    }

    const t = ticketRaw;
    const messages = db.getTicketMessages(t.id);

    const status  = STATUS_LABELS[t.status]  ?? t.status;
    const type    = TYPE_LABELS[t.type]      ?? t.type;
    const price   = t.price ? `$${t.price}` : 'Not specified';
    const priority = t.priority === 'urgent' ? '🔴 URGENT' : '🟢 Normal';

    const embed = new EmbedBuilder()
      .setColor(t.priority === 'urgent' ? 0xe74c3c : 0x5865f2)
      .setTitle(`📋 Request #${String(t.ticket_number).padStart(3, '0')} — Full Details`)
      .addFields(
        { name: 'Status',          value: status,                                inline: true },
        { name: 'Type',            value: type,                                  inline: true },
        { name: 'Priority',        value: priority,                              inline: true },
        { name: 'Model',           value: t.model_name ?? '—',                   inline: true },
        { name: 'Chatter',         value: t.chatter_username,                    inline: true },
        { name: 'Price',           value: price,                                 inline: true },
        { name: 'Client estimate', value: t.client_estimated_time ?? '—',        inline: true },
        { name: 'Model ETA',       value: t.model_estimated_days ? `${t.model_estimated_days} day(s)` : '—', inline: true },
        { name: 'Channel',         value: t.channel_id ? `<#${t.channel_id}>` : '—', inline: true },
        { name: 'Created',         value: formatDate(t.created_at),              inline: true },
        { name: 'Accepted',        value: formatDate(t.accepted_at),             inline: true },
        { name: 'Completed',       value: formatDate(t.completed_at),            inline: true },
        { name: 'Description',     value: t.description },
      );

    if (t.deny_reason) {
      embed.addFields({ name: 'Deny reason', value: t.deny_reason });
    }

    const embeds = [embed];

    // Add conversation thread if there are messages
    if (messages.length > 0) {
      const lines = messages.map(m => {
        const time = new Date(m.created_at).toLocaleTimeString('en-GB', { timeZone: 'UTC', timeStyle: 'short' });
        const who = m.sender === 'system' ? '🤖 Clark' : m.sender === 'chatter' ? `💬 ${m.sender_name}` : `📲 ${m.sender_name}`;
        return `**${who}** *(${time})*\n${m.message}`;
      });

      // Split into chunks of 3800 chars max
      const chunks = [];
      let current = '';
      for (const line of lines) {
        const next = current ? current + '\n\n' + line : line;
        if (next.length > 3800) { chunks.push(current); current = line; }
        else current = next;
      }
      if (current) chunks.push(current);

      chunks.forEach((chunk, i) => {
        embeds.push(
          new EmbedBuilder()
            .setColor(0x2c2f33)
            .setTitle(i === 0 ? `💬 Conversation (${messages.length} messages)` : '​')
            .setDescription(chunk)
        );
      });
    }

    await interaction.reply({ embeds, ephemeral: true });
  },
};
