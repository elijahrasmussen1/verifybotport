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
MONGODB_URI=your_mongodb_connection_uri
```

- **BOT_TOKEN** — found in the [Discord Developer Portal](https://discord.com/developers/applications) under your application → Bot → Token.
- **OWNER_IDS** — comma-separated Discord user IDs of bot owners (right-click a user with Developer Mode enabled → Copy ID).
- **MONGODB_URI** — your MongoDB Atlas connection string.

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

## Auto-Join Voice & Music Playback

The bot **automatically joins** the configured voice channel (`VOICE_CHANNEL_ID`) on startup and stays there permanently. When someone joins the voice channel:

- The bot starts playing music from its playlist, shuffled randomly
- Songs fade in and out (2-second crossfade) between tracks
- Audio is streamed at the highest quality (48kHz, stereo PCM)
- When the playlist finishes, it reshuffles and starts again
- When everyone leaves the VC, playback stops
- When someone joins again, a fresh shuffle starts

### Playlist Songs
Place these files in the `music/` folder:
- `style.mp3`
- `crush.mp3`
- `flash.mp3`
- `how.mp3`
- `jeans.mp3`
- `posterboy.mp3`
- `trauma.mp3`

---

## Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `$m` | `$m <#channel or channel link> <message>` | Types in the specified channel for ~15 seconds, then sends the message. |
| `$sing` | `$sing <songname>` | Plays `music/<songname>.mp3` in the voice channel (interrupts the auto-playlist, resumes after). |
| `$singchannel` | `$singchannel <#channel or channel link or ID> <songname>` | Sends `music/<songname>.mp3` as a playable audio attachment to the specified text channel. |
| `$mongo` | `$mongo` | Checks MongoDB connectivity and replies with `mongo connected` or `mongo connection error`. |

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