const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { resolveClarkRole } = require('../utils/roles');
const activationStore = require('../utils/activationStore');
const db = require('../database');

const POLL_INTERVAL_MS = 10_000;  // 10 s between polls
const MAX_POLL_ATTEMPTS = 60;     // 60 × 10 s = 10 minutes max

// ── GrizzlySMS API helpers ────────────────────────────────────────────────────

const GRIZZLY_BASE = 'https://api.grizzlysms.com/stubs/handler_api.php';

async function grizzlyRequest(params) {
  const apiKey = process.env.GRIZZLY_API_KEY;
  if (!apiKey) throw new Error('GRIZZLY_API_KEY is not set in environment variables.');

  const url = new URL(GRIZZLY_BASE);
  url.searchParams.set('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
  });
  return res.text();
}

async function grizzlyGetNumber() {
  const text = await grizzlyRequest({ action: 'getNumberV2', service: 'ig', country: '187' });
  const trimmed = text.trim();
  if (trimmed.startsWith('<') || trimmed.toLowerCase().includes('<!doctype')) {
    console.error('[GetNumber/Grizzly] Cloudflare/HTML block detected');
    throw new Error('SERVICE_UNAVAILABLE');
  }
  try {
    const json = JSON.parse(trimmed);
    if (!json.activationId || !json.phoneNumber) throw new Error('NO_NUMBERS');
    return { activationId: String(json.activationId), phoneNumber: json.phoneNumber };
  } catch {
    throw new Error(trimmed.slice(0, 80));
  }
}

async function grizzlyCheckStatus(activationId) {
  const raw = (await grizzlyRequest({ action: 'getStatus', id: activationId })).trim();
  if (raw.startsWith('STATUS_OK:')) return { status: 'OK', code: raw.replace('STATUS_OK:', '') };
  if (raw === 'STATUS_CANCEL') return { status: 'CANCEL' };
  return { status: 'WAIT' };
}

async function grizzlyComplete(activationId) {
  await grizzlyRequest({ action: 'setStatus', id: activationId, status: '6' });
}

async function grizzlyCancel(activationId) {
  await grizzlyRequest({ action: 'setStatus', id: activationId, status: '-1' });
}

// ── SMSPool API helpers ───────────────────────────────────────────────────────

const SMSPOOL_BASE = 'https://api.smspool.net';

async function smsPoolRequest(endpoint, params = {}) {
  const apiKey = process.env.SMSPOOL_API_KEY;
  if (!apiKey) throw new Error('SMSPOOL_API_KEY is not set in environment variables.');

  const url = new URL(`${SMSPOOL_BASE}/${endpoint}`);
  url.searchParams.set('key', apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[GetNumber/SMSPool] HTTP error:', res.status, text.slice(0, 200));
    throw new Error('SERVICE_UNAVAILABLE');
  }

  return res.json();
}

async function smsPoolGetNumber() {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await smsPoolRequest('purchase/sms', { country: 1, service: 457 });
      if (!data.success || !data.number || !data.order_id) {
        const msg = data.message || 'NO_NUMBERS';
        console.error(`[GetNumber/SMSPool] Attempt ${attempt}/${MAX_RETRIES} — bad response:`, JSON.stringify(data).slice(0, 200));
        throw new Error(msg.toUpperCase().replace(/ /g, '_').slice(0, 40));
      }
      if (attempt > 1) {
        console.log(`[GetNumber/SMSPool] Succeeded on attempt ${attempt}/${MAX_RETRIES}`);
      }
      return { activationId: String(data.order_id), phoneNumber: data.number };
    } catch (err) {
      lastError = err;
      const retryable = err.message === 'SERVICE_UNAVAILABLE' || err.message === 'NO_NUMBERS';
      if (!retryable || attempt === MAX_RETRIES) throw err;
      console.warn(`[GetNumber/SMSPool] Attempt ${attempt}/${MAX_RETRIES} failed (${err.message}), retrying in ${RETRY_DELAY_MS / 1000}s…`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  throw lastError;
}

async function smsPoolCheckStatus(activationId) {
  const data = await smsPoolRequest('sms/check', { orderid: activationId });
  // sms field is "0" when no code yet, actual code string when received
  if (data.sms && data.sms !== '0') {
    return { status: 'OK', code: data.sms };
  }
  // status 6 = refunded/cancelled
  if (data.status === 6) return { status: 'CANCEL' };
  return { status: 'WAIT' };
}

async function smsPoolComplete(activationId) {
  await smsPoolRequest('sms/archive', { orderid: activationId });
}

async function smsPoolCancel(activationId) {
  await smsPoolRequest('sms/cancel', { orderid: activationId });
}

// ── 5sim API helpers ──────────────────────────────────────────────────────────

const FIVESIM_BASE = 'https://5sim.net/v1/user';

async function fiveSimRequest(endpoint) {
  const apiKey = process.env.FIVESIM_API_KEY;
  if (!apiKey) throw new Error('FIVESIM_API_KEY is not set in environment variables.');

  const res = await fetch(`${FIVESIM_BASE}/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[GetNumber/5sim] HTTP error:', res.status, text.slice(0, 200));
    throw new Error('SERVICE_UNAVAILABLE');
  }

  return res.json();
}

async function fiveSimGetNumber() {
  const data = await fiveSimRequest('buy/activation/usa/any/instagram');
  if (!data.id || !data.phone) {
    console.error('[GetNumber/5sim] Unexpected buy response:', JSON.stringify(data).slice(0, 200));
    throw new Error(data.message ?? 'NO_NUMBERS');
  }
  return { activationId: String(data.id), phoneNumber: data.phone };
}

async function fiveSimCheckStatus(activationId) {
  const data = await fiveSimRequest(`check/${activationId}`);
  const code = data.sms?.[0]?.code;
  if ((data.status === 'RECEIVED' || data.status === 'FINISHED') && code) {
    return { status: 'OK', code };
  }
  if (data.status === 'CANCELED') return { status: 'CANCEL' };
  return { status: 'WAIT' };
}

async function fiveSimComplete(activationId) {
  await fiveSimRequest(`finish/${activationId}`);
}

async function fiveSimCancel(activationId) {
  await fiveSimRequest(`cancel/${activationId}`);
}

// ── Unified service abstraction ───────────────────────────────────────────────

async function fetchNumber(service) {
  if (service === '5sim')    return fiveSimGetNumber();
  if (service === 'smspool') return smsPoolGetNumber();
  return grizzlyGetNumber();
}

async function pollStatus(service, activationId) {
  if (service === '5sim')    return fiveSimCheckStatus(activationId);
  if (service === 'smspool') return smsPoolCheckStatus(activationId);
  return grizzlyCheckStatus(activationId);
}

async function completeActivation(service, activationId) {
  if (service === '5sim')    return fiveSimComplete(activationId);
  if (service === 'smspool') return smsPoolComplete(activationId);
  return grizzlyComplete(activationId);
}

async function cancelActivation(service, activationId) {
  if (service === '5sim')    return fiveSimCancel(activationId);
  if (service === 'smspool') return smsPoolCancel(activationId);
  return grizzlyCancel(activationId);
}

// ── Admin log helper ──────────────────────────────────────────────────────────

async function logToAdminChannel(client, message) {
  try {
    const channelId = db.getConfig('instagram_log_channel_id');
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel) await channel.send(message);
  } catch (err) {
    console.error('[GetNumber] Log error:', err.message);
  }
}

// ── Service selector ──────────────────────────────────────────────────────────

async function showServiceSelector(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('num_svc1')
      .setLabel('Service 1')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('num_svc2')
      .setLabel('Service 2')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('num_svc3')
      .setLabel('Service 3')
      .setStyle(ButtonStyle.Success),
  );
  return interaction.reply({
    content: '📱 Select the service to get your number:',
    components: [row],
    ephemeral: true,
  });
}

// ── Core flow ─────────────────────────────────────────────────────────────────

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {'grizzly'|'5sim'} service
 * @param {boolean} fromUpdate  true when called from a component button (deferUpdate instead of deferReply)
 */
async function executeGetNumber(interaction, service = 'grizzly', fromUpdate = false) {
  if (fromUpdate) {
    await interaction.deferUpdate();
  } else {
    await interaction.deferReply({ ephemeral: true });
  }

  let numberData;
  try {
    numberData = await fetchNumber(service);
  } catch (err) {
    console.error('[GetNumber] API error:', err.message);
    return interaction.editReply({
      content: `❌ ${friendlyError(err.message)}`,
      components: [],
    });
  }

  const { activationId, phoneNumber } = numberData;

  activationStore.set(activationId, {
    userId:      interaction.user.id,
    username:    interaction.user.username,
    phoneNumber,
    service,
  });

  const cancelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`num_cancel_${activationId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.editReply({
    content:
      `📱 **Your number is ready!**\n\n` +
      `\`\`\`${phoneNumber}\`\`\`\n` +
      `⏳ Waiting for the SMS verification code... *(up to 10 minutes)*\n\n` +
      `Enter the number above on Instagram. The code will appear here automatically.`,
    components: [cancelRow],
  });

  await logToAdminChannel(
    interaction.client,
    `📱 **${interaction.user.username}** requested a number — \`${phoneNumber}\` (${service})`,
  );

  // Background polling
  let attempts = 0;

  const poll = async () => {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      await cancelActivation(service, activationId).catch(() => {});
      activationStore.delete(activationId);
      await logToAdminChannel(
        interaction.client,
        `⏰ **${interaction.user.username}** — activation timed out. Number \`${phoneNumber}\` refunded automatically.`,
      );
      await interaction.editReply({
        content: `⏰ **Timed out** — No SMS received after 10 minutes. The number has been released.`,
        components: [],
      }).catch(() => {});
      return;
    }

    attempts++;

    let result;
    try {
      result = await pollStatus(service, activationId);
    } catch (err) {
      console.error('[GetNumber] Poll error:', err.message);
      setTimeout(poll, POLL_INTERVAL_MS);
      return;
    }

    if (result.status === 'OK') {
      await logToAdminChannel(
        interaction.client,
        `💬 **${interaction.user.username}** received a code on \`${phoneNumber}\``,
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`num_use_${activationId}`)
          .setLabel('✅ Used — Complete')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`num_cancel_${activationId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger),
      );

      await interaction.editReply({
        content:
          `📱 **Number:** \`${phoneNumber}\`\n\n` +
          `💬 **Code received!**\n` +
          `\`\`\`${result.code}\`\`\`\n` +
          `Enter this code on Instagram to complete registration.\n` +
          `Once done, click **✅ Used — Complete**.`,
        components: [row],
      }).catch(() => {});
      return;
    }

    if (result.status === 'CANCEL') {
      activationStore.delete(activationId);
      await interaction.editReply({
        content: `❌ The activation was cancelled by the provider.`,
        components: [],
      }).catch(() => {});
      return;
    }

    // WAIT — keep polling
    setTimeout(poll, POLL_INTERVAL_MS);
  };

  setTimeout(poll, POLL_INTERVAL_MS);
}

// ── Slash command ─────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('getnumber')
    .setDescription('Get a USA virtual phone number for Instagram registration.'),

  // Exported for getnumberHandler
  showServiceSelector,
  executeGetNumber,
  completeActivation,
  cancelActivation,
  logToAdminChannel,

  async execute(interaction) {
    let clarkRole = resolveClarkRole(interaction.member);
    if (!clarkRole) {
      const stored = db.getEmployee(interaction.user.id);
      if (stored?.role) clarkRole = stored.role;
    }

    if (!clarkRole || !clarkRole.toLowerCase().includes('instagram')) {
      return interaction.reply({
        content: '❌ This command is only available to Instagram employees.',
        ephemeral: true,
      });
    }

    return showServiceSelector(interaction);
  },
};

function friendlyError(raw) {
  const map = {
    NO_NUMBERS:          'No numbers available right now. Try again in a few minutes.',
    NO_BALANCE:          'Insufficient balance on the account. Contact an admin.',
    BAD_SERVICE:         'Invalid service configuration. Contact an admin.',
    BAD_KEY:             'Invalid API key. Contact an admin.',
    BAD_ACTION:          'Invalid API action. Contact an admin.',
    BANNED:              'This account is banned. Contact an admin.',
    ERROR_SQL:           'Server error. Try again later.',
    SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Try again in a few minutes.',
  };
  return map[raw] ?? `Service error: ${raw.slice(0, 100)}`;
}
