async function handleProxyInteraction(interaction) {
  if (interaction.customId !== 'proxy_rotate_btn') return;

  await interaction.deferReply({ ephemeral: true });

  const url = process.env.PROXY_ROTATE_URL;
  if (!url) {
    return interaction.editReply({
      content: '❌ Proxy not configured. Contact an admin (missing PROXY_ROTATE_URL).',
    });
  }

  let data;
  try {
    const res = await fetch(url);
    const text = await res.text();

    // Try to parse as JSON, fallback to raw text
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.trim() };
    }

    console.log(`[Proxy] Rotate response: ${res.status}`, data);

    if (res.status === 429) {
      const cooldown = data?.error || data?.message || 'Too soon. Try again later.';
      return interaction.editReply({ content: `⏳ **Cooldown active** — ${cooldown}` });
    }

    if (!res.ok) {
      const errMsg = data?.error || data?.message || `HTTP ${res.status}`;
      return interaction.editReply({ content: `❌ Failed to rotate IP: ${errMsg}` });
    }

    return interaction.editReply({ content: '✅ **IP rotated successfully!**' });

  } catch (err) {
    console.error('[Proxy] Rotate error:', err.message);
    return interaction.editReply({
      content: '❌ Could not reach the proxy server. Try again later.',
    });
  }
}

module.exports = { handleProxyInteraction };
