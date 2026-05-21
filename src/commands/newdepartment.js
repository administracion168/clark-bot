const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const db = require('../database');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('newdepartment')
    .setDescription('(Admin) Link an existing Discord role as a department.')
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('The existing Discord role for this department (e.g. @Reddit)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('paytype')
        .setDescription('How shifts are reported in the weekly summary')
        .setRequired(true)
        .addChoices(
          { name: 'Hours Only (you calculate pay manually)', value: 'hours_only' },
          { name: 'Commission ($2/hr + 4% net sales)', value: 'commission' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const discordRole = interaction.options.getRole('role');
    const payType     = interaction.options.getString('paytype');

    // Use the role name as the department name (lowercase, spaces → dashes)
    const rawName    = discordRole.name.toLowerCase().replace(/\s+/g, '-');
    const displayName = discordRole.name;
    const guild       = interaction.guild;

    // Check if department already exists
    const existing = db.getDepartment(rawName);
    if (existing) {
      return interaction.editReply(
        `❌ Department **${displayName}** already exists.\n` +
        `It is linked to role <@&${existing.role_id ?? discordRole.id}>.`
      );
    }

    try {
      const everyoneId = guild.roles.everyone.id;

      // Find or create a category for this department
      let category = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory &&
             c.name.toLowerCase() === displayName.toUpperCase().toLowerCase()
      );

      if (!category) {
        category = await guild.channels.create({
          name: displayName.toUpperCase(),
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: discordRole.id, allow: [PermissionsBitField.Flags.ViewChannel] },
          ],
          reason: `Clark bot: department "${rawName}"`,
        });
      }

      // Create chat channel
      const chatChannel = await guild.channels.create({
        name: `${rawName}-chat`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
          {
            id: discordRole.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
        ],
        reason: `Clark bot: department "${rawName}"`,
      });

      // Create logs channel
      const logsChannel = await guild.channels.create({
        name: `${rawName}-logs`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
          {
            id: discordRole.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
            deny: [PermissionsBitField.Flags.SendMessages],
          },
        ],
        reason: `Clark bot: department "${rawName}"`,
      });

      // Create info channel
      const infoChannel = await guild.channels.create({
        name: `${rawName}-info`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
          {
            id: discordRole.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
            deny: [PermissionsBitField.Flags.SendMessages],
          },
        ],
        reason: `Clark bot: department "${rawName}"`,
      });

      // Save to DB with the real Discord role ID
      db.createDepartment(rawName, displayName, payType, {
        logChannelId:  logsChannel.id,
        chatChannelId: chatChannel.id,
        infoChannelId: infoChannel.id,
        roleId:        discordRole.id,
      });

      // Post pinned instructions in logs channel
      const salesField = payType === 'commission'
        ? '\n> 💰 **Net Sales** — total sales closed during the shift\n'
        : '';

      const logsEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`📋 ${displayName} — Shift Logs`)
        .setDescription(
          `This channel is **read-only**. Clark posts here automatically every time a member of **${displayName}** clocks in or out.\n​`
        )
        .addFields(
          {
            name: '🟢 Clock In — `/clockin`',
            value:
              'Run this command at the **start of your shift**.\n' +
              'Clark will record your start time automatically.',
          },
          {
            name: '🔴 Clock Out — `/clockout`',
            value:
              'Run this command at the **end of your shift**.\n' +
              'A form will appear asking you to fill in:\n' +
              '> 📝 **Shift Summary** — describe what you worked on\n' +
              salesField +
              '\nOnce submitted, Clark posts the full shift log here.',
          },
          {
            name: '⚠️ Auto-Close',
            value:
              'If you forget to clock out, Clark will **automatically close your shift after 12 hours** and flag it here.',
          },
          {
            name: '📊 Weekly Report',
            value:
              'Every **Monday at 9:00 AM EST** Clark sends a full team report to the report channel with all shifts from the previous week.',
          },
        )
        .setFooter({
          text: `Department: ${displayName}  •  Pay type: ${payType === 'commission' ? '$2/hr + 4% commission' : 'Hours only'}`,
        })
        .setTimestamp();

      const pinnedMsg = await logsChannel.send({ embeds: [logsEmbed] });
      await pinnedMsg.pin();

      const payLabel = payType === 'commission' ? '$2/hr + 4% commission' : 'Hours only (manual pay)';

      return interaction.editReply(
        `✅ Department **${displayName}** linked to ${discordRole}!\n\n` +
        `📁 Category: **${displayName.toUpperCase()}**\n` +
        `💬 Chat: ${chatChannel}\n` +
        `📋 Logs: ${logsChannel}\n` +
        `ℹ️ Info: ${infoChannel}\n` +
        `💰 Pay type: ${payLabel}\n\n` +
        `All members with ${discordRole} can now use \`/clockin\` and \`/clockout\`.`
      );
    } catch (err) {
      console.error('[/newdepartment] Error:', err);
      return interaction.editReply(`❌ Failed to create department: ${err.message}`);
    }
  },
};
