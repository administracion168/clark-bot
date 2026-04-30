const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const db = require('../database');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pinlogs')
    .setDescription('(Admin) Post and pin the shift instructions in a department logs channel.')
    .addStringOption(opt =>
      opt.setName('department')
        .setDescription('Department to pin instructions for')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async handleAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const departments = db.getAllDepartments();
    const choices = departments
      .filter(d => d.name.includes(focused) || d.display_name.toLowerCase().includes(focused))
      .map(d => ({ name: d.display_name, value: d.name }));
    await interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const deptName = interaction.options.getString('department');
    const dept = db.getDepartment(deptName);

    if (!dept) {
      return interaction.reply({ content: `❌ Department **${deptName}** not found.`, ephemeral: true });
    }

    if (!dept.log_channel_id) {
      return interaction.reply({
        content: `❌ Department **${dept.display_name}** has no logs channel registered. Recreate it with \`/newdepartment\`.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const logsChannel = await interaction.client.channels.fetch(dept.log_channel_id);

      const salesField = dept.pay_type === 'commission'
        ? '\n> 💰 **Net Sales** — total sales closed during the shift\n'
        : '';

      const logsEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`📋 ${dept.display_name} — Shift Logs`)
        .setDescription(
          `This channel is **read-only**. Clark posts here automatically every time a member of **${dept.display_name}** clocks in or out.\n​`
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
        .setFooter({ text: `Department: ${dept.display_name}  •  Pay type: ${dept.pay_type === 'commission' ? '$2/hr + 4% commission' : 'Hours only'}` })
        .setTimestamp();

      const msg = await logsChannel.send({ embeds: [logsEmbed] });
      await msg.pin();

      return interaction.editReply(`✅ Instructions posted and pinned in ${logsChannel}.`);
    } catch (err) {
      console.error('[/pinlogs] Error:', err);
      return interaction.editReply(`❌ Failed: ${err.message}`);
    }
  },
};
