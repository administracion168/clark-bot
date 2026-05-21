# CLARK BOT — Project Notes

> Last updated: May 2026. Use this file at the start of every new Claude session to restore full context.

---

## Overview

Clark Bot is a Discord.js v14 bot for managing a content creation team ("La Isla"). It handles:
- Employee clock-in / clock-out with shift logging
- Virtual phone number requests for Instagram account creation (via GrizzlySMS and 5sim)
- A ticket/request system between chatters (Discord) and models (Telegram)
- Weekly payroll reports
- Content ideas (Reddit & Reels) posted to models via Notion + Telegram
- Department management (admin commands)

**Deployed on:** Railway (auto-deploys on git push to `main`)  
**Language:** Node.js (CommonJS)  
**Discord library:** discord.js v14  
**Database:** better-sqlite3 (SQLite, file at `data/clark.db` inside Railway's volume)

---

## Deployment

- **Platform:** Railway — https://railway.app
- **Repo:** GitHub (Railway watches `main` branch and auto-deploys on push)
- **Environment variables:** Set in Railway dashboard → Project → Variables
- **Database persistence:** Railway volume mounted at the project root; `data/clark.db` persists across deploys

### Git workflow (important)
The local workspace repo (`/Users/samuel/Documents/La Isla documentos/CLARK BOT`) sometimes gets a stale `.git/index.lock` that blocks pushes. When that happens:
```bash
# Fix: clone fresh, copy files, push from clean clone
git clone git@github.com:YOUR_REPO/clark-bot.git /tmp/clark-bot-push
cp <modified files> /tmp/clark-bot-push/src/...
cd /tmp/clark-bot-push && git add . && git commit -m "..." && git push
```

---

## Environment Variables (Railway)

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Bot token from Discord Developer Portal |
| `CLIENT_ID` | ✅ | Application Client ID |
| `GUILD_ID` | ✅ | Discord server ID |
| `LOG_CHANNEL_ID` | ✅ | Default/fallback log channel for clock-in/out embeds |
| `REPORT_CHANNEL_ID` | ✅ | Channel where weekly payroll reports are posted |
| `ADMIN_ROLE_ID` | optional | Discord role ID that gets admin command access |
| `CHATTER_LOG_CHANNEL_ID` | optional | Dedicated log channel for Chatter dept (overrides LOG_CHANNEL_ID) |
| `MARKETING_LOG_CHANNEL_ID` | optional | Dedicated log channel for Marketing dept |
| `TELEGRAM_BOT_TOKEN` | optional | Telegram bot token — disables ticket system if missing |
| `GRIZZLY_API_KEY` | optional | GrizzlySMS API key for Service 1 phone numbers |
| `FIVESIM_API_KEY` | optional | 5sim JWT bearer token for Service 2 phone numbers |
| `OPENAI_API_KEY` | optional | Used by content ideas feature (Reddit/Reels generation) |
| `NOTION_API_KEY` | optional | Notion integration token for content ideas |
| `INSTAGRAM_LOG_CHANNEL_ID` | optional | Channel where getnumber logs are posted (set via `/setupinstagram`) |

---

## File Structure

```
CLARK BOT/
├── src/
│   ├── index.js                        # Entry point — loads commands/events, starts client
│   ├── database.js                     # All DB access (better-sqlite3), table schemas, migrations
│   ├── deploy-commands.js              # Run once to register slash commands with Discord API
│   │
│   ├── commands/
│   │   ├── clockin.js                  # /clockin — starts shift, posts public embed to log channel
│   │   ├── clockout.js                 # /clockout — ends shift via modal, posts embed to log channel
│   │   ├── getnumber.js                # /getnumber — core SMS number flow (GrizzlySMS + 5sim)
│   │   ├── mystats.js                  # /mystats — shows employee's own shift history/stats
│   │   ├── weekreport.js               # /weekreport — admin: generate payroll report manually
│   │   ├── history.js                  # /history — admin: view any employee's shift history
│   │   ├── setrole.js                  # /setrole — admin: assign dept + salary to an employee
│   │   ├── setsalary.js                # /setsalary — admin: update employee weekly salary
│   │   ├── newdepartment.js            # /newdepartment — admin: create new department
│   │   ├── deletedepartment.js         # /deletedepartment — admin: remove a department
│   │   ├── setupinstagram.js           # /setupinstagram — admin: set instagram log channel
│   │   ├── setupactiveworkers.js       # /setupactiveworkers — admin: set live active-workers embed
│   │   ├── setupmodel.js               # /setupmodel — admin: register a model (creates Telegram link code)
│   │   ├── unlinkmodel.js              # /unlinkmodel — admin: disconnect a model from Telegram
│   │   ├── pinlogs.js                  # /pinlogs — admin: pin log embed in a channel
│   │   ├── postannouncement.js         # /postannouncement — admin: post formatted announcement
│   │   ├── postrequests.js             # /postrequests — admin: post the "New Request" button embed
│   │   ├── postredditideas.js          # /postredditideas — admin: generate & post Reddit content ideas
│   │   ├── postreelsideas.js           # /postreelsideas — admin: generate & post Reels content ideas
│   │   ├── requests.js                 # /requests — admin: view/manage all tickets
│   │   ├── ticket.js                   # Ticket creation slash command
│   │   ├── help.js                     # /help — employee help
│   │   └── helpadmin.js                # /helpadmin — admin help
│   │
│   ├── handlers/
│   │   ├── getnumberHandler.js         # Handles all button interactions for the phone number flow
│   │   ├── ticketHandler.js            # Handles all button/modal interactions for ticket system
│   │   └── contentIdeasHandler.js      # Handles button interactions for content ideas
│   │
│   ├── events/
│   │   ├── interactionCreate.js        # Routes all Discord interactions to the right handler
│   │   └── ready.js                    # On bot ready: starts scheduler + Telegram bot
│   │
│   ├── utils/
│   │   ├── roles.js                    # resolveClarkRole(), isAdmin(), getLogChannelId()
│   │   ├── activationStore.js          # In-memory Map for active SMS phone number sessions
│   │   ├── scheduler.js                # Cron jobs: auto-close shifts, weekly report, active workers
│   │   ├── report.js                   # Builds and sends weekly payroll report embed
│   │   ├── time.js                     # toEST(), toESTFull(), formatDuration()
│   │   └── translate.js                # OpenAI-powered translation (EN↔ES for Telegram messages)
│   │
│   └── telegram/
│       └── index.js                    # Full Telegram bot (node-telegram-bot-api) for ticket system
│
├── data/
│   └── clark.db                        # SQLite database (auto-created, persists in Railway volume)
│
├── .env                                # Local env vars (not committed)
├── .env.example                        # Template for env vars
├── package.json
└── NOTES.md                            # ← This file
```

---

## Database Schema

### `employees`
| Column | Type | Description |
|---|---|---|
| `discord_id` | TEXT PK | Discord user ID |
| `username` | TEXT | Discord username |
| `role` | TEXT | Department name (e.g. 'chatter', 'instagram') |
| `weekly_salary` | REAL | Weekly salary (null = hours only) |

### `shifts`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto increment |
| `discord_id` | TEXT | Employee Discord ID |
| `clock_in` | DATETIME | ISO string |
| `clock_out` | DATETIME | ISO string (null = open shift) |
| `duration_minutes` | INTEGER | Computed on clockout |
| `summary` | TEXT | Shift summary from modal |
| `net_sales` | REAL | Only for commission depts |
| `auto_closed` | INTEGER | 1 if shift was auto-closed by scheduler |

### `departments`
| Column | Type | Description |
|---|---|---|
| `name` | TEXT PK | Lowercase key (e.g. 'instagram', 'chatter') |
| `display_name` | TEXT | Human-readable label |
| `pay_type` | TEXT | `'hours_only'` or `'commission'` |
| `log_channel_id` | TEXT | Discord channel for shift logs |
| `chat_channel_id` | TEXT | Department chat channel |
| `info_channel_id` | TEXT | Info channel |
| `role_id` | TEXT | Discord role ID for this dept |

**Seeded departments (hardcoded in database.js):**
- `chatter` — pay_type: commission
- `reddit` — pay_type: hours_only, log_channel_id: `1499560679802404924`
- `instagram` — pay_type: hours_only, role_id: `1502096268271554590`

### `models`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto increment |
| `name` | TEXT | Model name |
| `role_id` | TEXT UNIQUE | Discord role ID |
| `telegram_chat_id` | TEXT | Telegram chat ID (set after linking) |
| `link_code` | TEXT UNIQUE | One-time code like `CLARK-XXXXXX` |
| `linked` | INTEGER | 1 = linked to Telegram, 0 = not yet |
| `language` | TEXT | `'en'` or `'es'` |

### `tickets`
Full ticket system between chatters (Discord) and models (Telegram).  
Status lifecycle: `pending` → `accepted` / `denied` → `delivered` / `cancelled`

### `config`
Key/value store. Keys used:
- `instagram_log_channel_id` — set by `/setupinstagram`
- `active_workers_channel_id` / `active_workers_message_id` — set by `/setupactiveworkers`

---

## Feature: Clock In / Clock Out

**Flow:**
1. Employee runs `/clockin` → bot resolves their department via Discord role → inserts shift into DB → replies ephemeral "Clocked in at HH:MM EST" → posts green embed to the dept's log channel (public)
2. Employee runs `/clockout` → modal pops up (Shift Summary + Net Sales if commission dept) → on submit: closes shift in DB, replies ephemeral with duration, posts full shift embed to log channel

**Role resolution (3 fallbacks):**
1. Match Discord role ID against `departments.role_id`
2. Match Discord role name against `departments.name`
3. Look up employee in DB (in case admin used `/setrole` manually)

**Auto-close:** Scheduler runs hourly. Shifts open > 12 hours are force-closed, DM sent to employee.

---

## Feature: Phone Numbers (/getnumber)

Used by Instagram employees to get a USA virtual phone number for registering Instagram accounts.

**Trigger:** `/getnumber` slash command OR clicking the "Get a Number" button (`ig_get_number_btn`) posted via `/setupinstagram`

**Flow:**
1. Role check — must have `instagram` in their dept name
2. Service selector appears: [Service 1] [Service 2] buttons (ephemeral)
3. User picks a service → phone number fetched from API → displayed in ephemeral message
4. Background polling every 10s (max 60 attempts = 10 min) waits for SMS code
5. When code arrives: shows code + [✅ Used — Complete] [Cancel] buttons
6. User clicks Complete → API marked complete → admin log posted
7. User clicks Cancel → API refunds number → admin log posted

**Service 1 — GrizzlySMS:**
- API: `GET https://api.grizzlysms.com/stubs/handler_api.php`
- Key: `GRIZZLY_API_KEY` env var
- Country: `187` (USA), Service: `ig`
- Response format: JSON `{ activationId, phoneNumber }`
- Status check: returns `STATUS_OK:CODE`, `STATUS_CANCEL`, or `STATUS_WAIT`

**Service 2 — 5sim:**
- API: `GET https://5sim.net/v1/user/...`
- Key: `FIVESIM_API_KEY` env var (JWT Bearer token — expires ~2030)
- Buy: `buy/activation/usa/any/instagram` → returns `{ id, phone }`
- Check: `check/{id}` → status `RECEIVED`/`FINISHED` + `sms[0].code`
- Complete: `finish/{id}` | Cancel: `cancel/{id}`
- Auth header: `Authorization: Bearer <JWT>`

**activationStore (in-memory):**
```js
// Stores per activationId:
{ userId, username, phoneNumber, service: 'grizzly' | '5sim' }
// Cleared on complete, cancel, or timeout
```

**Admin log channel:** Set via `/setupinstagram`, stored in `config.instagram_log_channel_id`

**Key files:**
- `src/commands/getnumber.js` — all API logic + executeGetNumber()
- `src/handlers/getnumberHandler.js` — button interaction routing
- `src/utils/activationStore.js` — in-memory session store
- `src/events/interactionCreate.js` — routes `ig_get_number_btn`, `num_svc1`, `num_svc2`, `num_use_*`, `num_cancel_*`

---

## Feature: Ticket System (Discord ↔ Telegram)

Chatters create content requests in Discord that get sent to models via Telegram.

**Chatter flow (Discord):**
1. Clicks "New Request" button (`req_new`) in the requests channel
2. Selects model → selects type (video/photo/audio/question/other) → fills modal (description, price, priority, estimated time)
3. Ticket created in DB, forwarded to model's Telegram chat

**Model flow (Telegram):**
1. Receives ticket notification with [Accept] [Deny] [Ask Question] [Cancel] buttons
2. Accept → prompts for delivery days → Discord channel updated
3. Deny → prompts for reason → Discord channel updated
4. When done → clicks "Mark as Delivered" → Discord shows [Confirm Received] button
5. Chatter confirms → ticket closed

**Language support:** Models can be in English or Spanish. Messages are auto-translated via OpenAI.  
**Telegram link:** Admin creates model via `/setupmodel` → generates `CLARK-XXXXXX` code → model sends `/start CLARK-XXXXXX` in Telegram → linked

---

## Feature: Scheduled Jobs (scheduler.js)

| Job | Schedule | What it does |
|---|---|---|
| Auto-close shifts | Every hour | Closes shifts open > 12h, DMs employee, posts log |
| Weekly report | Monday 09:00 EST (14:00 UTC) | Sends payroll summary to `REPORT_CHANNEL_ID` |
| Active workers embed | Every 60 seconds | Updates live embed showing who is currently clocked in |

---

## Interaction Routing (interactionCreate.js)

All Discord interactions flow through `src/events/interactionCreate.js`:

| customId prefix | Handler |
|---|---|
| `req_*` | ticketHandler.js |
| `ig_get_number_btn`, `num_svc1`, `num_svc2`, `num_use_*`, `num_cancel_*` | getnumberHandler.js |
| `ideas_*` | contentIdeasHandler.js |
| `clockout_modal_*` | clockout.js handleModal() |
| `setrole_salary_*` | setrole.js handleModal() |
| All slash commands | client.commands map |

---

## Key Technical Notes

- **`deferUpdate()` vs `deferReply()`:** Button flows from existing messages use `deferUpdate()`. Fresh slash command flows use `deferReply({ ephemeral: true })`. Both support `editReply()` afterwards. This is critical in the getnumber flow because `num_svc1`/`num_svc2` are button presses on an existing message.

- **Role cache may be empty after bot restart:** `/clockin` and `/clockout` both have a fallback that re-fetches the member with `guild.members.fetch()` if `resolveClarkRole()` returns null initially.

- **5sim JWT token:** The `FIVESIM_API_KEY` is a JWT that expires around year 2030. If 5sim returns 401, the token needs regenerating from https://5sim.net/settings/security. The correct account has ~$19.99 balance.

- **GrizzlySMS Cloudflare block:** If GrizzlySMS returns HTML instead of JSON, it means Cloudflare is blocking the request. The error is caught and surfaced as `SERVICE_UNAVAILABLE`. No fix needed in code — it's intermittent.

- **Telegram 409 Conflict:** During Railway rolling restarts, two bot instances briefly run simultaneously causing a 409. The bot auto-resolves by stopping polling and restarting after 15 seconds.

- **Database migrations:** `database.js` runs migrations at startup. Currently migrates old `employees` table that had a `CHECK(role IN ...)` constraint.

---

## Admin Commands Reference

| Command | Who | What |
|---|---|---|
| `/setrole @user dept` | Admin | Assign employee to department |
| `/setsalary @user amount` | Admin | Set weekly salary |
| `/newdepartment` | Admin | Create department with channels/role |
| `/deletedepartment` | Admin | Remove department |
| `/weekreport` | Admin | Generate payroll report now |
| `/history @user` | Admin | View employee shift history |
| `/setupinstagram` | Admin | Set Instagram log channel |
| `/setupactiveworkers` | Admin | Post/configure live active workers embed |
| `/setupmodel` | Admin | Register model, get link code |
| `/unlinkmodel` | Admin | Deactivate model's Telegram link |
| `/postrequests` | Admin | Post "New Request" button in a channel |
| `/postredditideas` | Admin | Generate and post Reddit content ideas |
| `/postreelsideas` | Admin | Generate and post Reels content ideas |
| `/postannouncement` | Admin | Post a formatted announcement |
| `/pinlogs` | Admin | Pin a log embed |
| `/requests` | Admin | Browse/manage all tickets |
