# verifybotport

A Discord bot built with **discord.js v14**.

---

## Setup

### 1. Install Node.js
Download and install **Node.js v18+** from https://nodejs.org/.

### 2. Clone / download the project
Place all files in a folder on your machine.

### 3. Configure the environment
Copy `.env.example` to `.env` and fill in your values:

```
BOT_TOKEN=your_bot_token_here
OWNER_IDS=your_discord_user_id
```

- **BOT_TOKEN** — found in the [Discord Developer Portal](https://discord.com/developers/applications) under your application → Bot → Token.
- **OWNER_IDS** — comma-separated Discord user IDs of bot owners (right-click a user with Developer Mode enabled → Copy ID).

### 4. Install dependencies (PowerShell)

Open PowerShell in the project folder and run:

```powershell
npm install
```

### 5. Start the bot (PowerShell)

```powershell
node index.js
```

Or using the npm script:

```powershell
npm start
```

You should see `Logged in as YourBot#0000` when the bot is online.

---

## Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `$m` | `$m <#channel or channel link> <message>` | Types in the specified channel for ~15 seconds, then sends the message. |
| `$sing` | `$sing <songname>` | Joins the configured voice channel, plays `music/<songname>.mp3`, then leaves. |
| `$singchannel` | `$singchannel <#channel or channel link or ID> <songname>` | Sends `music/<songname>.mp3` as a voice message to the specified text channel. |

### Examples

```
$m #general hello everyone!
$m https://discord.com/channels/123456789/987654321 hey there
$m 987654321098765432 what's up?
```

---

## Keeping the bot online (optional)

To keep the bot running after you close PowerShell, you can use [PM2](https://pm2.keymetrics.io/):

```powershell
npm install -g pm2
pm2 start index.js --name verifybotport
pm2 save
pm2 startup
```