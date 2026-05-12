require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');

const PREFIX = '$';
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_IDS = process.env.OWNER_IDS
  ? process.env.OWNER_IDS.split(',').map((id) => id.trim())
  : []; // Used for owner-only command checks; add guards with OWNER_IDS.includes(message.author.id)

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
      return message.reply('Please provide a channel and message. Usage: `$m <#channel or channel link> <message>`');
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

    // Plain channel ID (17–20 digit snowflake)
    if (!channelId && /^\d{17,20}$/.test(input)) {
      channelId = input;
    }

    if (!channelId) {
      return message.reply('Could not resolve a channel from that input. Use a channel mention, link, or ID.');
    }

    // Everything after the channel argument is the message to send
    const messageText = args.slice(1).join(' ');
    if (!messageText) {
      return message.reply('Please provide a message to send. Usage: `$m <#channel or channel link> <message>`');
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

    // Show typing indicator in the target channel (repeats every 9 s for 15 s), then send the message
    const DURATION_MS = 15_000;
    const INTERVAL_MS = 9_000;

    targetChannel.sendTyping().catch(() => {});
    const interval = setInterval(() => {
      targetChannel.sendTyping().catch(() => {});
    }, INTERVAL_MS);

    setTimeout(async () => {
      clearInterval(interval);
      await targetChannel.send(messageText);
    }, DURATION_MS);

    message.reply(`Typing in <#${channelId}> and sending your message in ~15 seconds.`);
  }
});

client.login(BOT_TOKEN);
