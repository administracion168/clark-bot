const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { isAdmin } = require('../utils/roles');
const db = require('../database');

const INSTAGRAM_CATEGORY_ID = '1502096354066042930';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupinstagram')
    .setDescription('(Admin) Create the phone-numbers and logs channels for the Instagram team.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const botMember = guild.members.me;

    // ── Try to find the Instagram department role for channel permissions ──
    const instaDept = db.getAllDepartments().find(d => d.name.toLowerCase().includes('instagram'));
    const instaRoleId = instaDept?.role_id ?? null;

    // ── Permission overwrites for #phone-numbers ──────────────────────────
    // @everyone: hidden | instagram role: visible, read-only | bot: full
    const phoneOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
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
    if (instaRoleId) {
      phoneOverwrites.push({
        id: instaRoleId,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages],
      });
    }

    // ── Permission overwrites for #instagram-logs (admin only) ────────────
    const logsOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: botMember.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ];

    // ── Create channels ───────────────────────────────────────────────────
    let phoneChannel, logsChannel;
    try {
      phoneChannel = await guild.channels.create({
        name: 'phone-numbers',
        type: ChannelType.GuildText,
        parent: INSTAGRAM_CATEGORY_ID,
        topic: 'Request a temporary phone number for Instagram account registration.',
        permissionOverwrites: phoneOverwrites,
      });
    } catch (err) {
      console.error('[SetupInstagram] Failed to create phone-numbers channel:', err);
      return interaction.editReply({
        content: `❌ Could not create \`#phone-numbers\`: ${err.message}`,
      });
    }

    try {
      logsChannel = await guild.channels.create({
        name: 'number-logs',
        type: ChannelType.GuildText,
        parent: INSTAGRAM_CATEGORY_ID,
        topic: 'Admin log — phone number activity.',
        permissionOverwrites: logsOverwrites,
      });
    } catch (err) {
      console.error('[SetupInstagram] Failed to create number-logs channel:', err);
      return interaction.editReply({
        content: `❌ Could not create \`#number-logs\`: ${err.message}`,
      });
    }

    // Save log channel ID
    db.setConfig('instagram_log_channel_id', logsChannel.id);

    // ── Post instructional embed + button in #phone-numbers ───────────────
    const embed = new EmbedBuilder()
      .setColor(0xe1306c)
      .setTitle('📱 Phone Number Requests')
      .setDescription(
        'Use this channel whenever you need a temporary phone number to register a new Instagram account.\n\n' +
        '**How it works:**\n' +
        '**1 —** Click **Get a Number** below.\n' +
        '**2 —** A USA virtual number will be instantly assigned to you. Copy it and use it in the Instagram sign-up form.\n' +
        '**3 —** The verification code will appear here automatically — just wait, no need to check anywhere else.\n' +
        '**4 —** Once you enter the code and finish registration, click **✅ Used — Complete** to close the request.\n\n' +
        '**Keep in mind:**\n' +
        '— Numbers are for **one-time use only**. Do not reuse them.\n' +
        '— If no code arrives within 10 minutes, the number is automatically released.\n' +
        '— If registration fails before you receive a code, click **Cancel**.',
      )
      .setFooter({ text: 'All responses are private — only you can see them.' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ig_get_number_btn')
        .setLabel('Get a Number')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📱'),
    );

    let postedMessage;
    try {
      postedMessage = await phoneChannel.send({ embeds: [embed], components: [row] });
      await postedMessage.pin();
    } catch (err) {
      console.error('[SetupInstagram] Failed to post/pin message:', err);
      // Channel was created — warn but don't fail
    }

    // ── Done ──────────────────────────────────────────────────────────────
    const roleNote = instaRoleId
      ? `Instagram role permissions applied automatically.`
      : `⚠️ No "instagram" department found in the database — you may need to set channel visibility manually for your Instagram employees.`;

    await interaction.editReply({
      content:
        `✅ **Setup complete!**\n\n` +
        `📱 <#${phoneChannel.id}> — Instructions posted and pinned.\n` +
        `📋 <#${logsChannel.id}> — All activity will be logged here (admin only).\n\n` +
        roleNote,
    });
  },
};
