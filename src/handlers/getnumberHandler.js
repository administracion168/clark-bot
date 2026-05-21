const { resolveClarkRole } = require('../utils/roles');
const activationStore = require('../utils/activationStore');
const db = require('../database');
const {
  showServiceSelector,
  executeGetNumber,
  completeActivation,
  cancelActivation,
  logToAdminChannel,
} = require('../commands/getnumber');

/**
 * Handles all interactions for the phone number flow:
 *   ig_get_number_btn  — "Get a Number" button → service selector
 *   num_svc1           — Servicio 1 (GrizzlySMS) selected
 *   num_svc2           — Servicio 2 (5sim) selected
 *   num_use_{id}       — employee finished, mark complete
 *   num_cancel_{id}    — employee cancelled, refund
 */
async function handleGetNumberInteraction(interaction) {
  const { customId } = interaction;

  // ── "Get a Number" button → show service selector ─────────────────────────
  if (customId === 'ig_get_number_btn') {
    let clarkRole = resolveClarkRole(interaction.member);
    if (!clarkRole) {
      const stored = db.getEmployee(interaction.user.id);
      if (stored?.role) clarkRole = stored.role;
    }

    if (!clarkRole || !clarkRole.toLowerCase().includes('instagram')) {
      return interaction.reply({
        content: '❌ This is only available to Instagram employees.',
        ephemeral: true,
      });
    }

    return showServiceSelector(interaction);
  }

  // ── Servicio 1 — GrizzlySMS ───────────────────────────────────────────────
  if (customId === 'num_svc1') {
    return executeGetNumber(interaction, 'grizzly', true);
  }

  // ── Servicio 2 — 5sim ─────────────────────────────────────────────────────
  if (customId === 'num_svc2') {
    return executeGetNumber(interaction, '5sim', true);
  }

  // ── ✅ Used — Complete ────────────────────────────────────────────────────
  if (customId.startsWith('num_use_')) {
    const activationId = customId.slice('num_use_'.length);
    await interaction.deferUpdate();

    const data = activationStore.get(activationId);
    const service = data?.service ?? 'grizzly';

    try {
      await completeActivation(service, activationId);
    } catch (err) {
      console.error('[GetNumber] Complete error:', err.message);
    }

    activationStore.delete(activationId);

    const tag = data ? `**${data.username}**` : `<@${interaction.user.id}>`;
    const phone = data?.phoneNumber ?? '—';
    await logToAdminChannel(
      interaction.client,
      `✅ ${tag} has successfully registered a new Instagram account.\n📱 \`${phone}\``,
    );

    await interaction.editReply({
      content: '✅ **Activation completed!** Registration done. Good work!',
      components: [],
    }).catch(() => {});
    return;
  }

  // ── ❌ Cancel & Refund ────────────────────────────────────────────────────
  if (customId.startsWith('num_cancel_')) {
    const activationId = customId.slice('num_cancel_'.length);
    await interaction.deferUpdate();

    const data = activationStore.get(activationId);
    const service = data?.service ?? 'grizzly';

    try {
      await cancelActivation(service, activationId);
    } catch (err) {
      console.error('[GetNumber] Cancel error:', err.message);
    }

    activationStore.delete(activationId);

    const tag = data ? `**${data.username}**` : `<@${interaction.user.id}>`;
    const phone = data?.phoneNumber ?? '—';
    await logToAdminChannel(
      interaction.client,
      `❌ ${tag} requested a number (\`${phone}\`) but cancelled it. Balance refunded.`,
    );

    await interaction.editReply({
      content: '❌ **Cancelled.** The number has been released.',
      components: [],
    }).catch(() => {});
    return;
  }
}

module.exports = { handleGetNumberInteraction };
