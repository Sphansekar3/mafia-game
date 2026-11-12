# 🎭 MAFIA: Voice Narrator Party Game

A real-time, browser-based Mafia game with an **AI/Voice Narrator** built for in-person house parties.
No app installs required. Everyone plays on their own phone browser, and the **Host's phone acts as the speaking Narrator/God** so everyone can participate!

---

## 🚀 How to Run for the Party

### 1. Start the Server on your Laptop
Make sure your laptop and all phones are connected to the **same Wi-Fi network**.

Open your terminal or PowerShell in this project folder:
```bash
cd c:\Users\hp\Desktop\Shreyas\MAFIA\server
npm start
```

When started, the terminal will print something like:
```text
🎭  MAFIA server running on port 3000
    Local:   http://localhost:3000
    Network: http://192.168.1.15:3000
```

### 2. Everyone Joins from their Phone Browser
- **Host**: Opens `http://<your-network-ip>:3000` on their phone (or connects phone audio to a Bluetooth speaker so everyone can hear the narrator loud and clear!).
  - Enters their **Name**
  - Sets the **Total Player Count** (e.g. 6 to 12)
  - Taps **Create Room**
  - Reads out the 4-letter **Room Code** to friends.
- **Friends**:
  - Open `http://<your-network-ip>:3000` on their phone browsers
  - Enter the **Room Code** and their **Name**
  - Tap **Join Room**

### 3. Automatic Start & Anonymity
- Nobody sees anyone else's role (not even the host).
- As soon as the room reaches the specified player count, the game **automatically starts**.
- Each player's phone vibrates/reveals their secret role:
  - 🔪 **Mafia** (Mafia members also see each other's names on their screen)
  - 💉 **Doctor**
  - 🔍 **Detective**
  - 👤 **Civilian**

---

## 🌙 How Game Flow Works

1. **Night Phase**:
   - Host's phone narrates: *"Night falls over the town. Everyone, close your eyes and sleep."*
   - *"Mafia, open your eyes. Choose your victim wisely."* (Mafia's phone lights up with alive targets).
   - *"Doctor, open your eyes. Choose someone to protect."* (Doctor selects target).
   - *"Detective, open your eyes. Point at someone to investigate."* (Detective selects target; result is shown **privately** on the Detective's phone screen only!).
2. **Day Phase**:
   - Host's phone narrates the sunrise and announces who was killed (or if the doctor saved them!).
   - A 60-second discussion timer runs for real-life debate.
3. **Voting Phase**:
   - Everyone votes on their screen or skips.
   - If a majority is reached, the eliminated player's role is announced, and their screen locks with a ghost/dead overlay.
4. **Game Over**:
   - When Town eliminates all Mafia or Mafia matches Town numbers, the Narrator announces the winning team and the full roster of roles is revealed.
