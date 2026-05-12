require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');

const PREFIX = '$';
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_IDS = process.env.OWNER_IDS
  ? process.env.OWNER_IDS.split(',').map((id) => id.trim())
  : [];

if (!BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN is not set in your .env file.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  if (command === 'm') {
    // Resolve the target channel from a mention (<#channelId>) or a Discord URL
    const input = args[0];
    if (!input) {
      return message.reply('Please provide a channel mention or link. Usage: `$m <#channel or channel link>`');
    }

    let channelId = null;

    // Channel mention: <#channelId>
    const mentionMatch = input.match(/^<#(\d+)>$/);
    if (mentionMatch) {
      channelId = mentionMatch[1];
    }

    // Discord channel URL: https://discord.com/channels/guildId/channelId
    if (!channelId) {
      const urlMatch = input.match(/discord(?:app)?\.com\/channels\/\d+\/(\d+)/);
      if (urlMatch) {
        channelId = urlMatch[1];
      }
    }

    // Plain channel ID (18–19 digit snowflake)
    if (!channelId && /^\d{17,20}$/.test(input)) {
      channelId = input;
    }

    if (!channelId) {
      return message.reply('Could not resolve a channel from that input. Use a channel mention, link, or ID.');
    }

    let targetChannel;
    try {
      targetChannel = await client.channels.fetch(channelId);
    } catch {
      return message.reply('Could not find that channel. Make sure the bot has access to it.');
    }

    if (!targetChannel || !targetChannel.isTextBased()) {
      return message.reply('That does not appear to be a text channel.');
    }

    // Show typing indicator in the target channel (repeats every 9 s for 30 s)
    const DURATION_MS = 30_000;
    const INTERVAL_MS = 9_000;

    targetChannel.sendTyping().catch(() => {});
    const interval = setInterval(() => {
      targetChannel.sendTyping().catch(() => {});
    }, INTERVAL_MS);

    setTimeout(() => clearInterval(interval), DURATION_MS);

    message.reply(`Now appearing to type in <#${channelId}> for ~30 seconds.`);
  }
});

client.login(BOT_TOKEN);
