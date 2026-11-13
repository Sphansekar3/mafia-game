/**
 * app.js — Main controller for the Mafia client
 *
 * Handles Socket.IO events, screen switching, all game UI logic.
 */

(function () {
  'use strict';

  // ──── Local State ────
  let isHost = false;
  let myRole = null;
  let isDead = false;
  let roomCode = null;
  let myName = null;
  let discussionInterval = null;

  // Session persistence helpers
  function saveSession(code, name, hostStatus) {
    sessionStorage.setItem('mafia_session', JSON.stringify({ roomCode: code, playerName: name, isHost: hostStatus }));
    $('#reconnect-bar').hidden = false;
  }

  function clearSession() {
    sessionStorage.removeItem('mafia_session');
    $('#reconnect-bar').hidden = true;
  }

  function getSavedSession() {
    try {
      const raw = sessionStorage.getItem('mafia_session');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  // ──── Socket.IO ────
  const socket = io();

  // ──── DOM Helpers ────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Screens
  const screens = {
    home: $('#screen-home'),
    waiting: $('#screen-waiting'),
    role: $('#screen-role'),
    night: $('#screen-night'),
    day: $('#screen-day'),
    vote: $('#screen-vote'),
    gameover: $('#screen-gameover'),
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (screens[name]) screens[name].classList.add('active');
  }

  // ──── Initialise Narrator ────
  narrator.init();

  // ════════════════════════════════════════════
  //  HOME SCREEN
  // ════════════════════════════════════════════

  $('#btn-create').addEventListener('click', () => {
    narrator.unlockAudio();
    if (typeof soundManager !== 'undefined') soundManager.init();
    const hostName = ($('#input-host-name')?.value || '').trim();
    if (!hostName) {
      showError('Please enter your name');
      return;
    }
    const count = parseInt($('#input-player-count').value, 10);
    if (isNaN(count) || count < 5 || count > 12) {
      showError('Player count must be between 5 and 12');
      return;
    }
    hideError();
    isHost = true;
    myName = hostName;
    socket.emit('create-room', { playerCount: count, hostName });
  });

  $('#btn-test-bots').addEventListener('click', () => {
    narrator.unlockAudio();
    if (typeof soundManager !== 'undefined') soundManager.init();
    const hostName = ($('#input-host-name')?.value || 'You').trim();
    hideError();
    isHost = true;
    myName = hostName;
    socket.emit('create-room', { playerCount: 5, hostName, testBots: true });
  });

  $('#btn-join').addEventListener('click', () => {
    narrator.unlockAudio();
    if (typeof soundManager !== 'undefined') soundManager.init();
    const code = $('#input-room-code').value.trim().toUpperCase();
    const name = $('#input-player-name').value.trim();
    if (!code) { showError('Enter a room code'); return; }
    if (!name) { showError('Enter your name'); return; }
    hideError();
    myName = name;
    socket.emit('join-room', { roomCode: code, playerName: name });
  });

  $('#btn-reconnect')?.addEventListener('click', () => {
    narrator.unlockAudio();
    const saved = getSavedSession();
    if (saved && saved.roomCode && saved.playerName) {
      socket.emit('reconnect-player', { roomCode: saved.roomCode, playerName: saved.playerName });
    }
  });

  function showError(msg) {
    const el = $('#home-error');
    el.textContent = msg;
    el.hidden = false;
  }
  function hideError() {
    $('#home-error').hidden = true;
  }

  // ════════════════════════════════════════════
  //  ROOM MANAGEMENT EVENTS
  // ════════════════════════════════════════════

  socket.on('room-created', (data) => {
    roomCode = data.roomCode;
    saveSession(roomCode, myName, isHost);
    $('#waiting-title').textContent = 'Waiting for players…';
    const codeDisplay = $('#room-code-display');
    codeDisplay.hidden = false;
    $('#room-code-value').textContent = roomCode;
    showScreen('waiting');
  });

  socket.on('join-success', () => {
    saveSession($('#input-room-code').value.trim().toUpperCase(), myName, isHost);
    $('#waiting-title').textContent = 'Joined!';
    $('#room-code-display').hidden = true;
    showScreen('waiting');
  });

  socket.on('join-error', (data) => {
    showError(data.message || 'Could not join room');
  });

  // ─── Reconnection Handlers ───
  socket.on('connect', () => {
    // If we have an active session, auto-reconnect on socket disconnect/reload
    const saved = getSavedSession();
    if (saved && saved.roomCode && saved.playerName) {
      $('#reconnect-bar').hidden = false;
      socket.emit('reconnect-player', { roomCode: saved.roomCode, playerName: saved.playerName });
    }
  });

  socket.on('reconnect-success', (sync) => {
    console.log('[reconnect] Restored state:', sync);
    roomCode = sync.roomCode;
    isHost = sync.isHost;
    myRole = sync.role;
    isDead = !sync.alive;

    if (isDead) {
      $('#dead-overlay').hidden = false;
    } else {
      $('#dead-overlay').hidden = true;
    }

    if (sync.state === 'LOBBY') {
      $('#waiting-title').textContent = isHost ? 'Waiting for players…' : 'Joined!';
      $('#player-count-current').textContent = sync.currentCount;
      $('#player-count-total').textContent = sync.totalPlayers;
      if (isHost) {
        $('#room-code-display').hidden = false;
        $('#room-code-value').textContent = roomCode;
      }
      showScreen('waiting');
    } else if (sync.state === 'NIGHT') {
      showScreen('night');
    } else if (sync.state === 'DISCUSSION') {
      showScreen('day');
    } else if (sync.state === 'VOTING') {
      if (!isDead && sync.alivePlayers) {
        renderVoteList(sync.alivePlayers);
      }
      showScreen('vote');
    } else if (sync.state === 'GAME_OVER') {
      showScreen('gameover');
    } else {
      showScreen('day');
    }
  });

  socket.on('reconnect-failed', (_err) => {
    clearSession();
  });

  socket.on('player-count-update', (data) => {
    $('#player-count-current').textContent = data.current;
    $('#player-count-total').textContent = data.total;
  });

  // ════════════════════════════════════════════
  //  ROLE ASSIGNMENT
  // ════════════════════════════════════════════

  const ROLE_META = {
    mafia:     { emoji: '🔪', label: 'THE MAFIA' },
    doctor:    { emoji: '💉', label: 'THE DOCTOR' },
    detective: { emoji: '🔍', label: 'THE DETECTIVE' },
    civilian:  { emoji: '🏘️', label: 'A CIVILIAN' },
  };

  socket.on('role-assigned', (data) => {
    myRole = data.role;
    const meta = ROLE_META[myRole] || { emoji: '❓', label: myRole.toUpperCase() };

    $('#role-emoji').textContent = meta.emoji;
    const nameEl = $('#role-name');
    nameEl.textContent = meta.label;
    nameEl.className = 'role-name ' + myRole;

    // Mafia team info
    const teamEl = $('#role-team');
    if (myRole === 'mafia' && data.mafiaTeam && data.mafiaTeam.length > 1) {
      teamEl.textContent = 'Your team: ' + data.mafiaTeam.join(', ');
      teamEl.hidden = false;
    } else {
      teamEl.hidden = true;
    }

    showScreen('role');

    // Auto-transition out after 5 seconds (server will send next phase)
    // We just keep showing role until a phase event arrives
  });

  // ════════════════════════════════════════════
  //  NARRATION (host only)
  // ════════════════════════════════════════════

  socket.on('narrate', async (data) => {
    if (!isHost) return;
    try {
      await narrator.speak(data.text, data.id, data.audioUrl);
    } catch (_) { /* handled inside narrator */ }
    socket.emit('narration-done', { id: data.id });
  });

  // ════════════════════════════════════════════
  //  NIGHT PHASE
  // ════════════════════════════════════════════

  socket.on('phase-night', (_data) => {
    // Reset night UI
    $('#night-action-ui').hidden = true;
    $('#night-player-list').innerHTML = '';
    $('#night-text').textContent = 'The night is quiet…';
    showScreen('night');

    // Atmospheric night ambient drone on host device
    if (isHost && typeof soundManager !== 'undefined') {
      soundManager.startNightAmbience();
    }
  });

  socket.on('your-turn', (data) => {
    if (isDead) return;

    // Build role-specific prompt
    const prompts = {
      mafia: 'Choose your victim',
      doctor: 'Choose someone to protect',
      detective: 'Choose someone to investigate',
    };
    $('#night-action-title').textContent = prompts[data.role] || 'Choose your target';
    $('#night-text').textContent = '';

    // Populate player buttons
    const list = $('#night-player-list');
    list.innerHTML = '';
    data.players.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'player-btn';
      btn.textContent = name;
      btn.addEventListener('click', () => {
        if (isDead) return;
        // Highlight selection and emit
        list.querySelectorAll('.player-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        // Emit immediately on tap
        socket.emit('night-action', { target: name });
        // Disable further taps
        list.querySelectorAll('.player-btn').forEach(b => { b.disabled = true; });
        $('#night-action-title').textContent = 'Waiting…';
      });
      list.appendChild(btn);
    });

    $('#night-action-ui').hidden = false;
  });

  socket.on('turn-end', () => {
    $('#night-action-ui').hidden = true;
    $('#night-player-list').innerHTML = '';
    $('#night-text').textContent = 'The night is quiet…';
  });

  socket.on('investigate-result', (data) => {
    // Detective only — show as a toast overlay
    const toast = $('#investigate-toast');
    const text = $('#investigate-text');
    if (data.isMafia) {
      text.innerHTML = `<strong>${data.target}</strong> is <span style="color:#c0392b;font-weight:700">MAFIA</span> 🔪`;
    } else {
      text.innerHTML = `<strong>${data.target}</strong> is <span style="color:#27ae60;font-weight:700">NOT MAFIA</span> ✓`;
    }
    toast.hidden = false;

    // Auto-dismiss after 5 seconds
    setTimeout(() => { toast.hidden = true; }, 5000);
  });

  // ════════════════════════════════════════════
  //  DAY PHASE
  // ════════════════════════════════════════════

  socket.on('phase-day', (data) => {
    // Stop night ambience on sunrise
    if (isHost && typeof soundManager !== 'undefined') {
      soundManager.stopNightAmbience();
    }

    const ann = $('#day-announcement');

    if (data.killed) {
      if (data.saved) {
        ann.innerHTML = `<span class="saved-text">It's a miracle!</span> No one died last night. The doctor saved a life!`;
        if (isHost && typeof soundManager !== 'undefined') soundManager.playMiracleChime();
      } else {
        ann.innerHTML = `<span class="death-name">${data.killed}</span> was found dead this morning.<br>They were a <strong>${data.killedRole}</strong>.`;
        if (isHost && typeof soundManager !== 'undefined') soundManager.playDeathHit();
      }
    } else {
      ann.innerHTML = `<span class="saved-text">It's a miracle!</span> No one died last night!`;
      if (isHost && typeof soundManager !== 'undefined') soundManager.playMiracleChime();
    }

    // If killed is null, no one targeted / miracle
    // If killed is present but saved is true, doctor saved
    // The server sends killed=null when saved, so handle both patterns:
    if (!data.killed && !data.saved) {
      ann.innerHTML = `<span class="saved-text">It's a miracle!</span> No one died last night!`;
    }

    $('#discussion-timer').hidden = true;
    showScreen('day');
  });

  socket.on('discussion', (data) => {
    const timerEl = $('#discussion-timer');
    timerEl.hidden = false;
    let remaining = data.duration;
    const valueEl = $('#timer-value');
    valueEl.textContent = remaining;
    valueEl.classList.remove('urgent');

    if (discussionInterval) clearInterval(discussionInterval);
    discussionInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(discussionInterval);
        discussionInterval = null;
        valueEl.textContent = '0';
        return;
      }
      valueEl.textContent = remaining;
      if (remaining <= 10) valueEl.classList.add('urgent');
    }, 1000);
  });

  // ════════════════════════════════════════════
  //  VOTE PHASE
  // ════════════════════════════════════════════

  socket.on('vote-time', (data) => {
    if (discussionInterval) { clearInterval(discussionInterval); discussionInterval = null; }

    const list = $('#vote-player-list');
    list.innerHTML = '';
    const waitingEl = $('#vote-waiting');
    const resultEl = $('#vote-result-display');
    waitingEl.hidden = true;
    resultEl.hidden = true;
    $('#btn-skip-vote').hidden = false;
    $('#btn-skip-vote').disabled = false;

    if (isDead) {
      // Dead players can see but not interact
      data.players.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'player-btn';
        btn.textContent = name;
        btn.disabled = true;
        list.appendChild(btn);
      });
      $('#btn-skip-vote').disabled = true;
      waitingEl.hidden = false;
    } else {
      data.players.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'player-btn';
        btn.textContent = name;
        btn.addEventListener('click', () => {
          castVote(name, list);
        });
        list.appendChild(btn);
      });
    }

    showScreen('vote');
  });

  // Skip vote button
  $('#btn-skip-vote').addEventListener('click', () => {
    if (isDead) return;
    castVote(null, $('#vote-player-list'));
  });

  function castVote(target, list) {
    socket.emit('cast-vote', { target });
    // Disable all vote buttons
    list.querySelectorAll('.player-btn').forEach(b => { b.disabled = true; });
    $('#btn-skip-vote').disabled = true;
    // If a player was selected, highlight it
    if (target) {
      list.querySelectorAll('.player-btn').forEach(b => {
        if (b.textContent === target) b.classList.add('selected');
      });
    }
    $('#vote-waiting').hidden = false;
  }

  socket.on('vote-result', (data) => {
    const resultEl = $('#vote-result-display');
    const textEl = $('#vote-result-text');
    $('#vote-waiting').hidden = true;

    if (data.eliminated) {
      textEl.innerHTML = `<span style="color:#c0392b;font-weight:700">${data.eliminated}</span> has been eliminated!<br>They were a <strong>${data.role}</strong>.`;
      if (isHost && typeof soundManager !== 'undefined') {
        soundManager.playGavelStrike();
      }
    } else {
      textEl.innerHTML = 'The town could not reach a decision.<br>No one is eliminated.';
    }

    resultEl.hidden = false;
  });

  // ════════════════════════════════════════════
  //  PLAYER STATE
  // ════════════════════════════════════════════

  socket.on('you-died', (_data) => {
    isDead = true;
    $('#dead-overlay').hidden = false;
  });

  socket.on('player-eliminated', (_data) => {
    // Informational broadcast — the day announcement / vote result handles display
  });

  // ════════════════════════════════════════════
  //  GAME OVER
  // ════════════════════════════════════════════

  socket.on('game-over', (data) => {
    if (discussionInterval) { clearInterval(discussionInterval); discussionInterval = null; }

    const titleEl = $('#gameover-title');
    const subEl = $('#gameover-subtitle');

    if (data.winner === 'mafia') {
      titleEl.textContent = '🔪 MAFIA WINS';
      titleEl.className = 'gameover-title mafia-wins';
      subEl.textContent = 'The town has fallen to darkness.';
      if (isHost && typeof soundManager !== 'undefined') soundManager.playMafiaVictory();
    } else {
      titleEl.textContent = '🏘️ TOWN WINS';
      titleEl.className = 'gameover-title town-wins';
      subEl.textContent = 'Justice has prevailed!';
      if (isHost && typeof soundManager !== 'undefined') soundManager.playTownVictory();
    }

    // Build reveal table
    const tbody = $('#reveal-table-body');
    tbody.innerHTML = '';
    data.roles.forEach(p => {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.textContent = p.name;
      tr.appendChild(tdName);

      const tdRole = document.createElement('td');
      tdRole.textContent = p.role.charAt(0).toUpperCase() + p.role.slice(1);
      tdRole.className = 'role-' + p.role;
      tr.appendChild(tdRole);

      const tdStatus = document.createElement('td');
      tdStatus.textContent = p.alive ? 'Alive' : 'Dead';
      tdStatus.className = p.alive ? 'status-alive' : 'status-dead';
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });

    showScreen('gameover');
  });

  // ════════════════════════════════════════════
  //  PLAY AGAIN
  // ════════════════════════════════════════════

  $('#btn-play-again').addEventListener('click', () => {
    clearSession();
    // Reset all local state
    isHost = false;
    myRole = null;
    isDead = false;
    roomCode = null;
    myName = null;
    $('#dead-overlay').hidden = true;
    $('#home-error').hidden = true;
    $('#input-room-code').value = '';
    $('#input-player-name').value = '';
    showScreen('home');
  });

})();
