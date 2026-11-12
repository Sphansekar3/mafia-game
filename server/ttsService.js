// ttsService.js — Generates and caches ChristopherNeural audio on the server
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VOICE_ID = 'en-US-ChristopherNeural';
const CACHE_DIR = path.join(__dirname, '..', 'public', 'audio-cache');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function getHash(text) {
  return crypto.createHash('md5').update(text.trim()).digest('hex');
}

/**
 * Returns the public web path to the MP3 audio file for the narration text.
 * Generates it on-the-fly using MsEdgeTTS if not already in cache.
 */
async function getAudioForText(text) {
  const hash = getHash(text);
  const targetFolder = path.join(CACHE_DIR, hash);
  const targetFile = path.join(targetFolder, 'audio.mp3');
  const publicUrl = `/audio-cache/${hash}/audio.mp3`;

  if (fs.existsSync(targetFile)) {
    return publicUrl;
  }

  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  // Retry up to 3 times with a fresh connection if needed
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(VOICE_ID, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      await tts.toFile(targetFolder, text, {
        rate: '-8%',
        pitch: '-4Hz'
      });
      return publicUrl;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 600));
    }
  }

  throw lastErr;
}

module.exports = { getAudioForText };
