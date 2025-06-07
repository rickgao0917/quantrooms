// QuantRooms Background Service Worker - Phase 2
// Handles authentication and persistent connections

// Import Socket.io client library
importScripts('socket.io.min.js');

const API_BASE_URL = 'http://localhost:3000';
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'quantrooms_access_token',
  REFRESH_TOKEN: 'quantrooms_refresh_token',
  USER_DATA: 'quantrooms_user_data'
};

class QuantRoomsBackground {
  constructor() {
    this.socket = null;
    this.authToken = null;
    this.currentUser = null;
    this.currentRoom = null;
    this.activeGame = null;
    this.connectionRetries = 0;
    this.maxRetries = 5;
    this.init();
  }

  async init() {
    console.log('QuantRooms: Background script initialized');
    
    // Handle extension installation
    chrome.runtime.onInstalled.addListener(() => {
      this.onInstalled();
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Handle tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.onTabUpdated(tabId, changeInfo, tab);
    });

    // Handle alarm for token refresh
    chrome.alarms.create('refreshToken', { periodInMinutes: 360 }); // 6 hours
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'refreshToken') {
        this.refreshAuthToken();
      }
    });

    // Check auth status on startup
    await this.checkAuthStatus();
  }

  onInstalled() {
    console.log('QuantRooms: Extension installed');
    
    // Set default settings
    chrome.storage.sync.set({
      settings: {
        notifications: true,
        autoJoinRooms: false,
        preferredDifficulty: 'Medium'
      }
    });
  }

  async handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'CHECK_AUTH':
        const authStatus = await this.checkAuthStatus();
        sendResponse(authStatus);
        break;

      case 'LOGIN':
        const loginResult = await this.login(message.data);
        sendResponse(loginResult);
        break;

      case 'LOGOUT':
        const logoutResult = await this.logout();
        sendResponse(logoutResult);
        break;

      case 'REFRESH_TOKEN':
        const refreshResult = await this.refreshAuthToken();
        sendResponse(refreshResult);
        break;

      case 'CONNECT_SOCKET':
        const connectResult = await this.connectSocket();
        sendResponse(connectResult);
        break;

      case 'GET_CONNECTION_STATUS':
        sendResponse({ 
          connected: this.socket?.connected || false,
          authenticated: !!this.authToken,
          currentUser: this.currentUser,
          currentRoom: this.currentRoom
        });
        break;

      case 'CREATE_ROOM':
        const createResult = await this.createRoom(message.data);
        sendResponse(createResult);
        break;

      case 'JOIN_ROOM':
        const joinResult = await this.joinRoom(message.data);
        sendResponse(joinResult);
        break;

      case 'LEAVE_ROOM':
        const leaveResult = await this.leaveRoom();
        sendResponse(leaveResult);
        break;

      case 'GET_ACTIVE_ROOMS':
        const rooms = await this.getActiveRooms();
        sendResponse({ rooms });
        break;

      case 'SEND_MESSAGE':
        this.sendMessage(message.data);
        sendResponse({ success: true });
        break;

      case 'START_GAME':
        const startResult = await this.startGame();
        sendResponse(startResult);
        break;

      case 'PLAYER_READY':
        const readyResult = await this.playerReady(message.data);
        sendResponse(readyResult);
        break;

      case 'VOTE_PROBLEM':
        const voteResult = await this.voteProblem(message.data);
        sendResponse(voteResult);
        break;

      case 'LOGIN_STATUS_UPDATE':
        // From content script
        if (this.activeGame && this.activeGame.status === 'waiting_for_ready') {
          this.checkReadyStatus(message.isLoggedIn);
        }
        sendResponse({ received: true });
        break;

      case 'SUBMISSION_RESULT':
        // From content script
        if (this.activeGame && message.result.solved) {
          this.submitSolution(true);
        }
        sendResponse({ received: true });
        break;

      default:
        console.log('QuantRooms Background: Unknown message type:', message.type);
        sendResponse({ error: 'Unknown message type' });
    }
  }

  onTabUpdated(tabId, changeInfo, tab) {
    // Check if user navigated to QuantGuide.io
    if (changeInfo.status === 'complete' && tab.url?.includes('quantguide.io')) {
      console.log('QuantRooms: QuantGuide.io page loaded');
      
      // Inject content script if needed
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }).catch(err => {
        console.log('Content script injection skipped:', err.message);
      });
    }
  }

  async checkAuthStatus() {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.USER_DATA
      ]);
      
      if (result[STORAGE_KEYS.ACCESS_TOKEN]) {
        this.authToken = result[STORAGE_KEYS.ACCESS_TOKEN];
        this.currentUser = result[STORAGE_KEYS.USER_DATA];
        
        // Verify token is still valid
        const response = await this.fetchAPI('/auth/profile', 'GET');
        
        if (response.success) {
          this.currentUser = response.data;
          await this.connectSocket();
          return { authenticated: true, user: this.currentUser };
        } else {
          // Try to refresh token
          return await this.refreshAuthToken();
        }
      }
      
      return { authenticated: false };
    } catch (error) {
      console.error('Auth check error:', error);
      return { authenticated: false, error: error.message };
    }
  }

  async login(credentials) {
    try {
      const response = await this.fetchAPI('/auth/login', 'POST', credentials);
      
      if (response.success) {
        await this.saveAuthData(response.data);
        await this.connectSocket();
        return { success: true, user: response.data.user };
      }
      
      return { success: false, error: response.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async logout() {
    try {
      if (this.authToken) {
        const refreshToken = await this.getRefreshToken();
        await this.fetchAPI('/auth/logout', 'POST', { refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    // Clear storage
    await chrome.storage.local.remove([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.USER_DATA
    ]);
    
    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Reset state
    this.authToken = null;
    this.currentUser = null;
    this.currentRoom = null;
    
    return { success: true };
  }

  async refreshAuthToken() {
    try {
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        return { authenticated: false, error: 'No refresh token' };
      }
      
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });
      
      const data = await response.json();
      
      if (data.success) {
        await this.saveAuthData(data.data);
        return { authenticated: true, user: data.data.user };
      }
      
      return { authenticated: false, error: data.error };
    } catch (error) {
      console.error('Token refresh error:', error);
      return { authenticated: false, error: error.message };
    }
  }

  async saveAuthData(data) {
    this.authToken = data.tokens.accessToken;
    this.currentUser = data.user;
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.ACCESS_TOKEN]: data.tokens.accessToken,
      [STORAGE_KEYS.REFRESH_TOKEN]: data.tokens.refreshToken,
      [STORAGE_KEYS.USER_DATA]: data.user
    });
  }

  async getRefreshToken() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.REFRESH_TOKEN);
    return result[STORAGE_KEYS.REFRESH_TOKEN];
  }

  async connectSocket() {
    try {
      if (!this.authToken) {
        return { success: false, error: 'Not authenticated' };
      }

      if (this.socket && this.socket.connected) {
        return { success: true, connected: true };
      }

      // Initialize Socket.io connection with auth
      this.socket = io(API_BASE_URL, {
        auth: {
          token: this.authToken
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxRetries,
        reconnectionDelay: 1000
      });

      return new Promise((resolve) => {
        this.socket.on('connect', () => {
          console.log('Connected to QuantRooms server');
          this.connectionRetries = 0;
          this.setupSocketListeners();
          resolve({ success: true, connected: true });
        });

        this.socket.on('connect_error', (error) => {
          console.error('Connection error:', error);
          this.connectionRetries++;
          
          if (error.message === 'Authentication failed') {
            // Try to refresh token
            this.refreshAuthToken().then(() => {
              if (this.authToken) {
                this.socket.auth.token = this.authToken;
                this.socket.connect();
              }
            });
          }
          
          resolve({ success: false, error: error.message });
        });

        // Set timeout for connection attempt
        setTimeout(() => {
          if (!this.socket.connected) {
            this.socket.disconnect();
            resolve({ success: false, error: 'Connection timeout' });
          }
        }, 10000);
      });
    } catch (error) {
      console.error('Failed to connect to server:', error);
      return { success: false, error: error.message };
    }
  }

  setupSocketListeners() {
    // Room events
    this.socket.on('room-created', (data) => {
      console.log('Room created:', data);
      this.currentRoom = data.room;
      this.broadcastToPopup('ROOM_CREATED', data);
    });

    this.socket.on('room-joined', (data) => {
      console.log('Room joined:', data);
      this.currentRoom = data.room;
      this.broadcastToPopup('ROOM_JOINED', data);
    });

    this.socket.on('room-left', (data) => {
      console.log('Left room:', data);
      this.currentRoom = null;
      this.broadcastToPopup('ROOM_LEFT', data);
    });

    this.socket.on('room-list', (rooms) => {
      this.broadcastToPopup('ROOM_LIST', { rooms });
    });

    this.socket.on('room-updated', (room) => {
      this.currentRoom = room;
      this.broadcastToPopup('ROOM_UPDATED', { room });
    });

    this.socket.on('player-joined', (data) => {
      console.log('Player joined:', data);
      this.broadcastToPopup('PLAYER_JOINED', data);
    });

    this.socket.on('player-left', (data) => {
      console.log('Player left:', data);
      this.broadcastToPopup('PLAYER_LEFT', data);
    });

    // Chat events
    this.socket.on('new-message', (data) => {
      this.broadcastToPopup('NEW_MESSAGE', data);
      this.showNotification(`${data.username}: ${data.message}`);
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.broadcastToPopup('SOCKET_ERROR', { error: error.message });
    });

    // Disconnection
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.broadcastToPopup('DISCONNECTED');
    });

    // Game events
    this.socket.on('game-started', (data) => {
      console.log('Game started:', data);
      this.activeGame = data.gameState;
      this.broadcastToPopup('GAME_STARTED', data);
      
      // Notify content scripts to start monitoring
      this.broadcastToContentScripts({ type: 'GAME_STARTED' });
      
      // Check if player is logged in on QuantGuide
      this.checkQuantGuideLogin();
    });

    this.socket.on('ready-update', (data) => {
      this.broadcastToPopup('READY_UPDATE', data);
    });

    this.socket.on('voting-started', (data) => {
      this.activeGame = data.gameState;
      this.broadcastToPopup('VOTING_STARTED', data);
    });

    this.socket.on('vote-update', (data) => {
      this.broadcastToPopup('VOTE_UPDATE', data);
    });

    this.socket.on('game-problem-selected', (data) => {
      this.activeGame.currentProblem = data.problem;
      this.activeGame.status = 'playing';
      this.broadcastToPopup('PROBLEM_SELECTED', data);
      
      // Open problem in new tab
      chrome.tabs.create({
        url: data.problem.url,
        active: true
      });
      
      // Start monitoring for submissions
      this.broadcastToContentScripts({ type: 'GAME_STARTED' });
    });

    this.socket.on('player-solved', (data) => {
      this.broadcastToPopup('PLAYER_SOLVED', data);
      this.showNotification(`${data.username} solved in ${data.timeElapsed}s! (Position: ${data.position})`);
    });

    this.socket.on('game-ended', (data) => {
      this.activeGame = null;
      this.broadcastToPopup('GAME_ENDED', data);
      this.broadcastToContentScripts({ type: 'GAME_ENDED' });
      
      const winner = data.winner;
      const userEloChange = data.eloChanges[this.currentUser.userId];
      this.showNotification(
        `Game Over! Winner: ${winner.username}. Your ELO: ${userEloChange > 0 ? '+' : ''}${userEloChange}`,
        'Game Finished'
      );
    });
  }

  async createRoom(data) {
    if (!this.socket || !this.socket.connected) {
      return { success: false, error: 'Not connected to server' };
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Request timeout' });
      }, 5000);

      this.socket.once('room-created', (response) => {
        clearTimeout(timeout);
        resolve({ success: true, room: response.room });
      });

      this.socket.once('error', (error) => {
        clearTimeout(timeout);
        resolve({ success: false, error: error.message });
      });

      this.socket.emit('create-room', data);
    });
  }

  async joinRoom(data) {
    if (!this.socket || !this.socket.connected) {
      return { success: false, error: 'Not connected to server' };
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Request timeout' });
      }, 5000);

      this.socket.once('room-joined', (response) => {
        clearTimeout(timeout);
        resolve({ success: true, room: response.room });
      });

      this.socket.once('error', (error) => {
        clearTimeout(timeout);
        resolve({ success: false, error: error.message });
      });

      this.socket.emit('join-room', data);
    });
  }

  async leaveRoom() {
    if (!this.socket || !this.socket.connected) {
      return { success: false, error: 'Not connected to server' };
    }

    this.socket.emit('leave-room');
    this.currentRoom = null;
    return { success: true };
  }

  async getActiveRooms() {
    if (!this.socket || !this.socket.connected) {
      return [];
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve([]);
      }, 5000);

      this.socket.once('room-list', (rooms) => {
        clearTimeout(timeout);
        resolve(rooms);
      });

      this.socket.emit('get-rooms');
    });
  }

  sendMessage(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('send-message', data);
    }
  }

  async fetchAPI(endpoint, method = 'GET', body = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (this.authToken) {
      options.headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    return await response.json();
  }

  broadcastToPopup(type, data) {
    chrome.runtime.sendMessage({
      type,
      ...data
    }).catch(() => {
      // Popup might be closed
    });
  }

  showNotification(message, title = 'QuantRooms') {
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings?.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title,
          message
        });
      }
    });
  }

  // Game-related methods
  async startGame() {
    if (!this.socket || !this.socket.connected) {
      return { success: false, error: 'Not connected to server' };
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Request timeout' });
      }, 5000);

      this.socket.once('game-started', (response) => {
        clearTimeout(timeout);
        resolve({ success: true });
      });

      this.socket.once('error', (error) => {
        clearTimeout(timeout);
        resolve({ success: false, error: error.message });
      });

      this.socket.emit('start-game');
    });
  }

  async checkQuantGuideLogin() {
    // Query all tabs to find QuantGuide tabs
    const tabs = await chrome.tabs.query({ url: '*://quantguide.io/*' });
    
    if (tabs.length > 0) {
      // Check login status on the first QuantGuide tab
      chrome.tabs.sendMessage(tabs[0].id, { type: 'CHECK_LOGIN_STATUS' }, (response) => {
        if (response && response.isLoggedIn !== undefined) {
          this.checkReadyStatus(response.isLoggedIn);
        }
      });
    } else {
      // No QuantGuide tab open
      this.checkReadyStatus(false);
    }
  }

  checkReadyStatus(quantguideLoggedIn) {
    if (this.activeGame && this.activeGame.status === 'waiting_for_ready') {
      // Auto-send ready status
      this.playerReady({ ready: true, quantguideLoggedIn });
    }
  }

  async playerReady(data) {
    if (!this.socket || !this.socket.connected) {
      return { success: false, error: 'Not connected to server' };
    }

    this.socket.emit('player-ready', data);
    return { success: true };
  }

  async voteProblem(data) {
    if (!this.socket || !this.socket.connected) {
      return { success: false, error: 'Not connected to server' };
    }

    this.socket.emit('vote-problem', data);
    return { success: true };
  }

  async submitSolution(solved) {
    if (!this.socket || !this.socket.connected) {
      return { success: false, error: 'Not connected to server' };
    }

    this.socket.emit('solution-attempt', { solved });
    return { success: true };
  }

  broadcastToContentScripts(message) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && tab.url.includes('quantguide.io')) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      });
    });
  }
}

// Initialize background script
new QuantRoomsBackground();