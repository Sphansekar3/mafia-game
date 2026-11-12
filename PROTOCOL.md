# Mafia Game — Socket.IO Protocol & Architecture Contract

## Architecture Overview

- **Single-page app** — one `index.html` with multiple `<section>` views, shown/hidden via JS
- **Server** manages ALL game state and logic. Clients are dumb renderers.
- **Host client** is special: it plays voice narration via Web Speech API
- **All players** (including host) see only their own role and game actions

## Views (sections in index.html)

1. `#screen-home` — Create Room / Join Room
2. `#screen-waiting` — "Waiting... 3/8 players joined" (count only, NO names)
3. `#screen-role` — "You are... THE MAFIA 🔪" (dramatic reveal, shown briefly)
4. `#screen-night` — Dark screen. Active role gets action UI (target list).
5. `#screen-day` — Day announcement, discussion timer
6. `#screen-vote` — Vote for who to eliminate (list of alive players)
7. `#screen-gameover` — Winner announcement + full role reveal

## Socket.IO Events

### Room Management

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `create-room` | `{ playerCount: number }` | Host creates a room |
| `join-room` | `{ roomCode: string, playerName: string }` | Player joins with name |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room-created` | `{ roomCode: string }` | Sent to host after room creation |
| `join-success` | `{ }` | Confirms player joined successfully |
| `join-error` | `{ message: string }` | Room not found, full, duplicate name, etc. |
| `player-count-update` | `{ current: number, total: number }` | Broadcast to ALL in room. NO player names. |

### Game Start (auto-triggered when count == total)

#### Server → Client (private per player)

| Event | Payload | Description |
|-------|---------|-------------|
| `role-assigned` | `{ role: 'mafia'\|'doctor'\|'detective'\|'civilian', mafiaTeam?: string[] }` | Private role. `mafiaTeam` only sent to mafia players. |

### Narration (host-only)

#### Server → Host Client

| Event | Payload | Description |
|-------|---------|-------------|
| `narrate` | `{ text: string, id: string }` | Host phone speaks this text aloud |

#### Host Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `narration-done` | `{ id: string }` | Host confirms speech finished; server proceeds |

### Night Phase

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `phase-night` | `{ round: number }` | All screens go dark |
| `your-turn` | `{ role: string, players: string[] }` | Sent to active role's player(s). Show target list. |
| `turn-end` | `{ }` | Sent to active role when their turn is over. Go dark. |
| `investigate-result` | `{ target: string, isMafia: boolean }` | Sent ONLY to detective. Display on screen, NOT spoken. |

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `night-action` | `{ target: string }` | Player submits their night action |

### Day Phase

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `phase-day` | `{ round: number, killed: string\|null, killedRole: string\|null, saved: boolean }` | Day begins. `killed` is null if doctor saved. |
| `discussion` | `{ duration: number }` | Discussion timer (seconds) |
| `vote-time` | `{ players: string[] }` | Time to vote. Show alive players list + "Skip" option. |
| `vote-result` | `{ eliminated: string\|null, role: string\|null, votes: {[player]: string} }` | null if tie/skip majority. `votes` shows who voted for whom. |

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `cast-vote` | `{ target: string\|null }` | null = skip/abstain |

### Game Over

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `game-over` | `{ winner: 'mafia'\|'town', roles: {name: string, role: string, alive: boolean}[] }` | Full reveal |

### Player State

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `you-died` | `{ killedBy: 'mafia'\|'voted' }` | Sent to the dead player. They see a "You're dead" overlay. |
| `player-eliminated` | `{ name: string, role: string }` | Broadcast to all alive players. |

---

## Server-Side Game Flow (gameManager.js)

```
State Machine:
  LOBBY → ROLE_REVEAL → NIGHT → DAY_ANNOUNCE → DISCUSSION → VOTING → (check win) → NIGHT or GAME_OVER

Night Phase Sequence (managed by server):
  1. narrate("Night falls. Everyone close your eyes.")  → wait for narration-done
  2. phase-night to all clients
  3. pause(2s)
  4. narrate("Mafia, open your eyes. Choose your victim.") → wait for narration-done
  5. your-turn to mafia player(s) with alive non-mafia players
  6. Wait for night-action from ALL mafia (or 30s timeout → random pick)
     - If multiple mafia, they must agree (majority target, or first pick for simplicity)
  7. turn-end to mafia
  8. pause(2s)
  9. narrate("Mafia, close your eyes.") → wait
  10. pause(3s)
  11. If doctor alive:
      narrate("Doctor, open your eyes. Choose someone to protect.") → wait
      your-turn to doctor
      Wait for night-action (or 30s timeout → random)
      turn-end to doctor
      narrate("Doctor, close your eyes.") → wait
      pause(3s)
  12. If detective alive:
      narrate("Detective, open your eyes. Point at someone to investigate.") → wait
      your-turn to detective
      Wait for night-action (or 30s timeout → random)
      Send investigate-result to detective (screen only!)
      pause(3s)
      narrate("The spirits have answered. Detective, close your eyes.") → wait
      pause(3s)
  13. Resolve: check if doctor saved mafia target
  14. Transition to DAY

Day Phase Sequence:
  1. narrate("The sun rises. Everyone open your eyes.") → wait
  2. pause(2s)
  3. If someone died:
     narrate("[Name] was found dead this morning! They were a [role].") → wait
     Send you-died to victim
     Send player-eliminated to all
  4. Else:
     narrate("It's a miracle! No one died last night!") → wait
  5. Check win condition → if game over, go to GAME_OVER
  6. narrate("The town has 60 seconds to discuss. Who do you think is the Mafia?") → wait
  7. Send discussion { duration: 60 } to all
  8. Wait 60 seconds
  9. narrate("Time to vote! Choose who to eliminate, or skip.") → wait
  10. Send vote-time to all alive players
  11. Wait for all votes (or 30s timeout → abstain)
  12. Resolve votes: majority → eliminate, tie → no elimination
  13. If eliminated:
      narrate("[Name] has been eliminated by the town! They were a [role].") → wait
      Send vote-result, you-died, player-eliminated
  14. Else:
      narrate("The town could not reach a decision. No one is eliminated.") → wait
      Send vote-result (eliminated: null)
  15. Check win condition → if game over, go to GAME_OVER
  16. Else → back to NIGHT
```

## Role Distribution Table (used by server)

```javascript
const ROLE_TABLE = {
  5:  { mafia: 1, doctor: 1, detective: 0 },
  6:  { mafia: 1, doctor: 1, detective: 1 },
  7:  { mafia: 2, doctor: 1, detective: 1 },
  8:  { mafia: 2, doctor: 1, detective: 1 },
  9:  { mafia: 2, doctor: 1, detective: 1 },
  10: { mafia: 3, doctor: 1, detective: 1 },
  11: { mafia: 3, doctor: 1, detective: 1 },
  12: { mafia: 3, doctor: 1, detective: 1 },
};
// remaining players are civilians
```

## Narration Scripts (narrator.js on server)

Full narration text strings organized by phase. The server sends these to the host client which speaks them using Web Speech API.

## Client Voice (narrator.js on client)

```javascript
// Only runs on the host's device
// Uses window.speechSynthesis
// On receiving 'narrate' event:
//   1. Create SpeechSynthesisUtterance with the text
//   2. Set voice, rate, pitch for dramatic effect
//   3. On 'end' event → emit 'narration-done' back to server
```

## File Structure

```
MAFIA/
├── server/
│   ├── package.json          # express, socket.io dependencies
│   ├── index.js              # Express static serve + Socket.IO setup + room management
│   ├── gameManager.js        # Game class: state machine, role assign, night/day logic, win check
│   └── narrator.js           # Narration text strings for all phases
│
├── public/
│   ├── index.html            # Single page with all 7 screen sections
│   ├── css/
│   │   └── style.css         # Dark cinematic mobile-first theme
│   └── js/
│       ├── app.js            # Socket.IO event handling, screen switching, game UI
│       └── narrator.js       # Web Speech API wrapper (host only)
│
└── README.md
```

## Design Notes

- Mobile-first: all UI designed for phone screens in portrait
- Dark theme: #0a0a0a background, blood red (#c0392b) accents, ghostly white text
- Night screen: very dark, minimal UI, maybe subtle pulse animation
- Role reveal: dramatic full-screen with role icon/emoji
- No player list shown ANYWHERE except:
  - Mafia's target selection during night
  - Doctor's save selection during night
  - Detective's investigate selection during night
  - Voting screen during day
  - Game over screen (full reveal)
- Dead players see a "☠️ You are dead" overlay and cannot act/vote
- Host is marked via `isHost: true` in their socket session
- Socket.IO rooms used for broadcasting

## Timeouts

- Night action timeout: 30 seconds (auto-random if not submitted)
- Discussion timer: 60 seconds (configurable by host in future)
- Vote timeout: 30 seconds (auto-abstain if not submitted)
- Narration-done timeout: 15 seconds (fallback if speech API fails)
