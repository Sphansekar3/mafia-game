// pregenerate.js — Pre-generates Christopher Neural audio for all possible game lines
const { getAudioForText } = require('./ttsService');

const staticLines = [
  "Night falls over the town. Everyone, close your eyes and sleep.",
  "Night 2 descends. The town falls silent once more. Everyone, close your eyes.",
  "Night 3 descends. The town falls silent once more. Everyone, close your eyes.",
  "Night 4 descends. The town falls silent once more. Everyone, close your eyes.",
  "Night 5 descends. The town falls silent once more. Everyone, close your eyes.",
  "Mafia, open your eyes. Choose your victim wisely.",
  "Mafia, close your eyes.",
  "The doctor rushes through the shadows. Open your eyes and choose someone to protect.",
  "Doctor, close your eyes.",
  "Detective, open your eyes. Point at someone to investigate.",
  "The spirits have whispered their answer. Detective, close your eyes.",
  "The sun rises over the town. Everyone, open your eyes.",
  "It's a miracle! No one died last night. The town breathes a sigh of relief.",
  "The town has 60 seconds to discuss. Who among you hides behind a mask of lies?",
  "Time to vote! Choose who to eliminate, or skip.",
  "The town could not reach a decision. No one is eliminated today. Darkness will fall again soon.",
  "The Mafia has taken over the town. Darkness reigns supreme. The Mafia wins!",
  "The town has vanquished the Mafia! Peace is restored. The Town wins!"
];

async function run() {
  console.log(`Pre-generating ${staticLines.length} audio lines with Christopher...`);
  for (let i = 0; i < staticLines.length; i++) {
    const text = staticLines[i];
    console.log(`[${i + 1}/${staticLines.length}] Generating: "${text.substring(0, 35)}..."`);
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await getAudioForText(text);
        success = true;
        break;
      } catch (e) {
        console.warn(`Attempt ${attempt} failed, retrying in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (!success) {
      console.error(`Failed to pregenerate line: ${text}`);
    }
    // slight delay between requests to prevent socket rate limits
    await new Promise(r => setTimeout(r, 400));
  }
  console.log('✅ All static Christopher audio lines pre-generated and cached!');
}

run().catch(console.error);
