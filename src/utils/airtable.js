/**
 * Airtable API integration for Clark Bot — Ideas tracking.
 *
 * Structure: one TABLE per model (named after the model).
 * Each table has: Red (Instagram Reels / Reddit), Link, Notas,
 *                 Estado (Pendiente / Completado), Fecha Creación, Fecha Completado.
 *
 * Table IDs are stored in the bot's DB (models.airtable_table_id) so they
 * survive restarts without hitting the Airtable Meta API again.
 *
 * Required env vars:
 *   AIRTABLE_API_KEY  — Personal Access Token with scopes:
 *                       data.records:read, data.records:write, schema:bases:write
 *   AIRTABLE_BASE_ID  — e.g. appjUIc1QeMPsW8L8
 */

const https = require('https');

function apiKey()      { return process.env.AIRTABLE_API_KEY; }
function baseId()      { return process.env.AIRTABLE_BASE_ID; }
function isConfigured(){ return !!(apiKey() && baseId()); }

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

// ── Table management ──────────────────────────────────────────────────────────

/**
 * Create a new Airtable table named after the model.
 * Requires scope: schema:bases:write on the PAT.
 * Returns the new table ID (e.g. "tblXXXXXXXXXXXXXX").
 */
async function createModelTable(modelName) {
  const result = await airtableRequest(
    'POST',
    `/v0/meta/bases/${baseId()}/tables`,
    {
      name       : modelName,
      description: `Ideas de contenido — ${modelName}`,
      fields     : [
        {
          name   : 'Red',
          type   : 'singleSelect',
          options: {
            choices: [
              { name: 'Instagram Reels', color: 'pinkLight2'   },
              { name: 'Reddit',          color: 'orangeLight2' },
            ],
          },
        },
        { name: 'Link',  type: 'url'           },
        { name: 'Notas', type: 'multilineText' },
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
    },
  );

  if (result.id) {
    console.log(`[Airtable] Created table "${modelName}": ${result.id}`);
    return result.id;
  }
  throw new Error(`[Airtable] createModelTable failed: ${JSON.stringify(result)}`);
}

/**
 * Return the Airtable table ID for this model.
 * Creates the table the first time and stores the ID in SQLite.
 */
async function getOrCreateModelTableId(modelId, modelName) {
  // Lazy-require to avoid circular dependency
  const db = require('../database');
  const model = db.getModel(modelId);

  if (model?.airtable_table_id) return model.airtable_table_id;

  const tableId = await createModelTable(modelName);
  db.setModelAirtableTableId(modelId, tableId);
  return tableId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new idea record in the model's own Airtable table.
 * Returns the Airtable record ID string, or null on failure.
 *
 * @param {object} opts
 * @param {number} opts.modelId    — bot DB model id
 * @param {string} opts.modelName  — model name (used as table name)
 * @param {string} opts.type       — 'reddit' | 'reels'
 * @param {string} opts.link
 * @param {string} [opts.notes]
 * @param {string} opts.createdAt  — ISO datetime string
 */
async function createIdeaRecord({ modelId, modelName, type, link, notes, createdAt }) {
  if (!isConfigured()) {
    console.warn('[Airtable] Not configured — skipping record creation.');
    return null;
  }

  try {
    const tableId  = await getOrCreateModelTableId(modelId, modelName);
    const redLabel = type === 'reddit' ? 'Reddit' : 'Instagram Reels';
    const dateStr  = (createdAt || new Date().toISOString()).split('T')[0];

    const result = await airtableRequest('POST', `/v0/${baseId()}/${tableId}`, {
      fields: {
        Red              : redLabel,
        Link             : link,
        Notas            : notes || '',
        Estado           : 'Pendiente',
        'Fecha Creación' : dateStr,
      },
    });

    if (result.id) {
      console.log(`[Airtable] Record created in "${modelName}": ${result.id}`);
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
 * Mark an existing Airtable record as completed.
 *
 * @param {string} airtableRecordId  — the record's Airtable ID
 * @param {number} modelId           — bot DB model id (to find the right table)
 * @param {string} completedAt       — ISO datetime string
 */
async function markIdeaCompleted(airtableRecordId, modelId, completedAt) {
  if (!isConfigured() || !airtableRecordId) return;

  try {
    const db = require('../database');
    const model = db.getModel(modelId);

    if (!model?.airtable_table_id) {
      console.warn(`[Airtable] No table ID for model ${modelId} — skipping markCompleted.`);
      return;
    }

    const dateStr = (completedAt || new Date().toISOString()).split('T')[0];

    await airtableRequest(
      'PATCH',
      `/v0/${baseId()}/${model.airtable_table_id}/${airtableRecordId}`,
      {
        fields: {
          Estado            : 'Completado',
          'Fecha Completado': dateStr,
        },
      },
    );
    console.log(`[Airtable] Marked completed: ${airtableRecordId}`);
  } catch (err) {
    console.error('[Airtable] markIdeaCompleted error:', err.message);
  }
}

module.exports = { createIdeaRecord, markIdeaCompleted };
