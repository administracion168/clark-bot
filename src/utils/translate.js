/**
 * DeepL translation utility.
 * Uses the free-tier API (api-free.deepl.com).
 * Falls back silently to the original text on any error.
 */

async function translate(text, targetLang) {
  if (!process.env.DEEPL_API_KEY || !text?.trim()) return text;

  // DeepL language codes
  const target = targetLang === 'es' ? 'ES' : 'EN-US';

  try {
    const res = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: [text], target_lang: target }),
    });

    if (!res.ok) {
      console.error(`[Translate] DeepL error ${res.status}: ${await res.text()}`);
      return text;
    }

    const data = await res.json();
    return data.translations?.[0]?.text ?? text;
  } catch (err) {
    console.error('[Translate] Request failed:', err.message);
    return text; // always fall back to original
  }
}

module.exports = { translate };
