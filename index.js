require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
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

// --- Auto-join voice channel and shuffled music playback ---
const PLAYLIST_SONGS = ['style', 'crush', 'flash', 'how', 'jeans', 'posterboy', 'trauma'];
const CROSSFADE_DURATION = 2; // seconds of fade between songs

// Fisher-Yates shuffle
function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// State for the persistent voice connection and playback
let vcConnection = null;
let vcPlayer = null;
let currentPlaylist = [];
let currentTrackIndex = 0;
let isPlaying = false;
let currentFfmpegProcess = null;

function getTrackPath(songName) {
  return path.join(__dirname, 'music', `${songName}.mp3`);
}

function hasListenersInChannel(channel) {
  // Check if there are non-bot members in the voice channel
  return channel.members.filter(m => !m.user.bot).size > 0;
}

function startPlaylist() {
  if (isPlaying) return;
  currentPlaylist = shuffleArray(PLAYLIST_SONGS);
  currentTrackIndex = 0;
  isPlaying = true;
  playNextTrack();
}

function stopPlayback() {
  isPlaying = false;
  if (vcPlayer) {
    vcPlayer.stop();
  }
  if (currentFfmpegProcess) {
    currentFfmpegProcess.kill('SIGTERM');
    currentFfmpegProcess = null;
  }
}

function playNextTrack() {
  if (!isPlaying || !vcConnection) return;

  // If we've played all songs, reshuffle and start over
  if (currentTrackIndex >= currentPlaylist.length) {
    currentPlaylist = shuffleArray(PLAYLIST_SONGS);
    currentTrackIndex = 0;
  }

  const currentSong = currentPlaylist[currentTrackIndex];
  const currentPath = getTrackPath(currentSong);

  if (!fs.existsSync(currentPath)) {
    console.error(`Track not found: ${currentPath}, skipping...`);
    currentTrackIndex++;
    playNextTrack();
    return;
  }

  console.log(`Now playing: ${currentSong}`);

  // Probe the song duration so we can place the fade-out at the end
  let duration = 0;
  try {
    const probe = spawnSync(ffmpegPath, [
      '-i', currentPath,
      '-f', 'null', '-'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    // ffmpeg prints duration to stderr
    const stderr = probe.stderr.toString();
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (match) {
      duration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseFloat('0.' + match[4]);
    }
  } catch (e) {
    console.error('Failed to probe duration:', e);
  }

  // Build audio filter: fade-in at start, fade-out at end
  let audioFilter = `afade=t=in:st=0:d=${CROSSFADE_DURATION}`;
  if (duration > CROSSFADE_DURATION * 2) {
    const fadeOutStart = duration - CROSSFADE_DURATION;
    audioFilter += `,afade=t=out:st=${fadeOutStart}:d=${CROSSFADE_DURATION}`;
  }

  // Use FFmpeg to play at highest quality with fade in/out
  // Stream PCM s16le at 48kHz stereo (Discord standard) for best quality
  const ffmpegArgs = [
    '-i', currentPath,
    '-af', audioFilter,
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    '-acodec', 'pcm_s16le',
    'pipe:1'
  ];

  const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  currentFfmpegProcess = ffmpeg;

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
    inlineVolume: false,
  });

  vcPlayer.play(resource);
  currentTrackIndex++;

  ffmpeg.on('error', (err) => {
    console.error('FFmpeg process error:', err);
  });
}

async function joinAndStayInVC(channelId) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isVoiceBased()) {
      console.error('Could not find voice channel:', channelId);
      return;
    }

    vcConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    vcPlayer = createAudioPlayer();
    vcConnection.subscribe(vcPlayer);

    // When a track finishes, play the next one
    vcPlayer.on(AudioPlayerStatus.Idle, () => {
      if (isPlaying) {
        playNextTrack();
      }
    });

    vcPlayer.on('error', (err) => {
      console.error('Audio player error:', err);
      // Try to continue with next track
      if (isPlaying) {
        currentTrackIndex++;
        playNextTrack();
      }
    });

    // Check if someone is already in the channel and start playing
    if (hasListenersInChannel(channel)) {
      startPlaylist();
    }

    console.log(`Joined voice channel: ${channel.name}`);
  } catch (err) {
    console.error('Failed to join voice channel:', err);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

client.once('ready', async () => {
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

  // Auto-join the voice channel on startup
  await joinAndStayInVC(VOICE_CHANNEL_ID);
});

// Monitor voice state changes to start/stop playback based on channel occupancy
client.on('voiceStateUpdate', (oldState, newState) => {
  // Only care about the bot's configured voice channel
  const joinedBotChannel = newState.channelId === VOICE_CHANNEL_ID;
  const leftBotChannel = oldState.channelId === VOICE_CHANNEL_ID;

  if (!joinedBotChannel && !leftBotChannel) return;
  // Ignore bot's own state changes
  if (newState.member.user.bot) return;

  const channel = oldState.guild.channels.cache.get(VOICE_CHANNEL_ID);
  if (!channel) return;

  const listeners = channel.members.filter(m => !m.user.bot).size;

  if (listeners > 0 && !isPlaying) {
    // Someone joined and music isn't playing — start the playlist
    startPlaylist();
  } else if (listeners === 0 && isPlaying) {
    // Everyone left — stop playback
    stopPlayback();
  }
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

  // $sing <songname> — play a specific song in the voice channel (interrupts current playlist)
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

    if (!vcConnection || !vcPlayer) {
      return message.reply('Bot is not connected to a voice channel yet.');
    }

    // Stop the current auto-playlist and play the requested song
    stopPlayback();

    const ffmpegArgs = [
      '-i', filePath,
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      '-acodec', 'pcm_s16le',
      'pipe:1'
    ];

    const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: false,
    });

    vcPlayer.play(resource);
    message.reply(`🎵 Now playing **${songName}** in <#${VOICE_CHANNEL_ID}>`);

    // After the manual song finishes, resume the auto-playlist if there are listeners
    const onIdle = () => {
      vcPlayer.off(AudioPlayerStatus.Idle, onIdle);
      const channel = client.channels.cache.get(VOICE_CHANNEL_ID);
      if (channel && hasListenersInChannel(channel)) {
        startPlaylist();
      }
    };
    vcPlayer.on(AudioPlayerStatus.Idle, onIdle);
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
