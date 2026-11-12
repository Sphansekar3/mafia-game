// test-sim.js — Simulate 5 players playing via socket.io-client
const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

async function runTest() {
  console.log('Connecting host socket...');
  const host = io(SERVER_URL);

  host.on('connect', () => {
    console.log('Host connected! Creating room for 5 players...');
    host.emit('create-room', { playerCount: 5, hostName: 'HostPlayer' });
  });

  host.on('room-created', async ({ roomCode }) => {
    console.log('Room created successfully with code:', roomCode);

    // Host listens for narration
    host.on('narrate', ({ text, id }) => {
      console.log(`[🔊 NARRATOR]: "${text}" (id: ${id})`);
      setTimeout(() => {
        host.emit('narration-done', { id });
      }, 500); // simulate quick speech
    });

    // Create 4 more players
    const names = ['Alice', 'Bob', 'Charlie', 'Dave'];
    const clients = [host];

    for (const name of names) {
      const p = io(SERVER_URL);
      clients.push(p);
      p.on('connect', () => {
        p.emit('join-room', { roomCode, playerName: name });
      });
      p.on('join-success', () => {
        console.log(`✅ ${name} joined!`);
      });
      p.on('join-error', (err) => {
        console.error(`❌ ${name} join error:`, err);
      });
    }

    // Role assignments check
    let rolesAssigned = 0;
    clients.forEach((c, idx) => {
      const pName = idx === 0 ? 'HostPlayer' : names[idx - 1];
      c.on('role-assigned', (data) => {
        rolesAssigned++;
        console.log(`🎭 ${pName} assigned role: ${data.role}`, data.mafiaTeam ? `(Team: ${data.mafiaTeam.join(', ')})` : '');
        if (rolesAssigned === 5) {
          console.log('🎉 ALL 5 PLAYERS ASSIGNED ROLES!');
        }
      });

      c.on('phase-night', ({ round }) => {
        console.log(`🌙 Night round ${round} started.`);
      });

      c.on('your-turn', ({ role, players }) => {
        console.log(`👉 Turn for role ${role} (targets available: ${players.join(', ')})`);
        // Pick first target
        setTimeout(() => {
          c.emit('night-action', { target: players[0] });
          console.log(`🎯 ${pName} (${role}) picked target: ${players[0]}`);
        }, 500);
      });

      c.on('phase-day', (data) => {
        console.log('☀️ Day started! Outcome:', data);
        console.log('Simulation check passed! Cleaning up...');
        clients.forEach(cl => cl.disconnect());
        process.exit(0);
      });
    });
  });
}

runTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
