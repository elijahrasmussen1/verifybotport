require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ffmpegPath = require('ffmpeg-static');

// Only allow safe characters in song names (alphanumeric, hyphens, underscores, spaces)
function isValidSongName(name) {
  return /^[\w\s-]+$/.test(name);
}

const PREFIX = '$';
const BOT_TOKEN = process.env.BOT_TOKEN;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID || '1503585970014912718';
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
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Set "Listening to trauma" status with "by 2hollis" shown as the state text
  client.user.setPresence({
    activities: [
      {
        name: 'trauma',
        type: ActivityType.Listening,
        state: 'by 2hollis',
      },
    ],
    status: 'online',
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  // Split only the first token (command) without collapsing the rest of the content,
  // so that multi-line message bodies have their newlines preserved.
  const rawBody = message.content.slice(PREFIX.length);
  const firstSpaceIdx = rawBody.search(/\s/);
  const command = (firstSpaceIdx === -1 ? rawBody : rawBody.slice(0, firstSpaceIdx)).toLowerCase();
  const afterCommand = firstSpaceIdx === -1 ? '' : rawBody.slice(firstSpaceIdx + 1);

  if (command === 'm') {
    // Resolve the target channel from a mention (<#channelId>) or a Discord URL.
    // Split only the channel argument off the front; everything after it is the raw message body.
    const argMatch = afterCommand.match(/^(\S+)([\s\S]*)$/);
    const input = argMatch ? argMatch[1] : null;
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

    // Everything after the channel argument is the message to send (raw, preserving newlines)
    const messageText = argMatch ? argMatch[2].replace(/^\s/, '') : '';
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

  // $sing <songname> — join hardcoded voice channel, play music/<songname>.mp3, then leave
  if (command === 'sing') {
    const songName = afterCommand.trim();
    if (!songName) {
      return message.reply('Please provide a song name. Usage: `$sing <songname>`');
    }

    if (!isValidSongName(songName)) {
      return message.reply('Invalid song name. Use only letters, numbers, hyphens, underscores, and spaces.');
    }

    const filePath = path.join(__dirname, 'music', `${songName}.mp3`);
    if (!fs.existsSync(filePath)) {
      return message.reply(`Could not find \`music/${songName}.mp3\`. Make sure the file exists.`);
    }

    const guild = message.guild;
    if (!guild) {
      return message.reply('This command can only be used in a server.');
    }

    let voiceChannel;
    try {
      voiceChannel = await client.channels.fetch(VOICE_CHANNEL_ID);
    } catch {
      return message.reply('Could not find the voice channel.');
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();
    const resource = createAudioResource(filePath);
    player.play(resource);
    connection.subscribe(player);

    message.reply(`🎵 Now playing **${songName}** in <#${VOICE_CHANNEL_ID}>`);

    player.on(AudioPlayerStatus.Idle, () => {
      connection.destroy();
    });

    player.on('error', (err) => {
      console.error('Audio player error:', err);
      connection.destroy();
      message.reply('An error occurred while playing the song.');
    });
  }

  // $singchannel <channel> <songname> — send the mp3 as a voice message to the specified text channel
  if (command === 'singchannel') {
    const argMatch2 = afterCommand.match(/^(\S+)\s+([\s\S]+)$/);
    const channelInput = argMatch2 ? argMatch2[1] : null;
    const songName = argMatch2 ? argMatch2[2].trim() : null;

    if (!channelInput || !songName) {
      return message.reply('Usage: `$singchannel <#channel or channel link or ID> <songname>`');
    }

    if (!isValidSongName(songName)) {
      return message.reply('Invalid song name. Use only letters, numbers, hyphens, underscores, and spaces.');
    }

    const filePath = path.join(__dirname, 'music', `${songName}.mp3`);
    if (!fs.existsSync(filePath)) {
      return message.reply(`Could not find \`music/${songName}.mp3\`. Make sure the file exists.`);
    }

    // Resolve channel ID
    let channelId = null;
    const mentionMatch2 = channelInput.match(/^<#(\d+)>$/);
    if (mentionMatch2) channelId = mentionMatch2[1];
    if (!channelId) {
      const urlMatch2 = channelInput.match(/discord(?:app)?\.com\/channels\/\d+\/(\d+)/);
      if (urlMatch2) channelId = urlMatch2[1];
    }
    if (!channelId && /^\d{17,20}$/.test(channelInput)) channelId = channelInput;

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

    // Convert to OGG Opus so Discord renders it as a playable audio attachment
    const oggPath = path.join(__dirname, 'music', `${songName}.ogg`);
    try {
      const result = spawnSync(ffmpegPath, ['-y', '-i', filePath, '-c:a', 'libopus', '-b:a', '64k', oggPath], { stdio: 'ignore' });
      if (result.status !== 0) throw new Error('ffmpeg exited with non-zero status');
    } catch (convertErr) {
      console.error('FFmpeg conversion error:', convertErr);
      return message.reply('Failed to convert the audio file. Make sure ffmpeg is available.');
    }

    // Send as a regular audio file attachment (playable inline in Discord)
    try {
      await targetChannel.send({
        files: [{
          attachment: oggPath,
          name: `${songName}.ogg`,
        }],
      });
      message.reply(`🎵 Sent **${songName}** as an audio attachment in <#${channelId}>`);
    } catch (err) {
      console.error('Error sending audio attachment:', err);
      message.reply('Failed to send the audio file. Make sure the bot has permissions in that channel.');
    } finally {
      // Clean up the temporary ogg file
      try { fs.unlinkSync(oggPath); } catch (unlinkErr) { console.error('Failed to delete temporary file:', unlinkErr); }
    }
  }
});

client.login(BOT_TOKEN);
