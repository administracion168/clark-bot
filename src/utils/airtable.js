/**
 * Airtable API integration for Clark Bot — Ideas tracking.
 *
 * Structure: TWO fixed tables inside the base:
 *   "Reddit"          → all Reddit ideas
 *   "Instagram Reels" → all Reels ideas
 *
 * Both tables have a "Modelo" field (the model's name from the DB).
 * In Airtable you group the view by "Modelo" to get the collapsible
 * sections shown in the screenshot.
 *
 * Table IDs are created once on first use and stored in the bot's
 * DB config table so they survive restarts.
 *
 * Required env vars:
 *   AIRTABLE_API_KEY  — PAT with scopes:
 *                       data.records:read  data.records:write  schema:bases:write
 *   AIRTABLE_BASE_ID  — e.g. appjUIc1QeMPsW8L8
 */

const https = require('https');

function apiKey()       { return process.env.AIRTABLE_API_KEY; }
function baseId()       { return process.env.AIRTABLE_BASE_ID; }
function isConfigured() { return !!(apiKey() && baseId()); }

// ── HTTP helper ───────────────────────────────────────────────────────────────

function airtableRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.airtable.com',
      path,
      method,
      headers: {
        Authorization : `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Table names ───────────────────────────────────────────────────────────────

const TABLE_NAMES = {
  reddit : 'Reddit',
  reels  : 'Instagram Reels',
};

// ── Table creation ────────────────────────────────────────────────────────────

/**
 * Create one of the two fixed network tables.
 * Returns the new table ID.
 */
async function createNetworkTable(type) {
  const name = TABLE_NAMES[type];
  const result = await airtableRequest('POST', `/v0/meta/bases/${baseId()}/tables`, {
    name,
    description: `Ideas de contenido — ${name}`,
    fields: [
      // Primary field must be singleLineText (Airtable rule)
      { name: 'Modelo', type: 'singleLineText' },
      { name: 'Link',   type: 'url'            },
      { name: 'Notas',  type: 'multilineText'  },
      {
        name   : 'Estado',
        type   : 'singleSelect',
        options: {
          choices: [
            { name: 'Pendiente',  color: 'yellowLight2' },
            { name: 'Completado', color: 'greenLight2'  },
          ],
        },
      },
      {
        name   : 'Fecha Creación',
        type   : 'date',
        options: { dateFormat: { name: 'iso' } },
      },
      {
        name   : 'Fecha Completado',
        type   : 'date',
        options: { dateFormat: { name: 'iso' } },
      },
    ],
  });

  if (result.id) {
    console.log(`[Airtable] Created table "${name}": ${result.id}`);
    return result.id;
  }
  throw new Error(`[Airtable] createNetworkTable failed: ${JSON.stringify(result)}`);
}

/**
 * Get the table ID for a type, creating it the first time.
 * Stored in bot DB config: 'airtable_table_reddit' / 'airtable_table_reels'.
 */
async function getOrCreateNetworkTableId(type) {
  const db       = require('../database');
  const configKey = `airtable_table_${type}`;

  const stored = db.getConfig(configKey);
  if (stored) return stored;

  const tableId = await createNetworkTable(type);
  db.setConfig(configKey, tableId);
  return tableId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new idea record in the Reddit or Instagram Reels table.
 *
 * @param {object} opts
 * @param {string} opts.modelName  — model name from DB (used as "Modelo" field)
 * @param {string} opts.type       — 'reddit' | 'reels'
 * @param {string} opts.link
 * @param {string} [opts.notes]
 * @param {string} opts.createdAt  — ISO datetime string
 *
 * @returns {string|null} Airtable record ID, or null on failure
 */
async function createIdeaRecord({ modelName, type, link, notes, createdAt }) {
  if (!isConfigured()) {
    console.warn('[Airtable] Not configured — skipping record creation.');
    return null;
  }

  try {
    const tableId = await getOrCreateNetworkTableId(type);
    const dateStr = (createdAt || new Date().toISOString()).split('T')[0];

    const result = await airtableRequest('POST', `/v0/${baseId()}/${tableId}`, {
      fields: {
        Modelo           : modelName,
        Link             : link,
        Notas            : notes || '',
        Estado           : 'Pendiente',
        'Fecha Creación' : dateStr,
      },
    });

    if (result.id) {
      console.log(`[Airtable] Record created in "${TABLE_NAMES[type]}" for ${modelName}: ${result.id}`);
      return result.id;
    }
    console.error('[Airtable] Unexpected response:', result);
    return null;
  } catch (err) {
    console.error('[Airtable] createIdeaRecord error:', err.message);
    return null;
  }
}

/**
 * Mark an idea record as completed.
 *
 * @param {string} airtableRecordId
 * @param {string} type        — 'reddit' | 'reels' (to find the right table)
 * @param {string} completedAt — ISO datetime string
 */
async function markIdeaCompleted(airtableRecordId, type, completedAt) {
  if (!isConfigured() || !airtableRecordId) return;

  try {
    const db      = require('../database');
    const tableId = db.getConfig(`airtable_table_${type}`);

    if (!tableId) {
      console.warn(`[Airtable] No table for type "${type}" — cannot mark completed.`);
      return;
    }

    const dateStr = (completedAt || new Date().toISOString()).split('T')[0];
    await airtableRequest('PATCH', `/v0/${baseId()}/${tableId}/${airtableRecordId}`, {
      fields: {
        Estado            : 'Completado',
        'Fecha Completado': dateStr,
      },
    });
    console.log(`[Airtable] Marked completed: ${airtableRecordId}`);
  } catch (err) {
    console.error('[Airtable] markIdeaCompleted error:', err.message);
  }
}

// ── Instagram Stats ───────────────────────────────────────────────────────────

/**
 * Fetch aggregated Instagram stats for a model from the Instagram Tracker base.
 *
 * Required env vars:
 *   AIRTABLE_INSTAGRAM_BASE_ID  — e.g. appfsYM0qv2L4Apkn
 *   AIRTABLE_INSTAGRAM_TABLE_ID — e.g. tblKUrrcvDv5cmamf
 *
 * @param {string} modelName — must match the "Model" field in Airtable (case-insensitive)
 * @returns {{ totalFollowers, totalViews, delta24h, delta7d, usernames, accountCount } | null}
 */
async function getModelInstagramStats(modelName) {
  const igBase  = process.env.AIRTABLE_INSTAGRAM_BASE_ID;
  const igTable = process.env.AIRTABLE_INSTAGRAM_TABLE_ID;

  if (!apiKey() || !igBase || !igTable) {
    console.warn('[Airtable] Instagram env vars not configured — skipping stats.');
    return null;
  }

  // Case-insensitive filter on the Model field
  const formula      = encodeURIComponent(`LOWER({Model})=LOWER("${modelName}")`);
  const wantedFields = ['Username', 'Followers', 'Views Current', 'Delta 24h', 'Delta 7d'];
  const fieldParams  = wantedFields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  const basePath     = `/v0/${igBase}/${igTable}?${fieldParams}&filterByFormula=${formula}&pageSize=100`;

  try {
    let allRecords = [];
    let offset     = null;

    do {
      const path   = offset ? `${basePath}&offset=${encodeURIComponent(offset)}` : basePath;
      const result = await airtableRequest('GET', path, null);

      if (!Array.isArray(result.records)) {
        console.error('[Airtable] getModelInstagramStats unexpected response:', JSON.stringify(result).slice(0, 200));
        return null;
      }

      allRecords = allRecords.concat(result.records);
      offset     = result.offset ?? null;
    } while (offset);

    if (!allRecords.length) return null;

    const num = (r, field) => {
      const v = r.fields[field];
      return (typeof v === 'number') ? v : (parseFloat(v) || 0);
    };

    const totalFollowers = allRecords.reduce((s, r) => s + num(r, 'Followers'),     0);
    const totalViews     = allRecords.reduce((s, r) => s + num(r, 'Views Current'), 0);
    const delta24h       = allRecords.reduce((s, r) => s + num(r, 'Delta 24h'),     0);
    const delta7d        = allRecords.reduce((s, r) => s + num(r, 'Delta 7d'),      0);
    const usernames      = allRecords.map(r => r.fields['Username']).filter(Boolean);

    return {
      totalFollowers : Math.round(totalFollowers),
      totalViews     : Math.round(totalViews),
      delta24h       : Math.round(delta24h),
      delta7d        : Math.round(delta7d),
      usernames,
      accountCount   : allRecords.length,
    };
  } catch (err) {
    console.error('[Airtable] getModelInstagramStats error:', err.message);
    return null;
  }
}

module.exports = { createIdeaRecord, markIdeaCompleted, getModelInstagramStats };
