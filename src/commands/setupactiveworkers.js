const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { isAdmin } = require('../utils/roles');
const db = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupactiveworkers')
    .setDescription('(Admin) Create the #active-workers live channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild     = interaction.guild;
    const botMember = guild.members.me;

    // Admin-only: deny @everyone, allow bot + admin role
    const adminRoleId = process.env.ADMIN_ROLE_ID;
    const overwrites  = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ];
    if (adminRoleId) {
      overwrites.push({
        id: adminRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
        deny: [PermissionFlagsBits.SendMessages],
      });
    }

    let channel;
    try {
      channel = await guild.channels.create({
        name: 'active-workers',
        type: ChannelType.GuildText,
        topic: 'Live view of employees currently clocked in.',
        permissionOverwrites: overwrites,
      });
    } catch (err) {
      console.error('[SetupActiveWorkers] Failed to create channel:', err);
      return interaction.editReply({ content: `❌ Could not create channel: ${err.message}` });
    }

    // Post initial embed
    const embed = buildEmbed([]);
    let msg;
    try {
      msg = await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[SetupActiveWorkers] Failed to post embed:', err);
      return interaction.editReply({ content: `❌ Channel created but could not post embed: ${err.message}` });
    }

    db.setConfig('active_workers_channel_id', channel.id);
    db.setConfig('active_workers_message_id', msg.id);

    await interaction.editReply({
      content: `✅ Done! <#${channel.id}> is now live. It updates automatically every minute.`,
    });
  },
};

function buildEmbed(shifts) {
  const now  = new Date();
  const time = now.toLocaleTimeString('en-GB', { timeZone: 'UTC', timeStyle: 'short' }) + ' UTC';

  if (shifts.length === 0) {
    return new EmbedBuilder()
      .setColor(0x747f8d)
      .setTitle('😴 Active Workers')
      .setDescription('No employees are currently clocked in.')
      .setFooter({ text: `Last updated: ${time}` });
  }

  const lines = shifts.map(({ shift, employee }) => {
    const elapsed  = now - new Date(shift.clock_in);
    const totalMin = Math.floor(elapsed / 60000);
    const hours    = Math.floor(totalMin / 60);
    const mins     = totalMin % 60;
    const duration = `${hours}h ${String(mins).padStart(2, '0')}m`;
    const role     = employee?.role ?? 'Unknown';
    const name     = employee?.username ?? shift.discord_id;
    return `👤 **${name}** — ${role} | ⏱ ${duration}`;
  });

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`🟢 Active Workers — ${shifts.length} online`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Last updated: ${time}` });
}

module.exports.buildEmbed = buildEmbed;
