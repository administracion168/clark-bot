const TelegramBot = require('node-telegram-bot-api');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');
const { translate } = require('../utils/translate');
const { markIdeaCompleted, getModelInstagramStats } = require('../utils/airtable');
const { generatePendingIdeasPdf } = require('../utils/pdfGenerator');

let bot          = null;
let discordClient = null;

// In-memory state
const pendingActions = new Map(); // chatId → { action, ticketId }
const pendingLink    = new Map(); // chatId → rawCode | '__lang_xx'
const lastDashboard  = new Map(); // chatId → messageId  (the card we edit in-place)

// ── Menu labels (persistent keyboard) ────────────────────────────────────────

const MENU = {
  en: { customs: '📋 My Customs', reels: '🎬 Reels Ideas', reddit: '💡 Reddit Ideas', socials: '📱 Socials', lang: '🌐 Language' },
  es: { customs: '📋 Mis Customs', reels: '🎬 Ideas Reels', reddit: '💡 Ideas Reddit', socials: '📱 Redes',   lang: '🌐 Idioma'  },
};

function mainMenuKeyboard(lang) {
  const m = MENU[lang] ?? MENU.en;
  return {
    keyboard: [
      [{ text: m.customs }, { text: m.reels   }, { text: m.reddit  }],
      [{ text: m.socials }, { text: m.lang    }],
    ],
    resize_keyboard : true,
    is_persistent   : true,
  };
}

// ── Translations ──────────────────────────────────────────────────────────────

const T = {
  en: {
    chooseLanguage : '🌐 Choose your language / Elige tu idioma:',
    sendCode       : '✅ Language set to English!\n\nNow send your linking code:\n<code>/start CLARK-XXXXXX</code>',
    invalidCode    : '❌ Invalid code. Ask your admin for a new one.',
    alreadyLinked  : '✅ Already linked! Use the menu below.',
    linked         : (name) => `✅ Linked as <b>${name}</b>! You'll receive custom requests here.`,
    newRequest     : (n) => `📋 <b>NEW REQUEST #${n}</b>`,
    chatterLabel   : 'Support',
    priorityUrgent : '🔴 URGENT',
    priorityNormal : '🟢 Normal',
    fieldType      : 'Type',
    fieldPriority  : 'Priority',
    fieldPrice     : 'Price',
    fieldEstimate  : 'Client estimate',
    fieldDetails   : '<b>Details:</b>',
    notSpecified   : 'Not specified',
    btnAccept      : '✅ Accept',
    btnDeny        : '❌ Deny',
    btnQuestion    : '💬 Ask question',
    btnReply       : '💬 Reply',
    btnDone        : '📦 Mark Delivered',
    btnCancel      : '🚫 Cancel',
    askDays        : '✅ How many days do you estimate for delivery? (reply with a number)',
    askDenyReason  : '❌ What is the reason for denying this?',
    askQuestion    : '💬 What is your question for the chatter?',
    askReply       : '💬 Type your message:',
    askCancelReason: '🚫 Why are you cancelling?',
    invalidDays    : '❌ Please send a valid number (e.g. 2). Try again:',
    accepted       : (days) => `✅ Accepted! Estimated delivery: ${days} day(s).`,
    denied         : '❌ Request denied. Chatter has been notified.',
    questionSent   : '✅ Question sent.',
    messageSent    : '✅ Message sent.',
    delivered      : '✅ Marked as delivered! Waiting for chatter confirmation.',
    cancelled      : '🚫 Request cancelled.',
    supportLabel   : '💬 <b>Support:</b>',
  },
  es: {
    chooseLanguage : '🌐 Choose your language / Elige tu idioma:',
    sendCode       : '✅ ¡Idioma configurado en Español!\n\nAhora envía tu código de vinculación:\n<code>/start CLARK-XXXXXX</code>',
    invalidCode    : '❌ Código inválido. Pide un nuevo código a tu administrador.',
    alreadyLinked  : '✅ ¡Ya estás vinculada! Usa el menú de abajo.',
    linked         : (name) => `✅ Vinculada como <b>${name}</b>. ¡Recibirás tus solicitudes aquí!`,
    newRequest     : (n) => `📋 <b>NUEVA SOLICITUD #${n}</b>`,
    chatterLabel   : 'Soporte',
    priorityUrgent : '🔴 URGENTE',
    priorityNormal : '🟢 Normal',
    fieldType      : 'Tipo',
    fieldPriority  : 'Prioridad',
    fieldPrice     : 'Precio',
    fieldEstimate  : 'Estimado del cliente',
    fieldDetails   : '<b>Detalles:</b>',
    notSpecified   : 'No especificado',
    btnAccept      : '✅ Aceptar',
    btnDeny        : '❌ Rechazar',
    btnQuestion    : '💬 Preguntar',
    btnReply       : '💬 Responder',
    btnDone        : '📦 Entregar',
    btnCancel      : '🚫 Cancelar',
    askDays        : '✅ ¿En cuántos días estimas la entrega? (responde con un número)',
    askDenyReason  : '❌ ¿Cuál es el motivo del rechazo?',
    askQuestion    : '💬 ¿Cuál es tu pregunta para el equipo de soporte?',
    askReply       : '💬 Escribe tu mensaje:',
    askCancelReason: '🚫 ¿Motivo de la cancelación?',
    invalidDays    : '❌ Por favor envía un número válido (ej: 2). Inténtalo de nuevo:',
    accepted       : (days) => `✅ ¡Aceptado! Entrega estimada: ${days} día(s).`,
    denied         : '❌ Solicitud rechazada. El equipo de soporte ha sido notificado.',
    questionSent   : '✅ Pregunta enviada.',
    messageSent    : '✅ Mensaje enviado.',
    delivered      : '✅ ¡Marcado como entregado! Esperando confirmación.',
    cancelled      : '🚫 Solicitud cancelada.',
    supportLabel   : '💬 <b>Soporte:</b>',
  },
};

function t(lang, key, ...args) {
  const l = T[lang] ?? T.en;
  const val = l[key] ?? T.en[key];
  return typeof val === 'function' ? val(...args) : val;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeLabel(type, lang) {
  const en = { video: '🎬 Custom Video', photo: '📸 Custom Photo', audio: '🎙️ Custom Audio', question: '❓ Question', other: '📋 Other' };
  const es = { video: '🎬 Video personalizado', photo: '📸 Foto personalizada', audio: '🎙️ Audio personalizado', question: '❓ Pregunta', other: '📋 Otro' };
  return (lang === 'es' ? es : en)[type] ?? type;
}

function escapeMd(text) {
  if (!text) return '';
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function modelLang(ticketId) {
  const ticket = db.getTicket(ticketId);
  const model  = ticket ? db.getModel(ticket.model_id) : null;
  return model?.language || 'en';
}

function languageKeyboard() {
  return {
    inline_keyboard: [[
      { text: '🇬🇧 English', callback_data: 'lang_en' },
      { text: '🇪🇸 Español', callback_data: 'lang_es' },
    ]],
  };
}

function requestKeyboard(ticketId, lang) {
  return {
    inline_keyboard: [
      [
        { text: t(lang, 'btnAccept'),   callback_data: `tg_accept_${ticketId}` },
        { text: t(lang, 'btnDeny'),     callback_data: `tg_deny_${ticketId}` },
      ],
      [{ text: t(lang, 'btnQuestion'), callback_data: `tg_question_${ticketId}` }],
      [{ text: t(lang, 'btnCancel'),   callback_data: `tg_cancel_${ticketId}` }],
    ],
  };
}

function replyKeyboard(ticketId, lang) {
  return {
    inline_keyboard: [
      [{ text: t(lang, 'btnReply'),  callback_data: `tg_reply_${ticketId}` }],
      [{ text: t(lang, 'btnDone'),   callback_data: `tg_done_${ticketId}` }],
      [{ text: t(lang, 'btnCancel'), callback_data: `tg_cancel_${ticketId}` }],
    ],
  };
}

// ── Dashboard engine ──────────────────────────────────────────────────────────
// One persistent "card" per chat that gets edited in-place — no message pile-up.

async function updateDashboard(chatId, lang, html, inlineRows = null) {
  if (!bot) return;
  const prevId    = lastDashboard.get(chatId);
  const inlineKb  = inlineRows ? { inline_keyboard: inlineRows } : undefined;

  if (prevId) {
    try {
      await bot.editMessageText(html, {
        chat_id    : chatId,
        message_id : prevId,
        parse_mode : 'HTML',
        disable_web_page_preview: true,
        reply_markup: inlineKb,
      });
      return; // edited in-place, no new message needed
    } catch (_) {
      // Message too old / deleted — fall through to send fresh
    }
  }

  // Send fresh + set persistent keyboard
  const msg = await bot.sendMessage(chatId, html, {
    parse_mode  : 'HTML',
    disable_web_page_preview: true,
    reply_markup: inlineKb ?? mainMenuKeyboard(lang),
  });

  // Clean up the stale card
  if (prevId) bot.deleteMessage(chatId, prevId).catch(() => {});
  lastDashboard.set(chatId, msg.message_id);
}

// Refresh the keyboard (language change) — must send a new message.
async function refreshMenuKeyboard(chatId, lang, html, inlineRows = null) {
  if (!bot) return;
  const prevId   = lastDashboard.get(chatId);
  const inlineKb = inlineRows ? { inline_keyboard: inlineRows } : undefined;

  const msg = await bot.sendMessage(chatId, html, {
    parse_mode  : 'HTML',
    disable_web_page_preview: true,
    reply_markup: inlineKb ?? mainMenuKeyboard(lang),
  });

  if (prevId) bot.deleteMessage(chatId, prevId).catch(() => {});
  lastDashboard.set(chatId, msg.message_id);
}

// ── Dashboard builders ────────────────────────────────────────────────────────

function buildHomeDashboard(model) {
  const lang  = model.language || 'en';
  const isEs  = lang === 'es';
  const name  = model.name;

  const pending  = db.getModelPendingIdeas(model.id);
  const reels    = pending.filter(i => i.type === 'reels').length;
  const reddit   = pending.filter(i => i.type === 'reddit').length;
  const tickets  = ['pending', 'accepted', 'delivered']
    .flatMap(s => db.getAllTickets({ status: s, modelId: model.id }));

  const lines = [];
  if (tickets.length)   lines.push(isEs ? `📋 <b>${tickets.length}</b> custom(s) activo(s)` : `📋 <b>${tickets.length}</b> active custom(s)`);
  if (reels   > 0)      lines.push(isEs ? `🎬 <b>${reels}</b> idea(s) Reels pendiente(s)` : `🎬 <b>${reels}</b> pending Reels idea(s)`);
  if (reddit  > 0)      lines.push(isEs ? `💡 <b>${reddit}</b> idea(s) Reddit pendiente(s)` : `💡 <b>${reddit}</b> pending Reddit idea(s)`);
  if (!lines.length)    lines.push(isEs ? '✅ ¡Todo al día!' : '✅ All up to date!');

  const greeting = isEs ? `👋 Hola, <b>${name}</b>` : `👋 Hi, <b>${name}</b>`;
  const hint = isEs ? '\n\n<i>Usa los botones del menú para navegar.</i>' : '\n\n<i>Use the menu buttons to navigate.</i>';
  return { html: greeting + '\n\n' + lines.join('\n') + hint, rows: null };
}

// ── Customs: list view (one button per ticket) ────────────────────────────────

function buildCustomsList(model) {
  const lang = model.language || 'en';
  const isEs = lang === 'es';

  const tickets = ['pending', 'accepted', 'delivered']
    .flatMap(s => db.getAllTickets({ status: s, modelId: model.id }));

  if (!tickets.length) {
    return {
      html: isEs
        ? '📋 <b>Mis Customs</b>\n\n✅ ¡No tienes customs pendientes!\nTodo al día 🎉'
        : '📋 <b>My Customs</b>\n\n✅ No pending customs!\nAll up to date 🎉',
      rows: null,
    };
  }

  const statusIcon = { pending: '⏳', accepted: '✅', delivered: '📦' };

  const title = isEs
    ? `📋 <b>Mis Customs</b> (${tickets.length})\n\nToca una solicitud para ver los detalles:`
    : `📋 <b>My Customs</b> (${tickets.length})\n\nTap a request to see details:`;

  // One button per ticket — shows status icon + number + type
  const rows = tickets.map(tk => {
    const icon  = statusIcon[tk.status] ?? '📋';
    const label = `${icon} #${tk.ticket_number} — ${typeLabel(tk.type, lang)}`;
    return [{ text: label, callback_data: `custom_open_${tk.id}` }];
  });

  return { html: title, rows };
}

// ── Customs: ticket detail view ───────────────────────────────────────────────

function buildTicketDetail(model, ticket) {
  const lang = model.language || 'en';
  const isEs = lang === 'es';

  const statusIcon    = { pending: '⏳', accepted: '✅', delivered: '📦' };
  const statusLabelEs = { pending: 'Pendiente', accepted: 'Aceptado', delivered: 'Entregado — esperando confirmación' };
  const statusLabelEn = { pending: 'Pending',   accepted: 'Accepted', delivered: 'Delivered — awaiting confirmation' };

  const icon       = statusIcon[ticket.status] ?? '📋';
  const statusTxt  = isEs ? (statusLabelEs[ticket.status] ?? ticket.status) : (statusLabelEn[ticket.status] ?? ticket.status);
  const priceStr   = ticket.price ? `$${ticket.price}` : (isEs ? 'No especificado' : 'Not specified');
  const estStr     = ticket.client_estimated_time ?? (isEs ? 'No especificado' : 'Not specified');
  const desc       = ticket.description ?? '';

  const html =
    `${icon} <b>#${ticket.ticket_number} — ${typeLabel(ticket.type, lang)}</b>\n\n` +
    `📌 <b>${isEs ? 'Estado' : 'Status'}:</b> ${statusTxt}\n` +
    `💰 <b>${isEs ? 'Precio' : 'Price'}:</b> ${priceStr}\n` +
    `⏱ <b>${isEs ? 'Estimado cliente' : 'Client estimate'}:</b> ${estStr}\n\n` +
    `📝 <b>${isEs ? 'Descripción' : 'Description'}:</b>\n${desc}`;

  const backBtn = [{ text: isEs ? '← Volver a lista' : '← Back to list', callback_data: 'custom_list' }];

  let actionRows = [];
  if (ticket.status === 'pending') {
    actionRows = [[
      { text: isEs ? '✅ Aceptar'  : '✅ Accept', callback_data: `tg_accept_${ticket.id}` },
      { text: isEs ? '❌ Rechazar' : '❌ Deny',   callback_data: `tg_deny_${ticket.id}`   },
    ]];
  } else if (ticket.status === 'accepted') {
    actionRows = [
      [
        { text: isEs ? '💬 Responder'    : '💬 Reply',       callback_data: `tg_reply_${ticket.id}` },
        { text: isEs ? '📦 Marcar entregado' : '📦 Mark delivered', callback_data: `tg_done_${ticket.id}`  },
      ],
    ];
  } else if (ticket.status === 'delivered') {
    actionRows = [[{ text: isEs ? '⏳ Esperando confirmación del chatter' : '⏳ Waiting for chatter confirmation', callback_data: 'noop' }]];
  }

  return { html, rows: [...actionRows, backBtn] };
}

// Legacy alias — kept for internal refreshes that still call buildCustomsDashboard
function buildCustomsDashboard(model) {
  return buildCustomsList(model);
}

function buildIdeasDashboard(model, type) {
  const lang   = model.language || 'en';
  const isEs   = lang === 'es';
  const ideas  = db.getModelPendingIdeas(model.id).filter(i => i.type === type);

  const info = {
    reels:  { emoji: '🎬', es: 'Ideas Reels',   en: 'Reels Ideas'  },
    reddit: { emoji: '💡', es: 'Ideas Reddit',  en: 'Reddit Ideas' },
  }[type] ?? { emoji: '📋', es: type, en: type };

  const label = isEs ? info.es : info.en;

  if (!ideas.length) {
    return {
      html: `${info.emoji} <b>${label}</b>\n\n✅ ${isEs ? '¡Todo al día! No tienes ideas pendientes.' : 'All up to date! No pending ideas.'}`,
      rows: null,
    };
  }

  const lines = ideas.map((idea) => {
    const num  = idea.model_idea_number ?? '?';
    const note = idea.notes ? ` — <i>${idea.notes.slice(0, 50)}${idea.notes.length > 50 ? '…' : ''}</i>` : '';
    return `#${num} 🔗 ${idea.link}${note}`;
  });

  const html = `${info.emoji} <b>${label}</b> (${ideas.length})\n\n` + lines.join('\n');

  const rows = [
    ...ideas.map((idea) => [
      { text: `✅ #${idea.model_idea_number ?? '?'} ${isEs ? 'Completada' : 'Done'}`, callback_data: `idea_complete_${idea.id}` },
    ]),
    [{ text: isEs ? '📄 Descargar PDF' : '📄 Download PDF', callback_data: `ideas_pdf_${type}` }],
  ];

  return { html, rows };
}

// ── Socials: sub-menu ─────────────────────────────────────────────────────────

function buildSocialsMenu(model) {
  const lang = model.language || 'en';
  const isEs = lang === 'es';

  const html = isEs
    ? '📱 <b>Redes Sociales</b>\n\n¿Qué quieres ver?'
    : '📱 <b>Social Stats</b>\n\nWhat would you like to see?';

  const rows = [
    [{ text: isEs ? '👥 Seguidores totales'    : '👥 Total Followers',   callback_data: 'socials_followers' }],
    [{ text: isEs ? '👁️ Views totales'         : '👁️ Total Views',       callback_data: 'socials_views'     }],
    [{ text: isEs ? '📈 Views últimas 24h'     : '📈 Views last 24h',    callback_data: 'socials_delta24h'  }],
    [{ text: isEs ? '📊 Views últimos 7 días'  : '📊 Views last 7 days', callback_data: 'socials_delta7d'   }],
    [{ text: isEs ? '📱 Mis cuentas'           : '📱 My accounts',       callback_data: 'socials_accounts'  }],
  ];

  return { html, rows };
}

// ── Socials: individual stat view (async — fetches Airtable) ──────────────────

async function buildSocialsStat(model, statKey) {
  const lang    = model.language || 'en';
  const isEs    = lang === 'es';
  const backBtn = [{ text: isEs ? '← Volver a Redes' : '← Back to Socials', callback_data: 'socials_menu' }];

  // Use manually mapped Airtable name if set, otherwise fall back to model name
  const igName = model.airtable_ig_name || model.name;
  const stats  = await getModelInstagramStats(igName);

  if (!stats) {
    return {
      html: isEs
        ? '❌ No se pudo obtener la información de Instagram.\nIntenta de nuevo en unos minutos.'
        : '❌ Could not retrieve Instagram data.\nPlease try again in a few minutes.',
      rows: [backBtn],
    };
  }

  if (!stats.accountCount) {
    return {
      html: isEs
        ? '❌ No se encontraron cuentas asociadas a este perfil.'
        : '❌ No accounts found for this profile.',
      rows: [backBtn],
    };
  }

  const fmt  = (n) => Number(n).toLocaleString('en');
  const sign = (n) => (n >= 0 ? '+' : '') + fmt(n);
  let html;

  if (statKey === 'followers') {
    html = isEs
      ? `👥 <b>Seguidores Totales</b>\n\n<b>${fmt(stats.totalFollowers)}</b> seguidores\n\n<i>${stats.accountCount} cuenta(s) activa(s)</i>`
      : `👥 <b>Total Followers</b>\n\n<b>${fmt(stats.totalFollowers)}</b> followers\n\n<i>${stats.accountCount} active account(s)</i>`;

  } else if (statKey === 'views') {
    html = isEs
      ? `👁️ <b>Views Totales</b>\n\n<b>${fmt(stats.totalViews)}</b> views\n\n<i>${stats.accountCount} cuenta(s) activa(s)</i>`
      : `👁️ <b>Total Views</b>\n\n<b>${fmt(stats.totalViews)}</b> views\n\n<i>${stats.accountCount} active account(s)</i>`;

  } else if (statKey === 'delta24h') {
    html = isEs
      ? `📈 <b>Views — Últimas 24h</b>\n\n<b>${sign(stats.delta24h)}</b> views\n\n<i>Variación respecto a hace 24 horas</i>`
      : `📈 <b>Views — Last 24h</b>\n\n<b>${sign(stats.delta24h)}</b> views\n\n<i>Change vs. 24 hours ago</i>`;

  } else if (statKey === 'delta7d') {
    html = isEs
      ? `📊 <b>Views — Últimos 7 días</b>\n\n<b>${sign(stats.delta7d)}</b> views\n\n<i>Variación respecto a hace 7 días</i>`
      : `📊 <b>Views — Last 7 days</b>\n\n<b>${sign(stats.delta7d)}</b> views\n\n<i>Change vs. 7 days ago</i>`;

  } else if (statKey === 'accounts') {
    const MAX_SHOWN = 25;
    const shown     = stats.usernames.slice(0, MAX_SHOWN).map(u => `• @${u}`).join('\n');
    const extra     = stats.usernames.length - MAX_SHOWN;
    const extraLine = extra > 0
      ? (isEs ? `\n\n<i>...y ${extra} más</i>` : `\n\n<i>...and ${extra} more</i>`)
      : '';
    html = isEs
      ? `📱 <b>Mis Cuentas</b> (${stats.accountCount})\n\n${shown}${extraLine}`
      : `📱 <b>My Accounts</b> (${stats.accountCount})\n\n${shown}${extraLine}`;

  } else {
    html = isEs ? '❓ Estadística desconocida.' : '❓ Unknown stat.';
  }

  return { html, rows: [backBtn] };
}

function buildLanguageDashboard(lang) {
  const isEs = lang === 'es';
  return {
    html : isEs ? '🌐 <b>Idioma</b>\n\nElige tu idioma:' : '🌐 <b>Language</b>\n\nChoose your language:',
    rows : [[
      { text: '🇬🇧 English', callback_data: 'menu_lang_en' },
      { text: '🇪🇸 Español', callback_data: 'menu_lang_es' },
    ]],
  };
}

// ── Outbound: send request card to model ──────────────────────────────────────

async function sendRequestToModel(ticket, model) {
  if (!bot || !model.telegram_chat_id) return;

  const lang        = model.language || 'en';
  const priorityTag = ticket.priority === 'urgent' ? t(lang, 'priorityUrgent') : t(lang, 'priorityNormal');
  const priceStr    = ticket.price ? `$${ticket.price}` : t(lang, 'notSpecified');

  const descRaw = lang === 'es' ? await translate(ticket.description, 'es') : ticket.description;
  const estRaw  = (lang === 'es' && ticket.client_estimated_time) ? await translate(ticket.client_estimated_time, 'es') : (ticket.client_estimated_time ?? t(lang, 'notSpecified'));

  const html =
    `${t(lang, 'newRequest', ticket.ticket_number)}\n\n` +
    `👤 ${t(lang, 'chatterLabel')}\n` +
    `📁 ${t(lang, 'fieldType')}: ${typeLabel(ticket.type, lang)}\n` +
    `⚡ ${t(lang, 'fieldPriority')}: ${priorityTag}\n` +
    `💰 ${t(lang, 'fieldPrice')}: ${priceStr}\n` +
    `⏱ ${t(lang, 'fieldEstimate')}: ${estRaw}\n\n` +
    `${t(lang, 'fieldDetails')}\n${descRaw}`;

  try {
    const msg = await bot.sendMessage(model.telegram_chat_id, html, {
      parse_mode   : 'HTML',
      reply_markup : requestKeyboard(ticket.id, lang),
    });
    db.updateTicketTelegram(ticket.id, String(msg.message_id));
  } catch (err) {
    console.error('[Telegram] Failed to send request to model:', err.message);
  }
}

// ── Outbound: forward chatter message ────────────────────────────────────────

async function forwardToModel(ticketId, _chatterName, message) {
  if (!bot) return;
  const ticket = db.getTicket(ticketId);
  const model  = db.getModel(ticket.model_id);
  if (!model?.telegram_chat_id) return;

  const lang       = model.language || 'en';
  const translated = lang === 'es' ? await translate(message, 'es') : message;

  await bot.sendMessage(model.telegram_chat_id, `${t(lang, 'supportLabel')} ${translated}`, {
    parse_mode   : 'HTML',
    reply_markup : replyKeyboard(ticketId, lang),
  });
}

// ── Outbound: notify model chatter cancelled ──────────────────────────────────

async function notifyModelCancelledByChatter(ticketId, reason) {
  if (!bot) return;
  const ticket = db.getTicket(ticketId);
  const model  = ticket ? db.getModel(ticket.model_id) : null;
  if (!model?.telegram_chat_id) return;

  const lang = model.language || 'en';
  const msg  = lang === 'es'
    ? `🚫 La solicitud <b>#${ticket.ticket_number}</b> fue cancelada por Soporte.\n\n<b>Motivo:</b> ${reason}`
    : `🚫 Request <b>#${ticket.ticket_number}</b> was cancelled by Support.\n\n<b>Reason:</b> ${reason}`;

  try {
    await bot.sendMessage(model.telegram_chat_id, msg, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[Telegram] Failed to notify model of chatter cancellation:', err.message);
  }
}

// ── Outbound: send idea card to model ─────────────────────────────────────────

async function sendIdeaToModel(idea, model) {
  if (!bot || !model.telegram_chat_id) return null;

  const info = { reddit: { emoji: '💡', label: 'Reddit' }, reels: { emoji: '🎬', label: 'Instagram Reels' } }[idea.type] ?? { emoji: '📋', label: idea.type };
  const notes  = idea.notes ? `\n\n📝 <b>Notas:</b>\n${idea.notes}` : '';
  const numTag = idea.model_idea_number ? ` <b>#${idea.model_idea_number}</b>` : '';

  const html = `${info.emoji} <b>Nueva Idea${numTag} — ${info.label}</b>\n\n🔗 <b>Link:</b> ${idea.link}${notes}`;

  try {
    const msg = await bot.sendMessage(model.telegram_chat_id, html, {
      parse_mode  : 'HTML',
      reply_markup: { inline_keyboard: [[{ text: `✅ #${idea.model_idea_number ?? '?'} Marcar como completada`, callback_data: `idea_complete_${idea.id}` }]] },
      disable_web_page_preview: true,
    });
    return msg.message_id;
  } catch (err) {
    console.error('[Telegram] Failed to send idea to model:', err.message);
    return null;
  }
}

// ── Discord ticket channel helper ─────────────────────────────────────────────

async function postToTicketChannel(ticketId, embed, components) {
  const ticket = db.getTicket(ticketId);
  if (!ticket?.channel_id || !discordClient) return;
  try {
    const ch = await discordClient.channels.fetch(ticket.channel_id);
    await ch.send({ embeds: [embed], components: components ?? [] });
  } catch (err) {
    console.error('[Telegram→Discord] Failed to post to ticket channel:', err.message);
  }
}

// ── Ticket action handlers ────────────────────────────────────────────────────

async function handleAccept(chatId, ticketId, days) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang = modelLang(ticketId);

  db.updateTicketStatus(ticketId, 'accepted', { modelEstimatedDays: days });
  db.addTicketMessage(ticketId, 'system', 'Clark', `✅ Accepted — estimated delivery: ${days} day(s)`);

  await postToTicketChannel(ticketId, new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`✅ Request #${ticket.ticket_number} Accepted`)
    .addFields({ name: 'Estimated delivery', value: `${days} day(s)` })
    .setTimestamp());

  await bot.sendMessage(chatId, t(lang, 'accepted', days), { parse_mode: 'HTML' });
}

async function handleDeny(chatId, ticketId, reason) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang = modelLang(ticketId);

  db.updateTicketStatus(ticketId, 'denied', { denyReason: reason });
  db.addTicketMessage(ticketId, 'system', 'Clark', `❌ Denied — reason: ${reason}`);

  await postToTicketChannel(ticketId, new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`❌ Request #${ticket.ticket_number} Denied`)
    .addFields({ name: 'Reason', value: reason })
    .setTimestamp());

  await bot.sendMessage(chatId, t(lang, 'denied'), { parse_mode: 'HTML' });
}

async function handleQuestion(chatId, ticketId, question) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang = modelLang(ticketId);

  db.addTicketMessage(ticketId, 'model', 'Model', question);
  const forDiscord = lang === 'es' ? await translate(question, 'en') : question;

  await postToTicketChannel(ticketId, new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(`💬 Model has a question — #${ticket.ticket_number}`)
    .setDescription(forDiscord)
    .setTimestamp());

  await bot.sendMessage(chatId, t(lang, 'questionSent'), { parse_mode: 'HTML' });
}

async function handleModelReply(chatId, ticketId, message) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang  = modelLang(ticketId);
  const model = db.getModel(ticket.model_id);

  db.addTicketMessage(ticketId, 'model', model?.name ?? 'Model', message);
  const forDiscord = lang === 'es' ? await translate(message, 'en') : message;

  await postToTicketChannel(ticketId, new EmbedBuilder()
    .setColor(0x9b59b6)
    .setAuthor({ name: `${model?.name ?? 'Model'} — Reply` })
    .setDescription(forDiscord)
    .setTimestamp());

  await bot.sendMessage(chatId, t(lang, 'messageSent'), { parse_mode: 'HTML' });
}

async function handleDone(chatId, ticketId) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang = modelLang(ticketId);

  db.updateTicketStatus(ticketId, 'delivered');
  db.addTicketMessage(ticketId, 'system', 'Clark', '📦 Model marked as delivered.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`req_received_${ticketId}`)
      .setLabel('✅ Confirm Received')
      .setStyle(ButtonStyle.Success)
  );

  await postToTicketChannel(ticketId,
    new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`📦 Content Delivered — #${ticket.ticket_number}`)
      .setDescription('The model has marked this request as delivered. Please confirm receipt.')
      .setTimestamp(),
    [row]
  );

  await bot.sendMessage(chatId, t(lang, 'delivered'), { parse_mode: 'HTML' });
}

async function handleCancelByModel(chatId, ticketId, reason) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang = modelLang(ticketId);

  db.updateTicketStatus(ticketId, 'cancelled');
  db.addTicketMessage(ticketId, 'system', 'Clark', `🚫 Cancelled by model — reason: ${reason}`);

  await postToTicketChannel(ticketId, new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle(`🚫 Request #${ticket.ticket_number} Cancelled by Model`)
    .addFields({ name: 'Reason', value: reason })
    .setTimestamp());

  await bot.sendMessage(chatId, t(lang, 'cancelled'), { parse_mode: 'HTML' });
}

// ── Start bot ─────────────────────────────────────────────────────────────────

function startTelegramBot(client) {
  discordClient = client;

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN not set — Telegram disabled.');
    return null;
  }

  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: { interval: 2000, autoStart: true, params: { timeout: 10 } },
  });

  // /start  or  /start CLARK-CODE
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId  = String(msg.chat.id);
    const rawArg  = (match[1] ?? '').trim().toUpperCase();
    const rawCode = rawArg.startsWith('CLARK-') ? rawArg.slice(6) : rawArg;

    const existing = db.getModelByTelegramId(chatId);
    if (existing?.linked) {
      const dash = buildHomeDashboard(existing);
      return refreshMenuKeyboard(chatId, existing.language || 'en', dash.html);
    }

    if (rawCode) pendingLink.set(chatId, rawCode);

    return bot.sendMessage(chatId, t('en', 'chooseLanguage'), {
      reply_markup: languageKeyboard(),
    });
  });

  // /menu  — re-show the persistent keyboard
  bot.onText(/\/menu/, async (msg) => {
    const chatId = String(msg.chat.id);
    const model  = db.getModelByTelegramId(chatId);
    if (!model?.linked) {
      return bot.sendMessage(chatId, '❌ Use /start CLARK-XXXXXX to link your account first.');
    }
    const dash = buildHomeDashboard(model);
    return refreshMenuKeyboard(chatId, model.language || 'en', dash.html);
  });

  // Callback queries
  bot.on('callback_query', async (query) => {
    const data   = query.data;
    const chatId = String(query.message.chat.id);
    await bot.answerCallbackQuery(query.id);

    const model = db.getModelByTelegramId(chatId);
    const lang  = model?.language || 'en';

    // ── Initial language selection (linking flow) ───────────────────────
    if (data === 'lang_en' || data === 'lang_es') {
      const selectedLang = data === 'lang_es' ? 'es' : 'en';
      const pendingCode  = pendingLink.get(chatId);
      pendingLink.delete(chatId);

      if (pendingCode && !pendingCode.startsWith('__lang_')) {
        const m = db.getModelByLinkCode(pendingCode);
        if (!m) return bot.sendMessage(chatId, t(selectedLang, 'invalidCode'), { parse_mode: 'HTML' });
        if (m.linked) return bot.sendMessage(chatId, t(selectedLang, 'alreadyLinked'), { parse_mode: 'HTML' });

        db.linkModelTelegram(m.id, chatId);
        db.setModelLanguage(m.id, selectedLang);
        console.log(`[Telegram] Model "${m.name}" linked (lang=${selectedLang})`);

        const html = t(selectedLang, 'linked', m.name);
        return refreshMenuKeyboard(chatId, selectedLang, html);
      }

      pendingLink.set(chatId, `__lang_${selectedLang}`);
      return bot.sendMessage(chatId, t(selectedLang, 'sendCode'), { parse_mode: 'HTML' });
    }

    // ── Menu: language change ───────────────────────────────────────────
    if (data === 'menu_lang_en' || data === 'menu_lang_es') {
      if (!model?.linked) return;
      const newLang = data === 'menu_lang_es' ? 'es' : 'en';
      db.setModelLanguage(model.id, newLang);
      const isEs = newLang === 'es';
      const confirmation = isEs
        ? `✅ ¡Idioma cambiado a <b>Español</b>!`
        : `✅ Language changed to <b>English</b>!`;
      return refreshMenuKeyboard(chatId, newLang, confirmation);
    }

    // ── Idea completed ──────────────────────────────────────────────────
    if (data.startsWith('idea_complete_')) {
      const ideaId   = parseInt(data.replace('idea_complete_', ''), 10);
      const idea     = db.getIdea(ideaId);
      if (!idea || idea.status === 'completed') return;

      const completed = db.completeIdea(ideaId);
      if (completed.airtable_record_id) {
        markIdeaCompleted(completed.airtable_record_id, completed.type, completed.completed_at)
          .catch(err => console.error('[Airtable] markIdeaCompleted error:', err.message));
      }

      // Edit the original idea card to show it's done
      const info     = { reddit: '💡', reels: '🎬' }[completed.type] ?? '📋';
      const noteTag  = completed.notes ? `\n📝 ${completed.notes}` : '';
      const doneHtml = `✅ <b>¡Completada!</b>\n\n${info} ${completed.link}${noteTag}`;
      try {
        await bot.editMessageText(doneHtml, {
          chat_id    : query.message.chat.id,
          message_id : query.message.message_id,
          parse_mode : 'HTML',
          disable_web_page_preview: true,
        });
      } catch (_) {}

      // Also refresh the dashboard if it's showing that ideas type
      if (model) {
        const dash = buildIdeasDashboard(model, completed.type);
        await updateDashboard(chatId, lang, dash.html, dash.rows);
      }
      return;
    }

    // ── Ideas PDF download ──────────────────────────────────────────────
    if (data.startsWith('ideas_pdf_')) {
      if (!model) return;
      const type  = data.replace('ideas_pdf_', '');
      const ideas = db.getModelPendingIdeas(model.id).filter(i => i.type === type);
      const isEs  = lang === 'es';

      if (!ideas.length) {
        return bot.sendMessage(chatId, isEs ? '✅ No hay ideas pendientes.' : '✅ No pending ideas.', { parse_mode: 'HTML' });
      }
      try {
        const buf = await generatePendingIdeasPdf(ideas, model.name);
        await bot.sendDocument(
          chatId, buf,
          { caption: isEs ? `📋 <b>${ideas.length}</b> idea(s) pendiente(s).` : `📋 <b>${ideas.length}</b> pending idea(s).`, parse_mode: 'HTML' },
          { filename: `pendientes_${type}_${model.name.replace(/\s+/g, '_')}.pdf`, contentType: 'application/pdf' }
        );
      } catch (err) {
        console.error('[Telegram] PDF error:', err.message);
        await bot.sendMessage(chatId, '❌ Error generating PDF. Try again.', { parse_mode: 'HTML' });
      }
      return;
    }

    // ── Socials menu ────────────────────────────────────────────────────
    if (data === 'socials_menu') {
      if (!model) return;
      const dash = buildSocialsMenu(model);
      return updateDashboard(chatId, lang, dash.html, dash.rows);
    }

    if (data.startsWith('socials_')) {
      if (!model) return;
      const statKey = data.replace('socials_', '');
      const dash    = await buildSocialsStat(model, statKey);
      return updateDashboard(chatId, lang, dash.html, dash.rows);
    }

    // ── No-op (informational button) ───────────────────────────────────
    if (data === 'noop') return;

    // ── Customs: back to list ───────────────────────────────────────────
    if (data === 'custom_list') {
      if (!model) return;
      const dash = buildCustomsList(model);
      return updateDashboard(chatId, lang, dash.html, dash.rows);
    }

    // ── Customs: open ticket detail ─────────────────────────────────────
    if (data.startsWith('custom_open_')) {
      if (!model) return;
      const ticketId = parseInt(data.replace('custom_open_', ''), 10);
      const ticket   = db.getTicket(ticketId);
      if (!ticket || ticket.model_id !== model.id) return; // safety check
      const detail = buildTicketDetail(model, ticket);
      return updateDashboard(chatId, lang, detail.html, detail.rows);
    }

    // ── Ticket inline buttons (tg_action_ticketId) ──────────────────────
    const parts    = data.split('_');
    const action   = parts[1];
    const ticketId = parseInt(parts[2]);
    const tLang    = modelLang(ticketId) || 'en';

    if (action === 'accept') {
      pendingActions.set(chatId, { action: 'accept_days', ticketId });
      await bot.sendMessage(chatId, t(tLang, 'askDays'), { parse_mode: 'HTML' });
    } else if (action === 'deny') {
      pendingActions.set(chatId, { action: 'deny_reason', ticketId });
      await bot.sendMessage(chatId, t(tLang, 'askDenyReason'), { parse_mode: 'HTML' });
    } else if (action === 'question') {
      pendingActions.set(chatId, { action: 'ask_question', ticketId });
      await bot.sendMessage(chatId, t(tLang, 'askQuestion'), { parse_mode: 'HTML' });
    } else if (action === 'reply') {
      pendingActions.set(chatId, { action: 'reply', ticketId });
      await bot.sendMessage(chatId, t(tLang, 'askReply'), { parse_mode: 'HTML' });
    } else if (action === 'done') {
      await handleDone(chatId, ticketId);
      if (model) {
        const dash = buildCustomsList(model);
        await updateDashboard(chatId, lang, dash.html, dash.rows);
      }
    } else if (action === 'cancel') {
      pendingActions.set(chatId, { action: 'cancel_reason', ticketId });
      await bot.sendMessage(chatId, t(tLang, 'askCancelReason'), { parse_mode: 'HTML' });
    }
  });

  // Text messages — menu buttons, pending actions, code entry
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = String(msg.chat.id);
    const text   = msg.text.trim();
    const model  = db.getModelByTelegramId(chatId);
    const lang   = model?.language || 'en';

    // ── Pending ticket action ──────────────────────────────────────────
    const pending = pendingActions.get(chatId);
    if (pending) {
      pendingActions.delete(chatId);
      const { action, ticketId } = pending;
      const tLang = modelLang(ticketId) || 'en';

      if (action === 'accept_days') {
        const days = parseInt(text);
        if (isNaN(days) || days < 1) {
          await bot.sendMessage(chatId, t(tLang, 'invalidDays'), { parse_mode: 'HTML' });
          pendingActions.set(chatId, { action: 'accept_days', ticketId });
          return;
        }
        await handleAccept(chatId, ticketId, days);
      } else if (action === 'deny_reason') {
        await handleDeny(chatId, ticketId, text);
      } else if (action === 'ask_question') {
        await handleQuestion(chatId, ticketId, text);
      } else if (action === 'reply') {
        await handleModelReply(chatId, ticketId, text);
      } else if (action === 'cancel_reason') {
        await handleCancelByModel(chatId, ticketId, text);
      }

      // Refresh customs list after any ticket action
      if (model) {
        const dash = buildCustomsList(model);
        await updateDashboard(chatId, lang, dash.html, dash.rows);
      }
      return;
    }

    // ── Menu buttons ───────────────────────────────────────────────────
    if (model?.linked) {
      const m = MENU[lang] ?? MENU.en;

      if (text === m.customs) {
        const dash = buildCustomsList(model);
        return updateDashboard(chatId, lang, dash.html, dash.rows);
      }
      if (text === m.reels) {
        const dash = buildIdeasDashboard(model, 'reels');
        return updateDashboard(chatId, lang, dash.html, dash.rows);
      }
      if (text === m.reddit) {
        const dash = buildIdeasDashboard(model, 'reddit');
        return updateDashboard(chatId, lang, dash.html, dash.rows);
      }
      if (text === m.socials) {
        const dash = buildSocialsMenu(model);
        return updateDashboard(chatId, lang, dash.html, dash.rows);
      }
      if (text === m.lang) {
        const dash = buildLanguageDashboard(lang);
        return updateDashboard(chatId, lang, dash.html, dash.rows);
      }
    }

    // ── Pending link flow: code entry via text ─────────────────────────
    const pendingRaw = pendingLink.get(chatId);
    if (pendingRaw?.startsWith('__lang_')) {
      const selectedLang = pendingRaw.replace('__lang_', '');
      const rawCode = text.toUpperCase().startsWith('CLARK-') ? text.toUpperCase().slice(6) : text.toUpperCase();
      pendingLink.delete(chatId);

      const m = db.getModelByLinkCode(rawCode);
      if (!m) return bot.sendMessage(chatId, t(selectedLang, 'invalidCode'), { parse_mode: 'HTML' });
      if (m.linked) return bot.sendMessage(chatId, t(selectedLang, 'alreadyLinked'), { parse_mode: 'HTML' });

      db.linkModelTelegram(m.id, chatId);
      db.setModelLanguage(m.id, selectedLang);
      console.log(`[Telegram] Model "${m.name}" linked via text (lang=${selectedLang})`);

      return refreshMenuKeyboard(chatId, selectedLang, t(selectedLang, 'linked', m.name));
    }
  });

  bot.on('polling_error', (err) => {
    console.error('[Telegram] Polling error:', err.message);
    if (err.message?.includes('409')) {
      console.warn('[Telegram] 409 Conflict — retrying in 15s...');
      bot.stopPolling().catch(() => {});
      setTimeout(() => bot.startPolling().catch(e => console.error('[Telegram] Restart error:', e.message)), 15000);
    }
  });

  console.log('[Telegram] Bot started with persistent menu.');
  return bot;
}

module.exports = { startTelegramBot, sendRequestToModel, forwardToModel, notifyModelCancelledByChatter, sendIdeaToModel };
