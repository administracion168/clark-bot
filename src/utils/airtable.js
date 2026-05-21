/**
 * Airtable API integration for Clark Bot — Ideas tracking.
 * Base: "Clark Bot — Ideas"  (appjUIc1QeMPsW8L8)
 * Token env: AIRTABLE_API_KEY
 * Base env:  AIRTABLE_BASE_ID
 * Table env: AIRTABLE_TABLE_ID
 */

const https = require('https');

function apiKey()  { return process.env.AIRTABLE_API_KEY; }
function baseId()  { return process.env.AIRTABLE_BASE_ID; }
function tableId() { return process.env.AIRTABLE_TABLE_ID; }

function airtableRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.airtable.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * Create a new record in Airtable for a content idea.
 * Returns the Airtable record ID string, or null if not configured.
 */
async function createIdeaRecord({ modelName, type, link, notes, createdAt }) {
  if (!apiKey() || !baseId() || !tableId()) {
    console.warn('[Airtable] Not configured — skipping record creation.');
    return null;
  }

  try {
    const typeLabel = type === 'reddit' ? 'Reddit' : 'Reels';
    const result = await airtableRequest('POST', `/v0/${baseId()}/${tableId()}`, {
      fields: {
        Idea:              `${typeLabel} — ${modelName}`,
        Modelo:            modelName,
        Tipo:              typeLabel,
        Link:              link,
        Notas:             notes || '',
        Estado:            'Pendiente',
        'Fecha Creación':  createdAt,
      },
    });

    if (result.id) {
      console.log(`[Airtable] Record created: ${result.id}`);
      return result.id;
    }
    console.error('[Airtable] Unexpected response:', result);
    return null;
  } catch (err) {
    console.error('[Airtable] Failed to create record:', err.message);
    return null;
  }
}

/**
 * Mark an existing Airtable record as completed.
 */
async function markIdeaCompleted(airtableRecordId, completedAt) {
  if (!apiKey() || !baseId() || !tableId() || !airtableRecordId) return;

  try {
    await airtableRequest('PATCH', `/v0/${baseId()}/${tableId()}/${airtableRecordId}`, {
      fields: {
        Estado:             'Completado',
        'Fecha Completado': completedAt,
      },
    });
    console.log(`[Airtable] Record ${airtableRecordId} marked as completed.`);
  } catch (err) {
    console.error('[Airtable] Failed to update record:', err.message);
  }
}

module.exports = { createIdeaRecord, markIdeaCompleted };
