const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const fs = require('fs');
const path = require('path');

async function main() {
  const voices = [
    { id: "en-US-ChristopherNeural", label: "Christopher (Deep Dramatic Storyteller)" },
    { id: "en-US-GuyNeural", label: "Guy (Natural American Narrator)" },
    { id: "en-GB-RyanNeural", label: "Ryan (British Cinema Narrator)" },
    { id: "en-US-BrianNeural", label: "Brian (Serious Dark Movie Trailer)" },
  ];

  const phrase = "Night falls over the town. Everyone, close your eyes and sleep.";
  const outDir = path.join(__dirname, '..', 'public', 'voices');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const v of voices) {
    const vDir = path.join(outDir, v.id);
    if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });

    console.log(`Generating: ${v.label}...`);
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(v.id, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const res = await tts.toFile(vDir, phrase, {
        rate: "-8%",
        pitch: "-4Hz"
      });
      console.log(`Saved: ${res.audioFilePath}`);
    } catch (e) {
      console.error(`Error on ${v.id}:`, e);
    }
  }
}

main().then(() => console.log('Finished generating!'));
