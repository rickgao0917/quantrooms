// QuantRooms Popup Script

class QuantRoomsPopup {
  constructor() {
    this.currentRoom = null;
    this.userName = null;
    this.init();
  }

  async init() {
    console.log('QuantRooms Popup: Initializing');
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Initialize connection status
    await this.updateConnectionStatus();
    
    // Load user data
    await this.loadUserData();
    
    // Listen for updates from background script
    this.listenForUpdates();
    
    // Load rooms if connected
    await this.loadRooms();
  }

  setupEventListeners() {
    document.getElementById('quickMatchBtn')?.addEventListener('click', () => {
      this.quickMatch();
    });
    
    document.getElementById('createRoomBtn')?.addEventListener('click', () => {
      this.showCreateRoomUI();
    });
    
    document.getElementById('joinRoomBtn')?.addEventListener('click', () => {
      this.showJoinRoomUI();
    });
  }

  listenForUpdates() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message) => {
      switch (message.type) {
        case 'ROOM_CREATED':
          this.onRoomCreated(message.room);
          break;
        case 'ROOM_JOINED':
          this.onRoomJoined(message.room);
          break;
        case 'ROOM_LIST_UPDATED':
          this.updateRoomList(message.rooms);
          break;
        case 'PLAYER_JOINED':
          this.onPlayerJoined(message.player, message.room);
          break;
        case 'PLAYER_LEFT':
          this.onPlayerLeft(message.playerId, message.room);
          break;
        case 'DISCONNECTED':
          this.onDisconnected();
          break;
        case 'SOCKET_ERROR':
          this.showNotification(`Error: ${message.error}`, 'error');
          break;
      }
    });
  }

  async updateConnectionStatus() {
    try {
      // First check current connection status
      const statusResponse = await this.sendMessageToBackground('GET_CONNECTION_STATUS');
      
      if (!statusResponse.connected) {
        // Try to connect if not already connected
        const connectResponse = await this.sendMessageToBackground('CONNECT_TO_SERVER');
        this.updateConnectionUI(connectResponse.success);
      } else {
        this.updateConnectionUI(true);
        this.currentRoom = statusResponse.currentRoom;
      }
    } catch (error) {
      console.error('Failed to check connection:', error);
      this.updateConnectionUI(false);
    }
  }

  updateConnectionUI(connected) {
    const dot = document.getElementById('connectionDot');
    const status = document.getElementById('connectionStatus');
    
    if (connected) {
      dot.className = 'status-dot';
      status.textContent = 'Connected to server';
    } else {
      dot.className = 'status-dot disconnected';
      status.textContent = 'Server offline';
    }
  }

  async loadUserData() {
    try {
      const result = await chrome.storage.sync.get(['userName', 'userStats']);
      
      // Load or create username
      if (!result.userName) {
        this.userName = await this.promptForUserName();
      } else {
        this.userName = result.userName;
      }
      
      // Load stats
      const stats = result.userStats || {
        eloRating: 1200,
        gamesPlayed: 0,
        wins: 0
      };

      document.getElementById('eloRating').textContent = stats.eloRating;
      document.getElementById('gamesPlayed').textContent = stats.gamesPlayed;
      
      const winRate = stats.gamesPlayed > 0 ? 
        Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
      document.getElementById('winRate').textContent = winRate + '%';
      
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }

  async promptForUserName() {
    const userName = prompt('Enter your username:') || 'Player' + Math.floor(Math.random() * 1000);
    await chrome.storage.sync.set({ userName });
    await this.sendMessageToBackground('SET_USER_NAME', { userName });
    return userName;
  }

  async quickMatch() {
    console.log('Quick Match clicked');
    
    try {
      // Check if we're on QuantGuide.io
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('quantguide.io')) {
        this.showNotification('Please navigate to QuantGuide.io first');
        return;
      }

      // TODO: Implement quick match logic
      this.showNotification('Finding a match...');
      
      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { 
        type: 'START_QUICK_MATCH' 
      });
      
    } catch (error) {
      console.error('Quick match failed:', error);
      this.showNotification('Failed to start quick match');
    }
  }

  showCreateRoomUI() {
    // Update UI to show room creation form
    const mainContent = document.querySelector('.button-group').parentElement;
    mainContent.innerHTML = `
      <div class="create-room-form">
        <h3>Create New Room</h3>
        <input type="text" id="roomNameInput" placeholder="Room name" class="input-field" value="Room ${Math.floor(Math.random() * 1000)}">
        <select id="maxPlayersSelect" class="input-field">
          <option value="2">2 Players</option>
          <option value="4" selected>4 Players</option>
          <option value="6">6 Players</option>
          <option value="8">8 Players</option>
        </select>
        <select id="difficultySelect" class="input-field">
          <option value="Easy">Easy</option>
          <option value="Medium" selected>Medium</option>
          <option value="Hard">Hard</option>
        </select>
        <div class="button-group">
          <button id="confirmCreateBtn" class="primary-button">Create Room</button>
          <button id="cancelCreateBtn" class="secondary-button">Cancel</button>
        </div>
      </div>
    `;
    
    document.getElementById('confirmCreateBtn').addEventListener('click', () => this.createRoom());
    document.getElementById('cancelCreateBtn').addEventListener('click', () => this.resetUI());
  }
  
  async createRoom() {
    const roomName = document.getElementById('roomNameInput').value.trim();
    const maxPlayers = parseInt(document.getElementById('maxPlayersSelect').value);
    const difficulty = document.getElementById('difficultySelect').value;
    
    if (!roomName) {
      this.showNotification('Please enter a room name', 'error');
      return;
    }
    
    try {
      const response = await this.sendMessageToBackground('CREATE_ROOM', {
        data: { roomName, maxPlayers, difficulty, userName: this.userName }
      });
      
      if (response.success) {
        this.showNotification('Room created successfully!');
      } else {
        this.showNotification(response.error || 'Failed to create room', 'error');
      }
    } catch (error) {
      console.error('Room creation failed:', error);
      this.showNotification('Failed to create room', 'error');
    }
  }

  showJoinRoomUI() {
    // Show room list or join by code
    const mainContent = document.querySelector('.button-group').parentElement;
    mainContent.innerHTML = `
      <div class="join-room-form">
        <h3>Join Room</h3>
        <input type="text" id="roomCodeInput" placeholder="Enter room code" class="input-field">
        <div class="button-group">
          <button id="confirmJoinBtn" class="primary-button">Join Room</button>
          <button id="browseRoomsBtn" class="secondary-button">Browse Rooms</button>
          <button id="cancelJoinBtn" class="secondary-button">Cancel</button>
        </div>
        <div id="roomsList" class="rooms-list"></div>
      </div>
    `;
    
    document.getElementById('confirmJoinBtn').addEventListener('click', () => this.joinRoomByCode());
    document.getElementById('browseRoomsBtn').addEventListener('click', () => this.loadRooms());
    document.getElementById('cancelJoinBtn').addEventListener('click', () => this.resetUI());
  }
  
  async joinRoomByCode() {
    const roomCode = document.getElementById('roomCodeInput').value.trim();
    
    if (!roomCode) {
      this.showNotification('Please enter a room code', 'error');
      return;
    }
    
    try {
      const response = await this.sendMessageToBackground('JOIN_ROOM', {
        data: { roomId: roomCode, userName: this.userName }
      });
      
      if (response.success) {
        this.showNotification('Joined room successfully!');
      } else {
        this.showNotification(response.error || 'Failed to join room', 'error');
      }
    } catch (error) {
      console.error('Join room failed:', error);
      this.showNotification('Failed to join room', 'error');
    }
  }
  
  async loadRooms() {
    try {
      const response = await this.sendMessageToBackground('GET_ACTIVE_ROOMS');
      const rooms = response.rooms || [];
      this.updateRoomList(rooms);
    } catch (error) {
      console.error('Failed to load rooms:', error);
    }
  }
  
  updateRoomList(rooms) {
    const roomsList = document.getElementById('roomsList');
    if (!roomsList) return;
    
    if (rooms.length === 0) {
      roomsList.innerHTML = '<p class="no-rooms">No active rooms</p>';
    } else {
      roomsList.innerHTML = rooms.map(room => `
        <div class="room-item" data-room-id="${room.id}">
          <div class="room-info">
            <strong>${room.name}</strong>
            <span class="room-players">${room.playerCount}/${room.maxPlayers} players</span>
          </div>
          <button class="join-button" data-room-id="${room.id}">Join</button>
        </div>
      `).join('');
      
      // Add click handlers
      roomsList.querySelectorAll('.join-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const roomId = e.target.getAttribute('data-room-id');
          this.joinRoom(roomId);
        });
      });
    }
  }
  
  async joinRoom(roomId) {
    try {
      const response = await this.sendMessageToBackground('JOIN_ROOM', {
        data: { roomId, userName: this.userName }
      });
      
      if (response.success) {
        this.showNotification('Joined room successfully!');
      } else {
        this.showNotification(response.error || 'Failed to join room', 'error');
      }
    } catch (error) {
      console.error('Join room failed:', error);
      this.showNotification('Failed to join room', 'error');
    }
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: ${type === 'error' ? '#EF4444' : '#4F46E5'};
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
  
  onRoomCreated(room) {
    this.currentRoom = room;
    this.showRoomUI(room);
  }
  
  onRoomJoined(room) {
    this.currentRoom = room;
    this.showRoomUI(room);
  }
  
  onPlayerJoined(player, room) {
    this.currentRoom = room;
    if (this.currentRoom) {
      this.updateRoomUI(room);
    }
  }
  
  onPlayerLeft(playerId, room) {
    this.currentRoom = room;
    if (this.currentRoom) {
      this.updateRoomUI(room);
    }
  }
  
  onDisconnected() {
    this.currentRoom = null;
    this.updateConnectionUI(false);
    this.resetUI();
  }
  
  showRoomUI(room) {
    const mainContent = document.querySelector('.button-group').parentElement;
    mainContent.innerHTML = `
      <div class="room-view">
        <h3>Room: ${room.name}</h3>
        <p class="room-code">Code: <strong>${room.id}</strong></p>
        <div class="players-list">
          <h4>Players (${room.playerCount}/${room.maxPlayers})</h4>
          ${room.players.map(player => `
            <div class="player-item">
              ${player.name} ${player.isHost ? '(Host)' : ''}
            </div>
          `).join('')}
        </div>
        <button id="leaveRoomBtn" class="secondary-button">Leave Room</button>
      </div>
    `;
    
    document.getElementById('leaveRoomBtn').addEventListener('click', () => this.leaveRoom());
  }
  
  updateRoomUI(room) {
    const playersList = document.querySelector('.players-list');
    if (playersList) {
      playersList.innerHTML = `
        <h4>Players (${room.playerCount}/${room.maxPlayers})</h4>
        ${room.players.map(player => `
          <div class="player-item">
            ${player.name} ${player.isHost ? '(Host)' : ''}
          </div>
        `).join('')}
      `;
    }
  }
  
  async leaveRoom() {
    try {
      const response = await this.sendMessageToBackground('LEAVE_ROOM');
      if (response.success) {
        this.currentRoom = null;
        this.resetUI();
        this.showNotification('Left room');
      }
    } catch (error) {
      console.error('Failed to leave room:', error);
    }
  }
  
  resetUI() {
    // Reload the popup to reset UI
    window.location.reload();
  }

  sendMessageToBackground(type, data = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response || {});
        }
      });
    });
  }
  
  async quickMatch() {
    // For quick match, we'll create a room with default settings
    try {
      const response = await this.sendMessageToBackground('CREATE_ROOM', {
        data: {
          roomName: `Quick Match ${Math.floor(Math.random() * 1000)}`,
          maxPlayers: 4,
          difficulty: 'Medium',
          userName: this.userName
        }
      });
      
      if (response.success) {
        this.showNotification('Quick match room created!');
      } else {
        this.showNotification(response.error || 'Failed to create quick match', 'error');
      }
    } catch (error) {
      console.error('Quick match failed:', error);
      this.showNotification('Failed to start quick match', 'error');
    }
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new QuantRoomsPopup();
});