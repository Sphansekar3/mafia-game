// narrator.js — All narration text strings organized by phase

const narration = {

  // ─── Night Phase ──────────────────────────────────────────

  nightFalls: "Night falls over the town. Everyone, close your eyes and sleep.",

  mafiaWake: "Mafia, open your eyes. Choose your victim wisely.",
  mafiaClose: "Mafia, close your eyes.",

  doctorWake: "The doctor rushes through the shadows. Open your eyes and choose someone to protect.",
  doctorClose: "Doctor, close your eyes.",

  detectiveWake: "Detective, open your eyes. Point at someone to investigate.",
  detectiveClose: "The spirits have whispered their answer. Detective, close your eyes.",

  // ─── Day Phase ────────────────────────────────────────────

  sunrise: "The sun rises over the town. Everyone, open your eyes.",

  playerKilled: (name, role) =>
    `A cold silence falls. ${name} was found dead this morning. They were a ${role}.`,

  noOneDied: "It's a miracle! No one died last night. The town breathes a sigh of relief.",

  discussionStart: "The town has 60 seconds to discuss. Who among you hides behind a mask of lies?",

  voteStart: "Time to vote! Choose who to eliminate, or skip.",

  playerEliminated: (name, role) =>
    `The town has spoken. ${name} has been eliminated. They were a ${role}.`,

  noElimination: "The town could not reach a decision. No one is eliminated today. Darkness will fall again soon.",

  // ─── Game Over ────────────────────────────────────────────

  mafiaWins: "The Mafia has taken over the town. Darkness reigns supreme. The Mafia wins!",

  townWins: "The town has vanquished the Mafia! Peace is restored. The Town wins!",

  // ─── Round transitions ────────────────────────────────────

  nightRound: (round) =>
    round === 1
      ? "Night falls over the town. Everyone, close your eyes and sleep."
      : `Night ${round} descends. The town falls silent once more. Everyone, close your eyes.`,
};

module.exports = narration;
