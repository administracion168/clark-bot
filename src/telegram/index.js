const TelegramBot = require('node-telegram-bot-api');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');
const { translate } = require('../utils/translate');
const { markIdeaCompleted } = require('../utils/airtable');
const { generatePendingIdeasPdf } = require('../utils/pdfGenerator');

let bot = null;
let discordClient = null;

// In-memory state
const pendingActions = new Map(); // chatId → { action, ticketId }
const pendingLink    = new Map(); // chatId → pendingCode  (language not yet chosen)

// ── Translations ──────────────────────────────────────────────────────────────

const T = {
  en: {
    chooseLanguage : '🌐 Choose your language / Elige tu idioma:',
    sendCode       : '✅ Language set to English!\n\nNow send your linking code:\n`/start CLARK-XXXXXX`',
    invalidCode    : '❌ Invalid code. Ask your admin for a new one.',
    alreadyLinked  : '✅ This account is already linked!',
    linked         : (name) => `✅ Linked as *${name}*\\! You'll receive custom requests here\\.`,
    noCode         : 'Hi\\! Send your linking code to connect your account\\.\nExample: `/start CLARK\\-1234`',
    newRequest     : (n) => `📋 *NEW REQUEST \\#${n}*`,
    chatterLabel   : 'Support',
    priorityUrgent : '🔴 URGENT',
    priorityNormal : '🟢 Normal',
    fieldType      : 'Type',
    fieldPriority  : 'Priority',
    fieldPrice     : 'Price',
    fieldEstimate  : 'Client estimate',
    fieldDetails   : '📝 *Details:*',
    notSpecified   : 'Not specified',
    btnAccept      : '✅ Accept',
    btnDeny        : '❌ Deny',
    btnQuestion    : '💬 Ask a question',
    btnReply       : '💬 Reply',
    btnDone        : '📦 Mark as Delivered',
    btnCancel      : '🚫 Cancel Request',
    askDays        : '✅ How many days do you estimate for delivery? (send a number)',
    askDenyReason  : '❌ What is the reason for denying this request?',
    askQuestion    : '💬 What is your question for the chatter?',
    askReply       : '💬 Type your message:',
    askCancelReason: '🚫 Why are you cancelling this request?',
    invalidDays    : '❌ Please send a valid number. Try again.',
    accepted       : (days) => `✅ Accepted! Estimated delivery: ${days} day(s).\n\nUse the buttons below to reply or mark as delivered.`,
    denied         : '❌ Request denied. The chatter has been notified.',
    questionSent   : '✅ Question sent to the chatter.',
    messageSent    : '✅ Message sent.',
    delivered      : '✅ Marked as delivered! Waiting for chatter confirmation.',
    cancelled      : '🚫 Request cancelled.',
    supportLabel   : '💬 *Support:*',
  },
  es: {
    chooseLanguage : '🌐 Choose your language / Elige tu idioma:',
    sendCode       : '✅ ¡Idioma configurado en Español!\n\nAhora envía tu código de vinculación:\n`/start CLARK-XXXXXX`',
    invalidCode    : '❌ Código inválido. Pide un nuevo código a tu administrador.',
    alreadyLinked  : '✅ ¡Esta cuenta ya está vinculada!',
    linked         : (name) => `✅ Vinculada como *${name}*\\! Recibirás solicitudes de contenido aquí\\.`,
    noCode         : '¡Hola\\! Envía tu código de vinculación para conectar tu cuenta\\.\nEjemplo: `/start CLARK\\-1234`',
    newRequest     : (n) => `📋 *NUEVA SOLICITUD \\#${n}*`,
    chatterLabel   : 'Soporte',
    priorityUrgent : '🔴 URGENTE',
    priorityNormal : '🟢 Normal',
    fieldType      : 'Tipo',
    fieldPriority  : 'Prioridad',
    fieldPrice     : 'Precio',
    fieldEstimate  : 'Estimado del cliente',
    fieldDetails   : '📝 *Detalles:*',
    notSpecified   : 'No especificado',
    btnAccept      : '✅ Aceptar',
    btnDeny        : '❌ Rechazar',
    btnQuestion    : '💬 Hacer una pregunta',
    btnReply       : '💬 Responder',
    btnDone        : '📦 Marcar como entregado',
    btnCancel      : '🚫 Cancelar solicitud',
    askDays        : '✅ ¿En cuántos días estimas la entrega? (envía un número)',
    askDenyReason  : '❌ ¿Cuál es el motivo del rechazo?',
    askQuestion    : '💬 ¿Cuál es tu pregunta para el equipo de soporte?',
    askReply       : '💬 Escribe tu mensaje:',
    askCancelReason: '🚫 ¿Motivo de la cancelación?',
    invalidDays    : '❌ Por favor envía un número válido. Inténtalo de nuevo.',
    accepted       : (days) => `✅ ¡Aceptado! Entrega estimada: ${days} día(s).\n\nUsa los botones para responder o marcar como entregado.`,
    denied         : '❌ Solicitud rechazada. El equipo de soporte ha sido notificado.',
    questionSent   : '✅ Pregunta enviada al equipo de soporte.',
    messageSent    : '✅ Mensaje enviado.',
    delivered      : '✅ ¡Marcado como entregado! Esperando confirmación.',
    cancelled      : '🚫 Solicitud cancelada.',
    supportLabel   : '💬 *Soporte:*',
  },
};

function t(lang, key, ...args) {
  const l = T[lang] ?? T.en;
  const val = l[key] ?? T.en[key];
  return typeof val === 'function' ? val(...args) : val;
}

// ── Keyboards ─────────────────────────────────────────────────────────────────

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

function typeLabel(type, lang) {
  const en = { video: '🎬 Custom Video', photo: '📸 Custom Photo', audio: '🎙️ Custom Audio', question: '❓ Question', other: '📋 Other' };
  const es = { video: '🎬 Video personalizado', photo: '📸 Foto personalizada', audio: '🎙️ Audio personalizado', question: '❓ Pregunta', other: '📋 Otro' };
  return (lang === 'es' ? es : en)[type] ?? type;
}

// Escape all special MarkdownV2 characters in user-provided text
function escapeMd(text) {
  if (!text) return '';
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ── Send request to model ─────────────────────────────────────────────────────

async function sendRequestToModel(ticket, model) {
  if (!bot || !model.telegram_chat_id) return;

  const lang        = model.language || 'en';
  const priorityTag = ticket.priority === 'urgent' ? t(lang, 'priorityUrgent') : t(lang, 'priorityNormal');
  const priceStr    = ticket.price ? `$${ticket.price}` : t(lang, 'notSpecified');
  const estStr      = ticket.client_estimated_time ?? t(lang, 'notSpecified');

  // Translate description and estimate to model's language if needed
  const descriptionRaw = lang === 'es'
    ? await translate(ticket.description, 'es')
    : ticket.description;
  const estimateRaw = (lang === 'es' && ticket.client_estimated_time)
    ? await translate(ticket.client_estimated_time, 'es')
    : estStr;

  // Escape all user-provided content for MarkdownV2
  const description     = escapeMd(descriptionRaw);
  const estimateDisplay = escapeMd(estimateRaw);
  const priceSafe       = escapeMd(priceStr);

  const text =
    `${t(lang, 'newRequest', ticket.ticket_number)}\n\n` +
    `👤 ${t(lang, 'chatterLabel')}\n` +
    `📁 ${t(lang, 'fieldType')}: ${typeLabel(ticket.type, lang)}\n` +
    `⚡ ${t(lang, 'fieldPriority')}: ${priorityTag}\n` +
    `💰 ${t(lang, 'fieldPrice')}: ${priceSafe}\n` +
    `⏱ ${t(lang, 'fieldEstimate')}: ${estimateDisplay}\n\n` +
    `${t(lang, 'fieldDetails')}\n${description}`;

  try {
    const msg = await bot.sendMessage(model.telegram_chat_id, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: requestKeyboard(ticket.id, lang),
    });
    db.updateTicketTelegram(ticket.id, String(msg.message_id));
  } catch (err) {
    console.error('[Telegram] Failed to send request to model:', err.message);
  }
}

// ── Forward chatter message to model ─────────────────────────────────────────

async function forwardToModel(ticketId, _chatterName, message) {
  if (!bot) return;
  const ticket = db.getTicket(ticketId);
  const model  = db.getModel(ticket.model_id);
  if (!model?.telegram_chat_id) return;

  const lang = model.language || 'en';
  // Translate chatter message to model's language if needed
  const translated = lang === 'es' ? await translate(message, 'es') : message;
  // Escape special MarkdownV2 characters in the message
  const escaped = translated.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  const text = `${t(lang, 'supportLabel')} ${escaped}`;

  await bot.sendMessage(model.telegram_chat_id, text, {
    parse_mode: 'MarkdownV2',
    reply_markup: replyKeyboard(ticketId, lang),
  });
}

// ── Post to Discord ticket channel ────────────────────────────────────────────

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

function modelLang(ticketId) {
  const ticket = db.getTicket(ticketId);
  const model  = ticket ? db.getModel(ticket.model_id) : null;
  return model?.language || 'en';
}

// ── Handle accept ─────────────────────────────────────────────────────────────

async function handleAccept(chatId, ticketId, days) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang = modelLang(ticketId);

  db.updateTicketStatus(ticketId, 'accepted', { modelEstimatedDays: days });
  db.addTicketMessage(ticketId, 'system', 'Clark', `✅ Accepted — estimated delivery: ${days} day(s)`);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`✅ Request #${ticket.ticket_number} Accepted`)
    .addFields({ name: 'Estimated delivery', value: `${days} day(s)` })
    .setTimestamp();

  await postToTicketChannel(ticketId, embed);
  await bot.sendMessage(chatId, t(lang, 'accepted', days), { reply_markup: replyKeyboard(ticketId, lang) });
}

// ── Handle deny ───────────────────────────────────────────────────────────────

async function handleDeny(chatId, ticketId, reason) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang = modelLang(ticketId);

  db.updateTicketStatus(ticketId, 'denied', { denyReason: reason });
  db.addTicketMessage(ticketId, 'system', 'Clark', `❌ Denied — reason: ${reason}`);

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`❌ Request #${ticket.ticket_number} Denied`)
    .addFields({ name: 'Reason', value: reason })
    .setTimestamp();

  await postToTicketChannel(ticketId, embed);
  await bot.sendMessage(chatId, t(lang, 'denied'));
}

// ── Handle question from model ────────────────────────────────────────────────

async function handleQuestion(chatId, ticketId, question) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang = modelLang(ticketId);

  db.addTicketMessage(ticketId, 'model', 'Model', question);

  // Translate model's question to English for Discord
  const questionForDiscord = lang === 'es' ? await translate(question, 'en') : question;

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(`💬 Model has a question — #${ticket.ticket_number}`)
    .setDescription(questionForDiscord)
    .setTimestamp();

  await postToTicketChannel(ticketId, embed);
  await bot.sendMessage(chatId, t(lang, 'questionSent'), { reply_markup: replyKeyboard(ticketId, lang) });
}

// ── Handle reply from model ───────────────────────────────────────────────────

async function handleModelReply(chatId, ticketId, message) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang  = modelLang(ticketId);
  const model = db.getModel(ticket.model_id);

  db.addTicketMessage(ticketId, 'model', model?.name ?? 'Model', message);

  // Translate model's reply to English for Discord
  const messageForDiscord = lang === 'es' ? await translate(message, 'en') : message;

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setAuthor({ name: `${model?.name ?? 'Model'} — Reply` })
    .setDescription(messageForDiscord)
    .setTimestamp();

  await postToTicketChannel(ticketId, embed);
  await bot.sendMessage(chatId, t(lang, 'messageSent'), { reply_markup: replyKeyboard(ticketId, lang) });
}

// ── Handle done ───────────────────────────────────────────────────────────────

async function handleDone(chatId, ticketId) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang = modelLang(ticketId);

  db.updateTicketStatus(ticketId, 'delivered');
  db.addTicketMessage(ticketId, 'system', 'Clark', '📦 Model marked as delivered.');

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`📦 Content Delivered — #${ticket.ticket_number}`)
    .setDescription('The model has marked this request as delivered. Please confirm receipt.')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`req_received_${ticketId}`)
      .setLabel('✅ Confirm Received')
      .setStyle(ButtonStyle.Success)
  );

  await postToTicketChannel(ticketId, embed, [row]);
  await bot.sendMessage(chatId, t(lang, 'delivered'));
}

// ── Handle cancel by model ────────────────────────────────────────────────────

async function handleCancelByModel(chatId, ticketId, reason) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return bot.sendMessage(chatId, '❌ Ticket not found.');
  const lang = modelLang(ticketId);

  db.updateTicketStatus(ticketId, 'cancelled');
  db.addTicketMessage(ticketId, 'system', 'Clark', `🚫 Cancelled by model — reason: ${reason}`);

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle(`🚫 Request #${ticket.ticket_number} Cancelled by Model`)
    .addFields({ name: 'Reason', value: reason })
    .setTimestamp();

  await postToTicketChannel(ticketId, embed);
  await bot.sendMessage(chatId, t(lang, 'cancelled'));
}

// ── Send a single idea to model via Telegram ──────────────────────────────────

async function sendIdeaToModel(idea, model) {
  if (!bot || !model.telegram_chat_id) return null;

  const typeInfo = {
    reddit: { emoji: '💡', label: 'Reddit' },
    reels:  { emoji: '🎬', label: 'Instagram Reels' },
  };
  const info = typeInfo[idea.type] ?? typeInfo.reels;

  const notesSection = idea.notes
    ? `\n\n📝 <b>Notas:</b>\n${idea.notes}`
    : '';

  const text =
    `${info.emoji} <b>Nueva Idea — ${info.label}</b>\n\n` +
    `🔗 <b>Link:</b> ${idea.link}` +
    notesSection;

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Marcar como completada', callback_data: `idea_complete_${idea.id}` },
    ]],
  };

  try {
    const msg = await bot.sendMessage(model.telegram_chat_id, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });
    return msg.message_id;
  } catch (err) {
    console.error('[Telegram] Failed to send idea to model:', err.message);
    return null;
  }
}

// ── Start bot ─────────────────────────────────────────────────────────────────

function startTelegramBot(client) {
  discordClient = client;

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN not set — ticket system disabled.');
    return null;
  }

  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: {
      interval: 2000,
      autoStart: true,
      params: { timeout: 10 },
    },
  });

  // /changelanguagespanish  — switch to Spanish
  bot.onText(/\/changelanguagespanish/, async (msg) => {
    const chatId = String(msg.chat.id);
    const model  = db.getModelByTelegramId(chatId);
    if (!model?.linked) {
      return bot.sendMessage(chatId, '❌ Your account is not linked yet\\. Use `/start CLARK\\-XXXXXX` to link it\\.', { parse_mode: 'MarkdownV2' });
    }
    db.setModelLanguage(model.id, 'es');
    return bot.sendMessage(chatId, '✅ ¡Idioma cambiado a *Español*\\! A partir de ahora recibirás todas las solicitudes en español\\.', { parse_mode: 'MarkdownV2' });
  });

  // /changelanguageenglish  — switch to English
  bot.onText(/\/changelanguageenglish/, async (msg) => {
    const chatId = String(msg.chat.id);
    const model  = db.getModelByTelegramId(chatId);
    if (!model?.linked) {
      return bot.sendMessage(chatId, '❌ Your account is not linked yet\\. Use `/start CLARK\\-XXXXXX` to link it\\.', { parse_mode: 'MarkdownV2' });
    }
    db.setModelLanguage(model.id, 'en');
    return bot.sendMessage(chatId, '✅ Language changed to *English*\\! You will now receive all requests in English\\.', { parse_mode: 'MarkdownV2' });
  });

  // /pendientes  — send PDF of pending ideas
  bot.onText(/\/pendientes/, async (msg) => {
    const chatId = String(msg.chat.id);
    const model  = db.getModelByTelegramId(chatId);

    if (!model?.linked) {
      return bot.sendMessage(chatId, '❌ Tu cuenta no está vinculada. Usa /start CLARK-XXXXXX para conectarla.');
    }

    const ideas = db.getModelPendingIdeas(model.id);
    if (!ideas.length) {
      return bot.sendMessage(chatId, '✅ No tienes ideas pendientes por ahora. ¡Todo al día!');
    }

    try {
      const pdfBuffer = await generatePendingIdeasPdf(ideas, model.name);
      await bot.sendDocument(
        chatId,
        pdfBuffer,
        { caption: `📋 Tienes <b>${ideas.length}</b> idea(s) pendiente(s).`, parse_mode: 'HTML' },
        { filename: `pendientes_${model.name.replace(/\s+/g, '_')}.pdf`, contentType: 'application/pdf' },
      );
    } catch (err) {
      console.error('[Telegram] /pendientes PDF error:', err.message);
      await bot.sendMessage(chatId, '❌ Error generando el PDF. Inténtalo de nuevo.');
    }
  });

  // /start CLARK-CODE  or  /start  (no code)
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId  = String(msg.chat.id);
    const rawArg  = (match[1] ?? '').trim().toUpperCase();
    const rawCode = rawArg.startsWith('CLARK-') ? rawArg.slice(6) : rawArg;

    // If already linked, greet
    const existing = db.getModelByTelegramId(chatId);
    if (existing?.linked) {
      return bot.sendMessage(chatId, t(existing.language || 'en', 'alreadyLinked'));
    }

    // Show language selector. If they passed a code, store it.
    if (rawCode) pendingLink.set(chatId, rawCode);

    return bot.sendMessage(chatId, t('en', 'chooseLanguage'), {
      reply_markup: languageKeyboard(),
    });
  });

  // Callback queries (button taps)
  bot.on('callback_query', async (query) => {
    const data   = query.data;
    const chatId = String(query.message.chat.id);
    await bot.answerCallbackQuery(query.id);

    // ── Language selection ──────────────────────────────────────────────────
    if (data === 'lang_en' || data === 'lang_es') {
      const lang = data === 'lang_es' ? 'es' : 'en';

      // Check if we have a pending code for this chat
      const pendingCode = pendingLink.get(chatId);
      pendingLink.delete(chatId);

      if (pendingCode) {
        // Complete the linking
        const model = db.getModelByLinkCode(pendingCode);
        if (!model) return bot.sendMessage(chatId, t(lang, 'invalidCode'));
        if (model.linked) return bot.sendMessage(chatId, t(lang, 'alreadyLinked'));

        db.linkModelTelegram(model.id, chatId);
        db.setModelLanguage(model.id, lang);
        console.log(`[Telegram] Model "${model.name}" linked (lang=${lang}) to chat ${chatId}`);
        return bot.sendMessage(chatId, t(lang, 'linked', model.name), { parse_mode: 'MarkdownV2' });
      }

      // No pending code — store language in pending and ask for code
      pendingLink.set(chatId, `__lang_${lang}`);
      return bot.sendMessage(chatId, t(lang, 'sendCode'), { parse_mode: 'Markdown' });
    }

    // ── Idea complete callback ──────────────────────────────────────────────
    if (data.startsWith('idea_complete_')) {
      const ideaId = parseInt(data.replace('idea_complete_', ''), 10);
      const idea   = db.getIdea(ideaId);

      if (!idea || idea.status === 'completed') return; // already done

      const completed = db.completeIdea(ideaId);

      // Update Airtable async (fire-and-forget)
      if (completed.airtable_record_id) {
        markIdeaCompleted(completed.airtable_record_id, completed.completed_at)
          .catch(err => console.error('[Airtable] Failed to mark idea completed:', err.message));
      }

      // Edit the Telegram message to show it's done
      const typeInfo = {
        reddit: { emoji: '💡', label: 'Reddit' },
        reels:  { emoji: '🎬', label: 'Instagram Reels' },
      };
      const info        = typeInfo[completed.type] ?? typeInfo.reels;
      const notesLine   = completed.notes ? `\n📝 <b>Notas:</b> ${completed.notes}` : '';
      const doneText    =
        `✅ <b>¡Idea completada!</b>\n\n` +
        `${info.emoji} <b>${info.label}</b>\n` +
        `🔗 ${completed.link}` +
        notesLine;

      try {
        await bot.editMessageText(doneText, {
          chat_id    : query.message.chat.id,
          message_id : query.message.message_id,
          parse_mode : 'HTML',
          disable_web_page_preview: true,
        });
      } catch (e) {
        console.error('[Telegram] Failed to edit idea message:', e.message);
      }
      return;
    }

    // ── Ticket callbacks ────────────────────────────────────────────────────
    // data format: tg_action_ticketId
    const parts    = data.split('_');
    const action   = parts[1];
    const ticketId = parseInt(parts[2]);
    const lang     = modelLang(ticketId) || 'en';

    if (action === 'accept') {
      pendingActions.set(chatId, { action: 'accept_days', ticketId });
      await bot.sendMessage(chatId, t(lang, 'askDays'));

    } else if (action === 'deny') {
      pendingActions.set(chatId, { action: 'deny_reason', ticketId });
      await bot.sendMessage(chatId, t(lang, 'askDenyReason'));

    } else if (action === 'question') {
      pendingActions.set(chatId, { action: 'ask_question', ticketId });
      await bot.sendMessage(chatId, t(lang, 'askQuestion'));

    } else if (action === 'reply') {
      pendingActions.set(chatId, { action: 'reply', ticketId });
      await bot.sendMessage(chatId, t(lang, 'askReply'));

    } else if (action === 'done') {
      await handleDone(chatId, ticketId);

    } else if (action === 'cancel') {
      pendingActions.set(chatId, { action: 'cancel_reason', ticketId });
      await bot.sendMessage(chatId, t(lang, 'askCancelReason'));
    }
  });

  // Text messages — handle pending actions + code entry
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = String(msg.chat.id);
    const text   = msg.text.trim();

    // Pending action for an open ticket
    const pending = pendingActions.get(chatId);
    if (pending) {
      pendingActions.delete(chatId);
      const { action, ticketId } = pending;
      const lang = modelLang(ticketId) || 'en';

      if (action === 'accept_days') {
        const days = parseInt(text);
        if (isNaN(days) || days < 1) {
          await bot.sendMessage(chatId, t(lang, 'invalidDays'));
          pendingActions.set(chatId, { action: 'accept_days', ticketId });
          return;
        }
        return handleAccept(chatId, ticketId, days);

      } else if (action === 'deny_reason') {
        return handleDeny(chatId, ticketId, text);

      } else if (action === 'ask_question') {
        return handleQuestion(chatId, ticketId, text);

      } else if (action === 'reply') {
        return handleModelReply(chatId, ticketId, text);

      } else if (action === 'cancel_reason') {
        return handleCancelByModel(chatId, ticketId, text);
      }
      return;
    }

    // Pending language+code flow: user typed the code manually
    const pendingRaw = pendingLink.get(chatId);
    if (pendingRaw && pendingRaw.startsWith('__lang_')) {
      const lang    = pendingRaw.replace('__lang_', '');
      const rawCode = text.toUpperCase().startsWith('CLARK-') ? text.toUpperCase().slice(6) : text.toUpperCase();
      pendingLink.delete(chatId);

      const model = db.getModelByLinkCode(rawCode);
      if (!model) return bot.sendMessage(chatId, t(lang, 'invalidCode'));
      if (model.linked) return bot.sendMessage(chatId, t(lang, 'alreadyLinked'));

      db.linkModelTelegram(model.id, chatId);
      db.setModelLanguage(model.id, lang);
      console.log(`[Telegram] Model "${model.name}" linked via text (lang=${lang}) to chat ${chatId}`);
      return bot.sendMessage(chatId, t(lang, 'linked', model.name), { parse_mode: 'MarkdownV2' });
    }
  });

  bot.on('polling_error', (err) => {
    console.error('[Telegram] Polling error:', err.message);
    // 409 Conflict = another instance still running (Railway rolling restart).
    // Stop polling and retry after 15s so only one instance is active.
    if (err.message && err.message.includes('409')) {
      console.warn('[Telegram] 409 Conflict — another instance detected. Retrying in 15s...');
      bot.stopPolling().catch(() => {});
      setTimeout(() => {
        bot.startPolling().catch(e => console.error('[Telegram] Failed to restart polling:', e.message));
      }, 15000);
    }
  });

  console.log('[Telegram] Bot started.');
  return bot;
}

// ── Notify model that chatter cancelled the request ───────────────────────────

async function notifyModelCancelledByChatter(ticketId, reason) {
  if (!bot) return;
  const ticket = db.getTicket(ticketId);
  const model  = ticket ? db.getModel(ticket.model_id) : null;
  if (!model?.telegram_chat_id) return;

  const lang    = model.language || 'en';
  const escaped = reason.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

  const msgs = {
    en: `🚫 *Request \\#${ticket.ticket_number} was cancelled by Support\\.*\n\n*Reason:* ${escaped}`,
    es: `🚫 *La solicitud \\#${ticket.ticket_number} fue cancelada por Soporte\\.*\n\n*Motivo:* ${escaped}`,
  };

  try {
    await bot.sendMessage(model.telegram_chat_id, msgs[lang] ?? msgs.en, { parse_mode: 'MarkdownV2' });
  } catch (err) {
    console.error('[Telegram] Failed to notify model of chatter cancellation:', err.message);
  }
}

module.exports = { startTelegramBot, sendRequestToModel, forwardToModel, notifyModelCancelledByChatter, sendIdeaToModel };

// ── Notify model of new content ideas ────────────────────────────────────────

async function notifyModelNewIdeas(model, type) {
  if (!bot) throw new Error('Telegram bot not started');
  if (!model?.telegram_chat_id) throw new Error('Model has no Telegram linked');

  const lang = model.language || 'en';

  const msgs = {
    reddit: {
      en: `💡 *New Reddit ideas are ready for you\\!*\n\nHead over to *Notion* and check your new content ideas\\.`,
      es: `💡 *¡Tienes nuevas ideas de Reddit esperándote\\!*\n\nEntra a *Notion* y revisa las nuevas ideas de contenido para ti\\.`,
    },
    reels: {
      en: `🎬 *New Instagram Reels ideas are ready for you\\!*\n\nHead over to *Notion* and check your new content ideas\\.`,
      es: `🎬 *¡Tienes nuevas ideas de Reels de Instagram esperándote\\!*\n\nEntra a *Notion* y revisa las nuevas ideas de contenido para ti\\.`,
    },
  };

  const msg = (msgs[type] ?? msgs.reels)[lang] ?? (msgs[type] ?? msgs.reels).en;
  await bot.sendMessage(model.telegram_chat_id, msg, { parse_mode: 'MarkdownV2' });
}
