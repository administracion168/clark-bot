# Clark — La Isla Agency Discord Bot

Clock in/out tracking system for chatters and marketing employees.

---

## Prerequisites

- Node.js 18 or later
- A Discord account with access to the [Discord Developer Portal](https://discord.com/developers/applications)

---

## Step 1 — Create the Discord Application & Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**.
2. Give it a name (e.g. `Clark`) and click **Create**.
3. In the left sidebar click **Bot**, then click **Add Bot** → **Yes, do it!**
4. Under **Token**, click **Reset Token** and copy the token — this is your `DISCORD_TOKEN`.
5. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent** (required to read member roles)
6. Click **Save Changes**.

### Required Bot Permissions

When inviting the bot (Step 3), the following permissions are needed:

| Permission | Why |
|---|---|
| View Channels | Read channels |
| Send Messages | Post shift log embeds & weekly reports |
| Embed Links | Rich embed posts |
| Read Message History | — |
| Use Slash Commands | Register and respond to `/` commands |
| Manage Roles *(optional)* | Not required; roles are only read, not modified |

---

## Step 2 — Invite the Bot to Your Server

1. In the Developer Portal, go to **OAuth2 → URL Generator**.
2. Under **Scopes**, check `bot` and `applications.commands`.
3. Under **Bot Permissions**, check the permissions listed above.
4. Copy the generated URL and open it in your browser.
5. Select your server and click **Authorize**.

---

## Step 3 — Set Up Your Discord Server

### Create the required roles

Create these two roles (exact names, case-insensitive):

- `Chatter`
- `Marketing`

Assign these roles to the relevant employees. The bot reads role names to determine each employee's type.

### Create the required channels

- **#shift-log** — public or staff-visible channel where completed shifts are posted.
- A private admin channel (e.g. **#weekly-reports**) for automated weekly reports. Make sure the bot has access to this channel.

---

## Step 4 — Configure Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```
cp .env.example .env
```

| Variable | How to find it |
|---|---|
| `DISCORD_TOKEN` | Bot token from Step 1 |
| `CLIENT_ID` | Developer Portal → Your App → **General Information** → Application ID |
| `GUILD_ID` | Right-click your server icon in Discord → **Copy Server ID** (enable Developer Mode first: Settings → Advanced → Developer Mode) |
| `LOG_CHANNEL_ID` | Right-click #shift-log → **Copy Channel ID** |
| `REPORT_CHANNEL_ID` | Right-click your private report channel → **Copy Channel ID** |
| `ADMIN_ROLE_ID` | *(Optional)* Right-click an admin role → **Copy Role ID**. Members with this role can use admin commands in addition to members with the Administrator permission. |

---

## Step 5 — Install Dependencies

```bash
npm install
```

---

## Step 6 — Register Slash Commands

Run this once (and again any time you add/rename commands):

```bash
npm run deploy
```

Commands are registered to your specific guild (server) for instant availability.

---

## Step 7 — Start the Bot

```bash
npm start
```

The bot will log in, start the schedulers, and be ready to use.

---

## Commands Reference

### Employee Commands

| Command | Description |
|---|---|
| `/clockin` | Start your shift |
| `/clockout` | End your shift (opens a summary modal) |
| `/mystats` | View your stats for the current week |

### Admin Commands

| Command | Description |
|---|---|
| `/setrole @user role` | Set a user's Clark role (chatter or marketing). If marketing, prompts for weekly salary. |
| `/setsalary @user amount` | Update a marketing employee's weekly salary |
| `/weekreport` | Manually send the weekly report to the report channel |
| `/history @user [days]` | View shift history for an employee (default: last 7 days) |

---

## Automatic Features

### Auto-Close Protection
Every hour, the bot checks for shifts open longer than 12 hours. These are automatically closed with a note, and the employee receives a DM.

### Weekly Report
Every **Monday at 03:00 AM EST** (09:00 AM Canary Islands), the bot sends a detailed weekly report to the report channel covering the previous Monday–Sunday. The report includes:

- Per-employee breakdown with shift summaries
- Payment calculations:
  - **Chatters:** `($2 × total hours) + (4% × total net sales)`
  - **Marketing:** Fixed weekly salary
- Total payroll summary
- Agency metrics and anomaly flags

You can also trigger the report manually with `/weekreport`.

---

## Database

The bot uses SQLite (`data/clark.db`). The file is created automatically on first run. Back it up periodically if you need shift history persistence.

---

## Timezone Note

All times are stored internally as UTC and displayed to users in **EST (UTC-5)**. The weekly report schedule runs at 08:00 UTC, which is 03:00 EST / 09:00 Canary Islands time.
