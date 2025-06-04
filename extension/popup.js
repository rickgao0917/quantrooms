// QuantRooms Popup Script

class QuantRoomsPopup {
  constructor() {
    this.init();
  }

  async init() {
    console.log('QuantRooms Popup: Initializing');
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Initialize connection status
    this.updateConnectionStatus();
    
    // Load user stats
    this.loadUserStats();
  }

  setupEventListeners() {
    document.getElementById('quickMatchBtn').addEventListener('click', () => {
      this.quickMatch();
    });
    
    document.getElementById('createRoomBtn').addEventListener('click', () => {
      this.createRoom();
    });
    
    document.getElementById('joinRoomBtn').addEventListener('click', () => {
      this.joinRoom();
    });
  }

  async updateConnectionStatus() {
    try {
      // Check connection to backend server
      const response = await this.sendMessageToBackground('CONNECT_TO_SERVER');
      
      const dot = document.getElementById('connectionDot');
      const status = document.getElementById('connectionStatus');
      
      if (response.connected) {
        dot.className = 'status-dot';
        status.textContent = 'Connected to server';
      } else {
        dot.className = 'status-dot disconnected';
        status.textContent = 'Server offline';
      }
    } catch (error) {
      console.error('Failed to check connection:', error);
      document.getElementById('connectionDot').className = 'status-dot disconnected';
      document.getElementById('connectionStatus').textContent = 'Connection failed';
    }
  }

  async loadUserStats() {
    try {
      // TODO: Load actual user stats from backend
      // For now, use stored values or defaults
      const result = await chrome.storage.sync.get(['userStats']);
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
      console.error('Failed to load user stats:', error);
    }
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

  async createRoom() {
    console.log('Create Room clicked');
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('quantguide.io')) {
        this.showNotification('Please navigate to QuantGuide.io first');
        return;
      }

      // TODO: Show room creation dialog
      const roomName = prompt('Enter room name:');
      if (!roomName) return;

      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { 
        type: 'CREATE_ROOM',
        roomName: roomName
      });
      
      this.showNotification('Creating room...');
      
    } catch (error) {
      console.error('Room creation failed:', error);
      this.showNotification('Failed to create room');
    }
  }

  async joinRoom() {
    console.log('Join Room clicked');
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('quantguide.io')) {
        this.showNotification('Please navigate to QuantGuide.io first');
        return;
      }

      // TODO: Show room browser or code input
      const roomCode = prompt('Enter room code:');
      if (!roomCode) return;

      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { 
        type: 'JOIN_ROOM',
        roomCode: roomCode
      });
      
      this.showNotification('Joining room...');
      
    } catch (error) {
      console.error('Join room failed:', error);
      this.showNotification('Failed to join room');
    }
  }

  showNotification(message) {
    // Simple notification in popup
    // TODO: Implement proper notification system
    console.log('Notification:', message);
    
    // Temporarily update status
    const status = document.getElementById('connectionStatus');
    const originalText = status.textContent;
    status.textContent = message;
    
    setTimeout(() => {
      status.textContent = originalText;
    }, 3000);
  }

  sendMessageToBackground(type, data = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new QuantRoomsPopup();
});