const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isAdmin } = require('../utils/roles');
const db = require('../database');

const PAGE_SIZE = 20;

const STATUS_LABELS = {
  pending:   '⏳ Pending',
  accepted:  '🔄 Accepted',
  completed: '✅ Completed',
  cancelled: '🚫 Cancelled',
  denied:    '❌ Denied',
};

const STATUS_ICONS = {
  pending:   '⏳',
  accepted:  '🔄',
  completed: '✅',
  cancelled: '🚫',
  denied:    '❌',
};

const TYPE_ICONS = {
  video:    '🎬',
  photo:    '📸',
  audio:    '🎙️',
  question: '❓',
  other:    '📋',
};

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('requests')
    .setDescription('(Admin) View the history of all custom requests.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('status')
        .setDescription('Filter by status (default: all)')
        .setRequired(false)
        .addChoices(
          { name: '⏳ Pending',   value: 'pending'   },
          { name: '🔄 Accepted',  value: 'accepted'  },
          { name: '✅ Completed', value: 'completed' },
          { name: '🚫 Cancelled', value: 'cancelled' },
          { name: '❌ Denied',    value: 'denied'    },
        ))
    .addStringOption(opt =>
      opt.setName('model')
        .setDescription('Filter by model name')
        .setRequired(false)
        .setAutocomplete(true))
    .addIntegerOption(opt =>
      opt.setName('page')
        .setDescription('Page number (default: 1)')
        .setRequired(false)
        .setMinValue(1)),

  async handleAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const models = db.getAllModels();
    const choices = models
      .filter(m => m.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(m => ({ name: m.name, value: String(m.id) }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const statusFilter = interaction.options.getString('status') || null;
    const modelFilter  = interaction.options.getString('model')  || null;
    const page         = interaction.options.getInteger('page')  || 1;
    const offset       = (page - 1) * PAGE_SIZE;

    const filters = { status: statusFilter, modelId: modelFilter, limit: PAGE_SIZE, offset };
    const tickets = db.getAllTickets(filters);
    const total   = db.countAllTickets({ status: statusFilter, modelId: modelFilter });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (tickets.length === 0) {
      return interaction.reply({
        content: `📭 No requests found${statusFilter ? ` with status **${statusFilter}**` : ''}.`,
        ephemeral: true,
      });
    }

    // Build embed description — one line per ticket
    const lines = tickets.map(t => {
      const typeIcon   = TYPE_ICONS[t.type]  ?? '📋';
      const statusIcon = STATUS_ICONS[t.status] ?? '❓';
      const price      = t.price ? `$${t.price}` : '—';
      const model      = t.model_name ?? '—';
      const date       = formatDate(t.created_at);
      // Truncate description to 60 chars for the summary line
      const desc = t.description.length > 60 ? t.description.slice(0, 57) + '...' : t.description;
      return `**#${String(t.ticket_number).padStart(3,'0')}** ${statusIcon} ${typeIcon} · **${model}** · ${t.chatter_username} · ${price} · ${date}\n╰ ${desc}`;
    });

    // Split into chunks to avoid embed description limit (4096 chars)
    const chunks = [];
    let current = '';
    for (const line of lines) {
      if ((current + '\n\n' + line).length > 3800) {
        chunks.push(current);
        current = line;
      } else {
        current = current ? current + '\n\n' + line : line;
      }
    }
    if (current) chunks.push(current);

    const embeds = chunks.map((chunk, i) => {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(chunk);

      if (i === 0) {
        let title = '📋 Custom Requests';
        if (statusFilter) title += ` — ${STATUS_LABELS[statusFilter]}`;
        embed.setTitle(title);
        embed.addFields({
          name: '​',
          value: `Showing **${tickets.length}** of **${total}** total · Page **${page}/${totalPages}**`,
          inline: false,
        });
      }

      return embed;
    });

    // Add pagination hint if there are more pages
    if (totalPages > 1 && page < totalPages) {
      embeds[embeds.length - 1].setFooter({
        text: `Page ${page} of ${totalPages} · Use /requests page:${page + 1}${statusFilter ? ` status:${statusFilter}` : ''} for next page`,
      });
    }

    await interaction.reply({ embeds, ephemeral: true });
  },
};
