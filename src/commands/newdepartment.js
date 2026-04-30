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
    .setDescription('(Admin) Create a new department with role and channels.')
    .addStringOption(opt =>
      opt.setName('name')
        .setDescription('Department name (e.g. "sales", "support")')
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

    const rawName = interaction.options.getString('name').trim().toLowerCase().replace(/\s+/g, '-');
    const payType = interaction.options.getString('paytype');
    const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const guild = interaction.guild;

    if (db.getDepartment(rawName)) {
      return interaction.editReply(`❌ Department **${rawName}** already exists.`);
    }

    try {
      // 1. Create Discord role
      const discordRole = await guild.roles.create({
        name: displayName,
        mentionable: true,
        reason: `Clark bot: new department "${rawName}" created by ${interaction.user.username}`,
      });

      const everyoneId = guild.roles.everyone.id;

      // 2. Create category
      const category = await guild.channels.create({
        name: displayName.toUpperCase(),
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: discordRole.id, allow: [PermissionsBitField.Flags.ViewChannel] },
        ],
        reason: `Clark bot: department "${rawName}"`,
      });

      // 3. Chat channel — members can read & write
      const chatChannel = await guild.channels.create({
        name: `${rawName}-chat`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
          {
            id: discordRole.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
          },
        ],
        reason: `Clark bot: department "${rawName}"`,
      });

      // 4. Logs channel — members read-only (bot posts here)
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

      // 5. Info channel — read-only for all members
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

      // 6. Store in database
      db.createDepartment(rawName, displayName, payType, {
        logChannelId: logsChannel.id,
        chatChannelId: chatChannel.id,
        infoChannelId: infoChannel.id,
        roleId: discordRole.id,
      });

      // 7. Post pinned instructions in logs channel
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
        .setFooter({ text: `Department: ${displayName}  •  Pay type: ${payType === 'commission' ? '$2/hr + 4% commission' : 'Hours only'}` })
        .setTimestamp();

      const pinnedMsg = await logsChannel.send({ embeds: [logsEmbed] });
      await pinnedMsg.pin();

      const payLabel = payType === 'commission' ? '$2/hr + 4% commission' : 'Hours only (manual pay)';

      return interaction.editReply(
        `✅ Department **${displayName}** created!\n\n` +
        `🎭 Role: ${discordRole}\n` +
        `📁 Category: **${displayName.toUpperCase()}**\n` +
        `💬 Chat: ${chatChannel}\n` +
        `📋 Logs: ${logsChannel} *(pinned instructions posted)*\n` +
        `ℹ️ Info: ${infoChannel}\n` +
        `💰 Pay type: ${payLabel}\n\n` +
        `Use \`/setrole\` to assign employees to this department.`
      );
    } catch (err) {
      console.error('[/newdepartment] Error:', err);
      return interaction.editReply(`❌ Failed to create department: ${err.message}`);
    }
  },
};
