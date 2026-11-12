// index.js — Express + Socket.IO server, room management, static file serving

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const { Game } = require('./gameManager');

// ── Express + HTTP + Socket.IO ───────────────────────────────────

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Serve static files from ../public
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Room Storage ─────────────────────────────────────────────────

const rooms = {}; // roomCode → Game instance

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure uniqueness
  if (rooms[code]) return generateRoomCode();
  return code;
}

// ── Socket.IO Connection Handler ─────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ─── Create Room ───
  socket.on('create-room', ({ playerCount, hostName, testBots }) => {
    const count = parseInt(playerCount, 10);
    const name = (hostName || 'Host').trim();
    if (!count || count < 5 || count > 12) {
      socket.emit('join-error', { message: 'Player count must be between 5 and 12.' });
      return;
    }

    const roomCode = generateRoomCode();
    const game = new Game(roomCode, count, io, !!testBots);

    // Host joins automatically as first player with their chosen name
    game.addPlayer(socket, name, true);
    socket.data = { roomCode, isHost: true };

    rooms[roomCode] = game;

    socket.emit('room-created', { roomCode });
    game.broadcastPlayerCount();

    console.log(`[room] ${roomCode} created by ${name} (${socket.id}) for ${count} players (testBots: ${!!testBots})`);

    // If testBots requested, spawn 4 simulated bot players
    if (testBots) {
      const botNames = ['Bot Alex', 'Bot Sarah', 'Bot Mike', 'Bot Emma'];
      for (let i = 0; i < 4; i++) {
        game.addBotPlayer(botNames[i]);
      }
      game.broadcastPlayerCount();
      console.log(`[start] Starting bot test game in room ${roomCode}`);
      game.start();
    }
  });

  // ─── Join Room ───
  socket.on('join-room', ({ roomCode, playerName }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const name = (playerName || '').trim();

    if (!name) {
      socket.emit('join-error', { message: 'Please enter a name.' });
      return;
    }

    const game = rooms[code];
    if (!game) {
      socket.emit('join-error', { message: 'Room not found.' });
      return;
    }

    if (game.state !== 'LOBBY') {
      socket.emit('join-error', { message: 'Game already in progress.' });
      return;
    }

    if (game.getPlayerCount() >= game.totalPlayers) {
      socket.emit('join-error', { message: 'Room is full.' });
      return;
    }

    if (game.isNameTaken(name)) {
      socket.emit('join-error', { message: 'That name is already taken.' });
      return;
    }

    game.addPlayer(socket, name);
    socket.data = { roomCode: code, isHost: false };

    socket.emit('join-success', {});
    game.broadcastPlayerCount();

    console.log(`[join] ${name} → ${code} (${game.getPlayerCount()}/${game.totalPlayers})`);

    // Auto-start when full
    if (game.getPlayerCount() === game.totalPlayers) {
      console.log(`[start] Room ${code} is full — starting game!`);
      game.start();
    }
  });

  // ─── Night Action (forwarded to game logic) ───
  socket.on('night-action', (payload) => {
    const code = socket.data?.roomCode;
    const game = rooms[code];
    if (!game) return;

    // Dead players cannot submit actions
    if (!game.isAlive(socket.id)) return;

    // The action handlers are registered dynamically in gameManager.js
    // via socket.on inside the game — this is a fallback no-op.
  });

  // ─── Cast Vote ───
  socket.on('cast-vote', (payload) => {
    const code = socket.data?.roomCode;
    const game = rooms[code];
    if (!game) return;

    // Dead players cannot vote
    if (!game.isAlive(socket.id)) return;

    // Vote handlers are registered dynamically in gameManager.js
  });

  // ─── Disconnect ───
  socket.on('disconnect', () => {
    const code = socket.data?.roomCode;
    if (code && rooms[code]) {
      const game = rooms[code];
      const player = game.players[socket.id];
      if (player) {
        console.log(`[disconnect] ${player.name} left ${code}`);
        // During lobby, remove fully; during game, mark dead but keep
        if (game.state === 'LOBBY') {
          game.removePlayer(socket.id);
          game.broadcastPlayerCount();
          // Clean up empty rooms
          if (game.getPlayerCount() === 0) {
            delete rooms[code];
            console.log(`[room] ${code} destroyed (empty)`);
          }
        }
        // During game — player is just gone; their actions time out
      }
    }
    console.log(`[disconnect] ${socket.id}`);
  });
});

// ── Start Server ─────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎭  MAFIA server running on port ${PORT}`);
  console.log(`    Local:   http://localhost:${PORT}`);

  // Print LAN IP so players know where to connect
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`    Network: http://${net.address}:${PORT}`);
      }
    }
  }
  console.log('');
});
