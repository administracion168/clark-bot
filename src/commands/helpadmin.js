const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('helpadmin')
    .setDescription('(Admin) See all admin commands and what they do.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const deptEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🏢 Departments')
      .addFields(
        {
          name: '/newdepartment',
          value: 'Link an existing Discord role as a department. Creates the log, chat, and info channels automatically. Employees with that role can then use `/clockin` and `/clockout`.',
        },
        {
          name: '/deletedepartment',
          value: 'Remove a department from Clark. Does not delete the Discord channels or role.',
        },
        {
          name: '/setrole `user` `department`',
          value: 'Manually assign an employee to a department. Use this if someone can\'t clock in because their Discord role wasn\'t detected.',
        },
        {
          name: '/setsalary `user` `amount`',
          value: 'Set a fixed weekly salary for an employee.',
        },
        {
          name: '/setupactiveworkers',
          value: 'One-time setup. Creates the `#active-workers` admin-only channel with a live embed that updates every minute showing who is currently clocked in and for how long.',
        },
      );

    const reportsEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('📊 Reports & Logs')
      .addFields(
        {
          name: '/weekreport',
          value: 'Manually trigger the weekly hours and earnings report. It runs automatically every Monday at 9:00 AM EST.',
        },
        {
          name: '/history `user`',
          value: 'View the shift history of any employee.',
        },
        {
          name: '/pinlogs `channel`',
          value: 'Pin the Clark instructions embed in a department\'s log channel.',
        },
        {
          name: '/requests',
          value: 'View all custom requests with their details. Optional filters: `status` (pending / accepted / completed / cancelled / denied), `model`, and `page` for pagination.',
        },
        {
          name: '/ticket `number`',
          value: 'View the complete details of a single request by number — full description, all fields, and the full conversation thread.',
        },
      );

    const modelsEmbed = new EmbedBuilder()
      .setColor(0xe1306c)
      .setTitle('📲 Models & Custom Requests')
      .addFields(
        {
          name: '/setupmodel `role`',
          value: 'Register a Discord role as a model. Generates a linking code to send to the model — she uses it to connect her Telegram account.',
        },
        {
          name: '/unlinkmodel `model`',
          value: 'Unlink a model from Clark. She stops appearing in all selectors and her Telegram connection is removed. Ticket history is preserved.',
        },
        {
          name: '/postrequests',
          value: 'Post the **+ New Request** button in the current channel so chatters can submit custom content requests.',
        },
        {
          name: '/postredditideas',
          value: 'Post the **New Reddit Ideas** notification button in the current channel.',
        },
        {
          name: '/postreelsideas',
          value: 'Post the **New Reels Ideas** notification button in the current channel.',
        },
      );

    const instagramEmbed = new EmbedBuilder()
      .setColor(0xff6b35)
      .setTitle('📸 Instagram')
      .addFields(
        {
          name: '/setupinstagram',
          value: 'One-time setup. Creates `#phone-numbers` (for employees) and `#instagram-logs` (admin-only) inside the Instagram category. Posts and pins the instructions + button in `#phone-numbers`. Requires `GRIZZLY_API_KEY` in Railway env vars.',
        },
        {
          name: '/getnumber',
          value: 'Available to Instagram employees as a slash command (same as clicking the button in `#phone-numbers`). Assigns a USA virtual number, then automatically waits for the SMS code.',
        },
      );

    await interaction.reply({
      embeds: [deptEmbed, reportsEmbed, modelsEmbed, instagramEmbed],
      ephemeral: true,
    });
  },
};
