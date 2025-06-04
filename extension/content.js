// QuantRooms Content Script
// Injected into QuantGuide.io pages

class QuantRooms {
  constructor() {
    this.isActive = false;
    this.currentRoom = null;
    this.socket = null;
    this.init();
  }

  init() {
    console.log('QuantRooms: Initializing on', window.location.href);
    
    // Wait for page to fully load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupUI());
    } else {
      this.setupUI();
    }
  }

  setupUI() {
    // Create QuantRooms overlay
    this.createOverlay();
    
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
    });
    
    // Detect if we're on a problem page
    this.detectProblemPage();
  }

  createOverlay() {
    // Create floating button
    const floatingBtn = document.createElement('div');
    floatingBtn.id = 'quantrooms-floating-btn';
    floatingBtn.innerHTML = '🎮';
    floatingBtn.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      background: #4F46E5;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 10000;
      font-size: 20px;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
      transition: all 0.3s ease;
    `;
    
    floatingBtn.addEventListener('click', () => this.togglePanel());
    document.body.appendChild(floatingBtn);

    // Create main panel (initially hidden)
    this.createMainPanel();
  }

  createMainPanel() {
    const panel = document.createElement('div');
    panel.id = 'quantrooms-panel';
    panel.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      width: 350px;
      height: 500px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      z-index: 10001;
      display: none;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    panel.innerHTML = `
      <div style="padding: 20px; border-bottom: 1px solid #e5e7eb;">
        <h3 style="margin: 0; color: #1f2937; font-size: 18px;">QuantRooms</h3>
        <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Multiplayer coding practice</p>
      </div>
      
      <div id="quantrooms-content" style="padding: 20px; height: calc(100% - 80px); overflow-y: auto;">
        <div id="lobby-section">
          <h4 style="margin: 0 0 15px 0; color: #374151;">Active Rooms</h4>
          <div id="room-list">
            <div style="text-align: center; color: #9ca3af; padding: 40px 0;">
              <p>No active rooms</p>
              <button id="create-room-btn" style="
                background: #4F46E5;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                margin-top: 10px;
              ">Create Room</button>
            </div>
          </div>
        </div>
        
        <div id="room-section" style="display: none;">
          <h4 style="margin: 0 0 15px 0; color: #374151;">Room: <span id="room-name"></span></h4>
          <div id="player-list"></div>
          <div id="game-status"></div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    this.panel = panel;
    
    // Add event listeners
    document.getElementById('create-room-btn')?.addEventListener('click', () => {
      this.createRoom();
    });
  }

  togglePanel() {
    const panel = document.getElementById('quantrooms-panel');
    if (panel.style.display === 'none') {
      panel.style.display = 'block';
    } else {
      panel.style.display = 'none';
    }
  }

  detectProblemPage() {
    // Check if we're on a QuantGuide problem page
    const isProblemPage = window.location.pathname.includes('/problem') || 
                         document.querySelector('[data-problem-id]') ||
                         document.querySelector('.problem-content');
    
    if (isProblemPage) {
      console.log('QuantRooms: Problem page detected');
      this.setupProblemPageFeatures();
    }
  }

  setupProblemPageFeatures() {
    // Add collaborative features to problem pages
    // This will be expanded later
  }

  handleMessage(message, sendResponse) {
    switch (message.type) {
      case 'GET_PAGE_INFO':
        sendResponse({
          url: window.location.href,
          isProblemPage: this.detectProblemPage()
        });
        break;
        
      case 'JOIN_ROOM':
        this.joinRoom(message.roomId);
        sendResponse({ success: true });
        break;
        
      default:
        console.log('QuantRooms: Unknown message type:', message.type);
    }
  }

  createRoom() {
    // TODO: Implement room creation
    console.log('Creating room...');
  }

  joinRoom(roomId) {
    // TODO: Implement room joining
    console.log('Joining room:', roomId);
  }
}

// Initialize QuantRooms
new QuantRooms();