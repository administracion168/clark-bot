# Discord Virtual Phone Number Bot — Full Specification Prompt

---

## Overview

Build a Discord bot that allows authorized server members to request temporary USA virtual phone numbers on demand, receive their SMS verification codes automatically, and complete the full flow without ever leaving Discord. The bot integrates with the GrizzlySMS API to handle number provisioning, code polling, and activation management.

---

## Purpose

The bot solves a very specific problem: users who need to register accounts on platforms that require SMS verification (e.g. Instagram, Google, etc.) can get a real, temporary USA phone number directly inside Discord, see the verification code appear automatically when it arrives, and close the request when done — all in one place, with no external tools or manual steps.

---

## Tech Stack

- **Runtime**: Node.js
- **Discord library**: discord.js v14
- **API**: GrizzlySMS (`https://api.grizzlysms.com/stubs/handler_api.php`)
- **Environment variables**: `DISCORD_TOKEN`, `GRIZZLY_API_KEY`, `ADMIN_LOG_CHANNEL_ID`, `ALLOWED_ROLE_ID`

---

## Core User Flow

1. An authorized user clicks a persistent **"Get a Number"** button posted in a designated channel.
2. The bot calls the GrizzlySMS API to purchase a temporary USA virtual phone number.
3. The bot replies **privately (ephemeral)** to the user with the phone number and a **Cancel** button.
4. The user enters the number on the external platform (Instagram, Google, etc.).
5. The bot polls GrizzlySMS every 10 seconds in the background, waiting for the SMS code.
6. When the code arrives, the bot **edits the same ephemeral reply** to display the code, with two buttons: **✅ Used — Complete** and **Cancel**.
7. The user enters the code on the platform, then clicks **✅ Used — Complete**.
8. The bot marks the activation as used via the API and logs the completed event to a private admin channel.
9. If the user clicks **Cancel** at any point, the bot calls the API to cancel and refund the number.
10. If no code arrives after 10 minutes (60 polls × 10s), the bot auto-cancels and notifies the user.

---

## GrizzlySMS API — Endpoints Used

All requests go to:
```
GET https://api.grizzlysms.com/stubs/handler_api.php?api_key=KEY&action=ACTION&...
```

### 1. Get a number
```
action=getNumberV2
service=ig          (or whichever service — make this configurable)
country=187         (USA)
```
**Success response** (JSON):
```json
{ "activationId": "123456789", "phoneNumber": "12025550199", "activationCost": "0.50" }
```
**Error responses** (plain text): `NO_NUMBERS`, `NO_BALANCE`, `BAD_KEY`, etc.

### 2. Check status
```
action=getStatus
id=ACTIVATION_ID
```
**Responses**:
- `STATUS_WAIT_CODE` — waiting, keep polling
- `STATUS_OK:123456` — code received (after the colon is the code)
- `STATUS_CANCEL` — cancelled by provider

### 3. Set status (cancel or complete)
```
action=setStatus
id=ACTIVATION_ID
status=-1           (cancel/refund)
status=6            (mark as used/complete)
```

---

## Commands

### `/setup`
Admin-only. Posts the persistent **"Get a Number"** embed + button in the current channel. Admins run this once during initial setup. The message is pinned automatically.

### `/getnumber`
Alternative to clicking the button — triggers the same flow via slash command. Restricted to members with the configured allowed role.

---

## Button Interactions

| Custom ID | Trigger | Action |
|---|---|---|
| `ig_get_number_btn` | "Get a Number" button in channel | Starts the full flow (same as `/getnumber`) |
| `num_cancel_ACTIVATION_ID` | Cancel button during flow | Calls `setStatus(-1)`, notifies user, logs to admin |
| `num_use_ACTIVATION_ID` | "✅ Used — Complete" after code arrives | Calls `setStatus(6)`, logs success to admin |

---

## Polling Logic

- Start polling **10 seconds** after the number is issued.
- Poll every **10 seconds**.
- Maximum **60 attempts** (10 minutes total).
- On each poll, call `getStatus(activationId)`:
  - `STATUS_WAIT_CODE` or `STATUS_WAIT_RESEND` → schedule next poll
  - `STATUS_OK:CODE` → edit reply to show the code + action buttons, stop polling
  - `STATUS_CANCEL` → edit reply to show cancellation message, stop polling
- On timeout → call `setStatus(-1)` to refund, edit reply with timeout message, stop polling.
- If the API call itself fails (network error) → log the error, retry on next interval.

---

## In-Memory Activation Store

Use a `Map` to track active requests while they are in progress:

```js
// Key: activationId (string)
// Value: { userId, username, phoneNumber, activationCost }
const activationStore = new Map();
```

- Set on number acquisition.
- Deleted on completion, cancellation, or timeout.
- This prevents duplicate requests and provides context for admin logs.

---

## Admin Log Channel

Every significant event is logged to a private admin-only channel (configured via `ADMIN_LOG_CHANNEL_ID` env var):

| Event | Log message |
|---|---|
| Number issued | `📱 username requested a number — 12025550199` |
| Code received | `💬 username received a code on 12025550199` |
| Completed | `✅ username successfully completed registration with 12025550199` |
| Cancelled by user | `❌ username cancelled number 12025550199` |
| Timed out | `⏰ username — activation timed out. Number 12025550199 refunded automatically.` |
| Provider cancelled | `🚫 Provider cancelled activation for username — 12025550199` |

---

## Access Control

Only members with a specific Discord role (configured via `ALLOWED_ROLE_ID` env var) can use the bot. Both the slash command and the button check for this role before proceeding. Non-authorized users receive an ephemeral error message.

---

## Error Handling & User-Friendly Messages

Map raw API error codes to human-readable messages:

| API error | User message |
|---|---|
| `NO_NUMBERS` | "No numbers available right now. Try again in a few minutes." |
| `NO_BALANCE` | "Insufficient balance on the account. Contact an admin." |
| `BAD_KEY` | "Invalid API key. Contact an admin." |
| `BAD_SERVICE` | "Invalid service configuration. Contact an admin." |
| `SERVICE_UNAVAILABLE` | "The service is temporarily unavailable. Try again in a few minutes." |

If the API returns an HTML page (e.g. Cloudflare challenge), the bot detects this (response starts with `<`) and returns the `SERVICE_UNAVAILABLE` message rather than showing raw HTML to the user.

All requests to GrizzlySMS should include browser-like headers to avoid being flagged:
```js
headers: {
  'User-Agent': 'Mozilla/5.0 ...',
  'Accept': 'application/json, text/plain, */*',
  'Cache-Control': 'no-cache',
}
```

---

## File Structure

```
/
├── index.js                  # Bot entry point, event registration
├── .env                      # DISCORD_TOKEN, GRIZZLY_API_KEY, ADMIN_LOG_CHANNEL_ID, ALLOWED_ROLE_ID
├── src/
│   ├── commands/
│   │   ├── setup.js          # /setup command (posts persistent button)
│   │   └── getnumber.js      # /getnumber command + core flow logic
│   ├── handlers/
│   │   └── buttonHandler.js  # Handles num_cancel_ and num_use_ button clicks
│   └── utils/
│       └── activationStore.js  # In-memory Map for active requests
└── package.json
```

---

## Ephemeral Message Flow — States

**State 1 — Number issued, waiting for SMS:**
```
📱 Your number is ready!

`12025550199`

⏳ Waiting for the SMS verification code... (up to 10 minutes)

Enter the number above on the platform. The code will appear here automatically.

[ Cancel ]
```

**State 2 — Code received:**
```
📱 Number: `12025550199`

💬 Code received!
`847291`

Enter this code to complete registration.
Once done, click ✅ Used — Complete.

[ ✅ Used — Complete ]  [ Cancel ]
```

**State 3 — Completed:**
```
✅ Done! Registration complete.
```

**State 4 — Cancelled:**
```
❌ Number released. No charges applied.
```

**State 5 — Timed out:**
```
⏰ Timed out — No SMS received after 10 minutes. The number has been released.
```

---

## Key Implementation Notes

- All bot replies to users must be **ephemeral** (`{ ephemeral: true }`) — no one else in the channel sees them.
- The persistent "Get a Number" button in the channel is **not ephemeral** — it stays visible to all authorized members at all times.
- Polling runs in the background using `setTimeout` recursion (not `setInterval`) so each poll only triggers the next one after completion, avoiding overlapping calls.
- The `activationId` is embedded directly in button custom IDs (`num_cancel_ACTIVATION_ID`, `num_use_ACTIVATION_ID`) so the handler always knows which activation to act on, even across multiple simultaneous users.
- The bot should handle multiple users running the flow concurrently without interference.
- All interaction responses after the initial reply must use `interaction.editReply()` with `.catch(() => {})` to silently handle cases where the original message was deleted.
