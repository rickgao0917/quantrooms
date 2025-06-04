// QuantRooms Background Service Worker

// Import Socket.io client library
importScripts('socket.io.min.js');

class QuantRoomsBackground {
  constructor() {
    this.socket = null;
    this.serverUrl = 'http://localhost:3000';
    this.currentRoom = null;
    this.userId = null;
    this.userName = null;
    this.init();
  }

  init() {
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
  }

  onInstalled() {
    console.log('QuantRooms: Extension installed');
    
    // Set default settings
    chrome.storage.sync.set({
      userId: this.generateUserId(),
      settings: {
        notifications: true,
        autoJoinRooms: false,
        preferredDifficulty: 'Medium'
      }
    });
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'GET_USER_ID':
        this.getUserId().then(userId => {
          sendResponse({ userId });
        });
        break;

      case 'CONNECT_TO_SERVER':
        this.connectToServer(message.serverUrl).then(result => {
          sendResponse(result);
        });
        break;

      case 'GET_ACTIVE_ROOMS':
        this.getActiveRooms().then(rooms => {
          sendResponse({ rooms });
        });
        break;

      case 'CREATE_ROOM':
        this.createRoom(message.data).then(result => {
          sendResponse(result);
        });
        break;

      case 'JOIN_ROOM':
        this.joinRoom(message.data).then(result => {
          sendResponse(result);
        });
        break;

      case 'LEAVE_ROOM':
        this.leaveRoom().then(result => {
          sendResponse(result);
        });
        break;

      case 'GET_CONNECTION_STATUS':
        sendResponse({ 
          connected: this.socket?.connected || false,
          currentRoom: this.currentRoom
        });
        break;

      case 'SET_USER_NAME':
        this.userName = message.userName;
        chrome.storage.sync.set({ userName: message.userName });
        sendResponse({ success: true });
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
        // Script might already be injected
        console.log('Content script injection skipped:', err.message);
      });
    }
  }

  async getUserId() {
    const result = await chrome.storage.sync.get(['userId']);
    if (!result.userId) {
      const newUserId = this.generateUserId();
      await chrome.storage.sync.set({ userId: newUserId });
      return newUserId;
    }
    return result.userId;
  }

  generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  async connectToServer(serverUrl = 'http://localhost:3000') {
    try {
      if (this.socket && this.socket.connected) {
        return { success: true, connected: true, message: 'Already connected' };
      }

      this.serverUrl = serverUrl;
      
      // Initialize Socket.io connection
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      return new Promise((resolve) => {
        this.socket.on('connect', () => {
          console.log('Connected to QuantRooms server');
          this.setupSocketListeners();
          resolve({ success: true, connected: true });
        });

        this.socket.on('connect_error', (error) => {
          console.error('Connection error:', error);
          resolve({ success: false, error: error.message });
        });

        // Set timeout for connection attempt
        setTimeout(() => {
          if (!this.socket.connected) {
            this.socket.disconnect();
            resolve({ success: false, error: 'Connection timeout' });
          }
        }, 5000);
      });
    } catch (error) {
      console.error('Failed to connect to server:', error);
      return { success: false, error: error.message };
    }
  }

  setupSocketListeners() {
    // Room created
    this.socket.on('room_created', (data) => {
      console.log('Room created:', data);
      this.currentRoom = data.room;
      // Notify popup
      chrome.runtime.sendMessage({
        type: 'ROOM_CREATED',
        room: data.room
      }).catch(() => {});
    });

    // Room joined
    this.socket.on('room_joined', (data) => {
      console.log('Room joined:', data);
      this.currentRoom = data.room;
      // Notify popup
      chrome.runtime.sendMessage({
        type: 'ROOM_JOINED',
        room: data.room
      }).catch(() => {});
    });

    // Room updated
    this.socket.on('room_list_updated', (data) => {
      // Notify popup
      chrome.runtime.sendMessage({
        type: 'ROOM_LIST_UPDATED',
        rooms: data.rooms
      }).catch(() => {});
    });

    // Player joined
    this.socket.on('player_joined', (data) => {
      console.log('Player joined:', data);
      this.currentRoom = data.room;
      // Notify popup
      chrome.runtime.sendMessage({
        type: 'PLAYER_JOINED',
        player: data.player,
        room: data.room
      }).catch(() => {});
    });

    // Player left
    this.socket.on('player_left', (data) => {
      console.log('Player left:', data);
      this.currentRoom = data.room;
      // Notify popup
      chrome.runtime.sendMessage({
        type: 'PLAYER_LEFT',
        playerId: data.playerId,
        room: data.room
      }).catch(() => {});
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      chrome.runtime.sendMessage({
        type: 'SOCKET_ERROR',
        error: error.message
      }).catch(() => {});
    });

    // Disconnection
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.currentRoom = null;
      chrome.runtime.sendMessage({
        type: 'DISCONNECTED'
      }).catch(() => {});
    });
  }

  async getActiveRooms() {
    try {
      if (!this.socket || !this.socket.connected) {
        console.error('Not connected to server');
        return [];
      }

      return new Promise((resolve) => {
        this.socket.emit('get_rooms');
        
        const handleRoomList = (data) => {
          this.socket.off('room_list', handleRoomList);
          resolve(data.rooms || []);
        };

        this.socket.on('room_list', handleRoomList);

        // Timeout after 5 seconds
        setTimeout(() => {
          this.socket.off('room_list', handleRoomList);
          resolve([]);
        }, 5000);
      });
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
      return [];
    }
  }

  async createRoom(data) {
    try {
      if (!this.socket || !this.socket.connected) {
        return { success: false, error: 'Not connected to server' };
      }

      const roomData = {
        roomName: data.roomName,
        userName: data.userName || this.userName || 'Anonymous',
        maxPlayers: data.maxPlayers || 8,
        difficulty: data.difficulty || 'Medium'
      };

      return new Promise((resolve) => {
        this.socket.emit('create_room', roomData);

        const handleRoomCreated = (response) => {
          this.socket.off('room_created', handleRoomCreated);
          this.socket.off('error', handleError);
          resolve({ success: true, room: response.room });
        };

        const handleError = (error) => {
          this.socket.off('room_created', handleRoomCreated);
          this.socket.off('error', handleError);
          resolve({ success: false, error: error.message });
        };

        this.socket.on('room_created', handleRoomCreated);
        this.socket.on('error', handleError);

        // Timeout
        setTimeout(() => {
          this.socket.off('room_created', handleRoomCreated);
          this.socket.off('error', handleError);
          resolve({ success: false, error: 'Request timeout' });
        }, 5000);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async joinRoom(data) {
    try {
      if (!this.socket || !this.socket.connected) {
        return { success: false, error: 'Not connected to server' };
      }

      const joinData = {
        roomId: data.roomId,
        userName: data.userName || this.userName || 'Anonymous'
      };

      return new Promise((resolve) => {
        this.socket.emit('join_room', joinData);

        const handleRoomJoined = (response) => {
          this.socket.off('room_joined', handleRoomJoined);
          this.socket.off('error', handleError);
          resolve({ success: true, room: response.room });
        };

        const handleError = (error) => {
          this.socket.off('room_joined', handleRoomJoined);
          this.socket.off('error', handleError);
          resolve({ success: false, error: error.message });
        };

        this.socket.on('room_joined', handleRoomJoined);
        this.socket.on('error', handleError);

        // Timeout
        setTimeout(() => {
          this.socket.off('room_joined', handleRoomJoined);
          this.socket.off('error', handleError);
          resolve({ success: false, error: 'Request timeout' });
        }, 5000);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async leaveRoom() {
    try {
      if (!this.socket || !this.socket.connected) {
        return { success: false, error: 'Not connected to server' };
      }

      this.socket.emit('leave_room');
      this.currentRoom = null;
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Initialize background script
new QuantRoomsBackground();