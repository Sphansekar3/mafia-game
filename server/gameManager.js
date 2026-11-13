// gameManager.js — Core Game class: state machine, role assignment,
// night/day phase logic, vote resolution, win conditions

const narration = require('./narrator');
const { getAudioForText } = require('./ttsService');

// ── Role Distribution Table ──────────────────────────────────────
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

// ── States ───────────────────────────────────────────────────────
const STATE = {
  LOBBY:        'LOBBY',
  ROLE_REVEAL:  'ROLE_REVEAL',
  NIGHT:        'NIGHT',
  DAY_ANNOUNCE: 'DAY_ANNOUNCE',
  DISCUSSION:   'DISCUSSION',
  VOTING:       'VOTING',
  GAME_OVER:    'GAME_OVER',
};

// ── Helpers ──────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Game Class ───────────────────────────────────────────────────
class Game {
  /**
   * @param {string}  roomCode
   * @param {number}  totalPlayers
   * @param {object}  io            — Socket.IO server instance
   */
  constructor(roomCode, totalPlayers, io, testBots = false) {
    this.roomCode     = roomCode;
    this.totalPlayers = totalPlayers;
    this.io           = io;
    this.testBots     = testBots;
    this.state        = STATE.LOBBY;
    this.round        = 0;

    // { socketId: { name, role, alive, isHost, isBot, socket } }
    this.players = {};
    this.hostSocketId = null;

    // Night resolution scratch-pad
    this.mafiaVotes   = {};   // socketId → targetName
    this.doctorTarget = null;
    this.detectiveTarget = null;
    this.nightTarget  = null; // resolved mafia target

    // Vote scratch-pad
    this.votes = {};          // socketId → targetName|null
  }

  // ── Player Management ──────────────────────────────────────

  addPlayer(socket, name, isHost = false) {
    this.players[socket.id] = {
      name,
      role: null,
      alive: true,
      isHost,
      isBot: false,
      socket,
    };
    if (isHost) this.hostSocketId = socket.id;
    socket.join(this.roomCode);
  }

  addBotPlayer(name) {
    const botId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const mockSocket = {
      id: botId,
      emit: () => {},
      on: () => {},
      removeListener: () => {},
      join: () => {},
      leave: () => {},
    };
    this.players[botId] = {
      name,
      role: null,
      alive: true,
      isHost: false,
      isBot: true,
      socket: mockSocket,
    };
  }

  removePlayer(socketId) {
    const p = this.players[socketId];
    if (p) p.socket.leave(this.roomCode);
    delete this.players[socketId];
  }

  reconnectPlayer(newSocket, name) {
    // Find player by name
    const oldEntry = Object.entries(this.players).find(([_, p]) => p.name.toLowerCase() === name.toLowerCase());
    if (!oldEntry) return null;

    const [oldSocketId, player] = oldEntry;
    newSocket.join(this.roomCode);

    // Update socket reference
    player.socket = newSocket;

    // If socket ID changed, update mapping
    if (oldSocketId !== newSocket.id) {
      delete this.players[oldSocketId];
      this.players[newSocket.id] = player;

      if (this.hostSocketId === oldSocketId) {
        this.hostSocketId = newSocket.id;
        player.isHost = true;
      }
    }

    return player;
  }

  getCurrentStateForPlayer(socketId) {
    const p = this.players[socketId];
    if (!p) return null;

    const mafiaPlayers = Object.values(this.players).filter(x => x.role === 'mafia').map(x => x.name);

    return {
      roomCode: this.roomCode,
      state: this.state,
      round: this.round,
      role: p.role,
      alive: p.alive,
      isHost: p.isHost,
      mafiaTeam: p.role === 'mafia' ? mafiaPlayers : null,
      alivePlayers: this.alivePlayerNames(),
      currentCount: this.getPlayerCount(),
      totalPlayers: this.totalPlayers
    };
  }

  getPlayerCount() {
    return Object.keys(this.players).length;
  }

  broadcastPlayerCount() {
    this.io.to(this.roomCode).emit('player-count-update', {
      current: this.getPlayerCount(),
      total: this.totalPlayers,
    });
  }

  isNameTaken(name) {
    return Object.values(this.players).some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
  }

  // ── Queries ────────────────────────────────────────────────

  alivePlayers() {
    return Object.values(this.players).filter((p) => p.alive);
  }

  alivePlayerNames() {
    return this.alivePlayers().map((p) => p.name);
  }

  aliveByRole(role) {
    return Object.values(this.players).filter(
      (p) => p.alive && p.role === role
    );
  }

  playerByName(name) {
    return Object.values(this.players).find((p) => p.name === name);
  }

  socketByName(name) {
    const p = this.playerByName(name);
    return p ? p.socket : null;
  }

  hostSocket() {
    return this.players[this.hostSocketId]?.socket || null;
  }

  isAlive(socketId) {
    return this.players[socketId]?.alive === true;
  }

  // ── Narration helpers ──────────────────────────────────────

  /**
   * Send a narrate event to the host and wait for narration-done (or 15s
   * timeout).
   */
  async narrate(text) {
    let audioUrl = null;
    try {
      audioUrl = await getAudioForText(text);
    } catch (e) {
      console.error('[ttsService] Error generating audio for:', text, e);
    }

    return new Promise((resolve) => {
      const host = this.hostSocket();
      if (!host) { resolve(); return; }

      const id = `nar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        host.removeListener('narration-done', onDone);
        clearTimeout(timer);
        resolve();
      };

      const onDone = (payload) => {
        if (payload && payload.id === id) finish();
      };

      host.on('narration-done', onDone);
      const timer = setTimeout(finish, 18000); // 18s fallback

      host.emit('narrate', { text, id, audioUrl });
    });
  }

  // ── Role Assignment ────────────────────────────────────────

  assignRoles() {
    const count = this.totalPlayers;
    const dist = ROLE_TABLE[count];
    if (!dist) {
      // Fallback for out-of-table counts: 1 mafia per 4 players, 1 doc, 1 det
      const mafia = Math.max(1, Math.floor(count / 4));
      const doctor = 1;
      const detective = count >= 6 ? 1 : 0;
      return this._distribute({ mafia, doctor, detective });
    }
    return this._distribute(dist);
  }

  _distribute(dist) {
    let ids = Object.keys(this.players);

    // If testBots is active, ensure the host gets the mafia role!
    if (this.testBots && this.hostSocketId) {
      const nonHost = ids.filter(id => id !== this.hostSocketId);
      ids = [this.hostSocketId, ...shuffle(nonHost)];
    } else {
      ids = shuffle(ids);
    }

    let i = 0;
    const mafiaIds = [];

    for (let m = 0; m < dist.mafia; m++, i++) {
      this.players[ids[i]].role = 'mafia';
      mafiaIds.push(ids[i]);
    }
    for (let d = 0; d < dist.doctor; d++, i++) {
      this.players[ids[i]].role = 'doctor';
    }
    for (let d = 0; d < dist.detective; d++, i++) {
      this.players[ids[i]].role = 'detective';
    }
    for (; i < ids.length; i++) {
      this.players[ids[i]].role = 'civilian';
    }

    // Build mafia team names list
    const mafiaTeam = mafiaIds.map((id) => this.players[id].name);

    // Send private role-assigned to each player
    for (const id of Object.keys(this.players)) {
      const p = this.players[id];
      const payload = { role: p.role };
      if (p.role === 'mafia') payload.mafiaTeam = mafiaTeam;
      p.socket.emit('role-assigned', payload);
    }
  }

  // ── Game Start ─────────────────────────────────────────────

  async start() {
    this.state = STATE.ROLE_REVEAL;
    this.assignRoles();

    // Give players time to absorb their role
    await pause(6000);

    // Begin first night
    this.runNight();
  }

  // ── Night Phase ────────────────────────────────────────────

  async runNight() {
    this.state = STATE.NIGHT;
    this.round++;
    this.mafiaVotes = {};
    this.doctorTarget = null;
    this.detectiveTarget = null;

    // 1. phase-night to all clients immediately so screens turn dark & night sound starts
    this.io.to(this.roomCode).emit('phase-night', { round: this.round });
    await pause(1000);

    // 2. Narrate night falls
    await this.narrate(narration.nightRound(this.round));
    await pause(1500);

    // ─── Mafia turn ───
    await this.narrate(narration.mafiaWake);

    const aliveMafia = this.aliveByRole('mafia');
    const mafiaTargets = this.alivePlayers()
      .filter((p) => p.role !== 'mafia')
      .map((p) => p.name);

    for (const m of aliveMafia) {
      m.socket.emit('your-turn', { role: 'mafia', players: mafiaTargets });
    }

    // Wait for all alive mafia to submit (or 30s timeout)
    await this._collectMafiaActions(aliveMafia, mafiaTargets);

    // turn-end to mafia
    for (const m of aliveMafia) {
      m.socket.emit('turn-end', {});
    }

    await pause(2000);
    await this.narrate(narration.mafiaClose);
    await pause(3000);

    // ─── Doctor turn ───
    const aliveDoctor = this.aliveByRole('doctor');
    if (aliveDoctor.length > 0) {
      await this.narrate(narration.doctorWake);

      const doctorTargets = this.alivePlayerNames();
      const doc = aliveDoctor[0];
      doc.socket.emit('your-turn', { role: 'doctor', players: doctorTargets });

      await this._collectDoctorAction(doc, doctorTargets);

      doc.socket.emit('turn-end', {});
      await this.narrate(narration.doctorClose);
      await pause(3000);
    }

    // ─── Detective turn ───
    const aliveDetective = this.aliveByRole('detective');
    if (aliveDetective.length > 0) {
      await this.narrate(narration.detectiveWake);

      const detectiveTargets = this.alivePlayers()
        .filter((p) => p.role !== 'detective')
        .map((p) => p.name);
      const det = aliveDetective[0];
      det.socket.emit('your-turn', { role: 'detective', players: detectiveTargets });

      await this._collectDetectiveAction(det, detectiveTargets);

      // Send investigate-result to detective ONLY (never narrated)
      const targetPlayer = this.playerByName(this.detectiveTarget);
      det.socket.emit('investigate-result', {
        target: this.detectiveTarget,
        isMafia: targetPlayer?.role === 'mafia',
      });

      await pause(3000);
      await this.narrate(narration.detectiveClose);
      det.socket.emit('turn-end', {});
      await pause(3000);
    }

    // ─── Resolve night ───
    this._resolveNight();
  }

  // Collect mafia night actions
  _collectMafiaActions(aliveMafia, targets) {
    return new Promise((resolve) => {
      const expected = aliveMafia.length;
      let received = 0;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        for (const m of aliveMafia) {
          m.socket.removeListener('night-action', m._nightHandler);
          delete m._nightHandler;
        }
        // Resolve mafia target via majority
        this.nightTarget = this._resolveMafiaTarget(targets);
        resolve();
      };

      for (const m of aliveMafia) {
        const handler = (payload) => {
          if (settled) return;
          if (!m.alive) return; // dead check
          if (payload && payload.target && targets.includes(payload.target)) {
            this.mafiaVotes[m.socket.id] = payload.target;
          }
          received++;
          if (received >= expected) finish();
        };
        m._nightHandler = handler;
        m.socket.on('night-action', handler);
      }

      const timer = setTimeout(() => {
        // Auto-random for mafia who didn't submit
        for (const m of aliveMafia) {
          if (!this.mafiaVotes[m.socket.id]) {
            this.mafiaVotes[m.socket.id] = randomFrom(targets);
          }
        }
        finish();
      }, 30000);
    });
  }

  _resolveMafiaTarget(targets) {
    const tally = {};
    for (const t of Object.values(this.mafiaVotes)) {
      tally[t] = (tally[t] || 0) + 1;
    }
    // Find majority target (or first with max votes if tie)
    let maxVotes = 0;
    let winner = null;
    for (const [name, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = name;
      }
    }
    return winner || randomFrom(targets);
  }

  // Collect doctor night action
  _collectDoctorAction(doc, targets) {
    return new Promise((resolve) => {
      // If doctor is a bot, pick after a short realistic delay (1.5s)
      if (doc.isBot) {
        setTimeout(() => {
          this.doctorTarget = randomFrom(targets);
          resolve();
        }, 1500);
        return;
      }

      let settled = false;
      let timer = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (handler) doc.socket.removeListener('night-action', handler);
        resolve();
      };

      const handler = (payload) => {
        if (settled) return;
        if (!doc.alive) return;
        if (payload && payload.target && targets.includes(payload.target)) {
          this.doctorTarget = payload.target;
        }
        finish();
      };

      doc.socket.on('night-action', handler);
      timer = setTimeout(() => {
        this.doctorTarget = randomFrom(targets);
        finish();
      }, 30000);
    });
  }

  // Collect detective night action
  _collectDetectiveAction(det, targets) {
    return new Promise((resolve) => {
      // If detective is a bot, pick after a short realistic delay (1.5s)
      if (det.isBot) {
        setTimeout(() => {
          this.detectiveTarget = randomFrom(targets);
          resolve();
        }, 1500);
        return;
      }

      let settled = false;
      let timer = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (handler) det.socket.removeListener('night-action', handler);
        resolve();
      };

      const handler = (payload) => {
        if (settled) return;
        if (!det.alive) return;
        if (payload && payload.target && targets.includes(payload.target)) {
          this.detectiveTarget = payload.target;
        }
        finish();
      };

      det.socket.on('night-action', handler);
      timer = setTimeout(() => {
        this.detectiveTarget = randomFrom(targets);
        finish();
      }, 30000);
    });
  }

  // ── Night Resolution ───────────────────────────────────────

  _resolveNight() {
    const saved = this.doctorTarget === this.nightTarget;
    const killed = saved ? null : this.nightTarget;
    const killedRole = killed ? this.playerByName(killed)?.role : null;

    if (killed) {
      const victim = this.playerByName(killed);
      if (victim) victim.alive = false;
    }

    // Transition to day
    this.runDay(killed, killedRole, saved);
  }

  // ── Day Phase ──────────────────────────────────────────────

  async runDay(killed, killedRole, saved) {
    this.state = STATE.DAY_ANNOUNCE;

    // 1. Narrate sunrise
    await this.narrate(narration.sunrise);
    await pause(2000);

    // 2–4. Announce death or miracle
    if (killed) {
      await this.narrate(narration.playerKilled(killed, killedRole));

      // Send you-died to victim
      const victimSocket = this.socketByName(killed);
      if (victimSocket) {
        victimSocket.emit('you-died', { killedBy: 'mafia' });
      }

      // Broadcast player-eliminated to all alive
      this.io.to(this.roomCode).emit('player-eliminated', {
        name: killed,
        role: killedRole,
      });
    } else {
      await this.narrate(narration.noOneDied);
    }

    // Send phase-day to all
    this.io.to(this.roomCode).emit('phase-day', {
      round: this.round,
      killed: killed || null,
      killedRole: killedRole || null,
      saved,
    });

    // 5. Check win
    if (this._checkWinCondition()) return;

    // 6–7. Discussion
    this.state = STATE.DISCUSSION;
    await this.narrate(narration.discussionStart);
    const discTime = this.testBots ? 10 : 60; // 10s for bot test mode, 60s for real game
    this.io.to(this.roomCode).emit('discussion', { duration: discTime });
    await pause(discTime * 1000);

    // 8–9. Voting
    this.state = STATE.VOTING;
    await this.narrate(narration.voteStart);

    const aliveNames = this.alivePlayerNames();
    this.votes = {};

    // Auto cast bot votes after 2s
    for (const p of this.alivePlayers()) {
      if (p.isBot) {
        setTimeout(() => {
          if (this.votes[p.socket.id] === undefined && p.alive) {
            // Bot votes for a random alive player (or skips)
            const pick = Math.random() < 0.2 ? null : randomFrom(aliveNames);
            this.votes[p.socket.id] = pick;
          }
        }, 1500);
      }
    }

    // Send vote-time to all alive players
    for (const p of this.alivePlayers()) {
      p.socket.emit('vote-time', { players: aliveNames });
    }

    await this._collectVotes();

    // Resolve votes
    this._resolveVotes();
  }

  // Collect votes from all alive players
  _collectVotes() {
    return new Promise((resolve) => {
      const aliveList = this.alivePlayers();
      const expected = aliveList.length;
      let received = 0;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        for (const p of aliveList) {
          if (p._voteHandler) {
            p.socket.removeListener('cast-vote', p._voteHandler);
            delete p._voteHandler;
          }
        }
        resolve();
      };

      for (const p of aliveList) {
        const handler = (payload) => {
          if (settled) return;
          if (!p.alive) return; // dead check
          if (this.votes[p.socket.id] !== undefined) return; // already voted

          const target = payload?.target || null;
          this.votes[p.socket.id] = target;
          received++;
          if (received >= expected) finish();
        };
        p._voteHandler = handler;
        p.socket.on('cast-vote', handler);
      }

      const timer = setTimeout(() => {
        // Auto-abstain for those who didn't vote
        for (const p of aliveList) {
          if (this.votes[p.socket.id] === undefined) {
            this.votes[p.socket.id] = null; // abstain
          }
        }
        finish();
      }, 30000);
    });
  }

  // ── Vote Resolution ────────────────────────────────────────

  async _resolveVotes() {
    // Build tally (skip null = abstain)
    const tally = {};
    const voteMap = {}; // playerName → target for result broadcast

    for (const [socketId, target] of Object.entries(this.votes)) {
      const voterName = this.players[socketId]?.name;
      if (voterName) voteMap[voterName] = target;
      if (target) {
        tally[target] = (tally[target] || 0) + 1;
      }
    }

    // Find majority
    let maxVotes = 0;
    let eliminated = null;
    let tied = false;

    for (const [name, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminated = name;
        tied = false;
      } else if (count === maxVotes) {
        tied = true;
      }
    }

    // Tie → no elimination
    if (tied || maxVotes === 0) eliminated = null;

    // Need strict majority (more than half of alive)
    const aliveCount = this.alivePlayers().length;
    if (eliminated && maxVotes <= aliveCount / 2) {
      eliminated = null;
    }

    if (eliminated) {
      const p = this.playerByName(eliminated);
      const role = p?.role || null;

      await this.narrate(narration.playerEliminated(eliminated, role));

      // Kill the player
      if (p) p.alive = false;

      // Broadcast vote-result
      this.io.to(this.roomCode).emit('vote-result', {
        eliminated,
        role,
        votes: voteMap,
      });

      // Send you-died to eliminated
      if (p) {
        p.socket.emit('you-died', { killedBy: 'voted' });
      }

      // Broadcast player-eliminated
      this.io.to(this.roomCode).emit('player-eliminated', {
        name: eliminated,
        role,
      });
    } else {
      await this.narrate(narration.noElimination);

      this.io.to(this.roomCode).emit('vote-result', {
        eliminated: null,
        role: null,
        votes: voteMap,
      });
    }

    // Check win condition
    if (this._checkWinCondition()) return;

    // Back to night
    this.runNight();
  }

  // ── Win Condition ──────────────────────────────────────────

  _checkWinCondition() {
    const aliveMafia = this.aliveByRole('mafia').length;
    const aliveNonMafia = this.alivePlayers().length - aliveMafia;

    if (aliveMafia === 0) {
      this._endGame('town');
      return true;
    }
    if (aliveMafia >= aliveNonMafia) {
      this._endGame('mafia');
      return true;
    }
    return false;
  }

  async _endGame(winner) {
    this.state = STATE.GAME_OVER;

    // Narrate
    if (winner === 'mafia') {
      await this.narrate(narration.mafiaWins);
    } else {
      await this.narrate(narration.townWins);
    }

    // Build roles reveal
    const roles = Object.values(this.players).map((p) => ({
      name: p.name,
      role: p.role,
      alive: p.alive,
    }));

    this.io.to(this.roomCode).emit('game-over', { winner, roles });
  }
}

module.exports = { Game, STATE };
