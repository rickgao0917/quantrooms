// QuantRooms Background Service Worker

class QuantRoomsBackground {
  constructor() {
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
      // TODO: Implement WebSocket connection to backend
      console.log('Connecting to server:', serverUrl);
      return { success: true, connected: true };
    } catch (error) {
      console.error('Failed to connect to server:', error);
      return { success: false, error: error.message };
    }
  }

  async getActiveRooms() {
    try {
      // TODO: Fetch active rooms from backend
      console.log('Fetching active rooms...');
      
      // Mock data for now
      return [
        {
          id: 'room1',
          name: 'Quick Practice',
          players: 3,
          maxPlayers: 6,
          eloRange: [1200, 1400],
          difficulty: 'Medium'
        },
        {
          id: 'room2', 
          name: 'Advanced Finance',
          players: 2,
          maxPlayers: 4,
          eloRange: [1600, 1800],
          difficulty: 'Hard'
        }
      ];
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
      return [];
    }
  }
}

// Initialize background script
new QuantRoomsBackground();