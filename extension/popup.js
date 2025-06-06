// QuantRooms Popup Script - Phase 2
// Handles authentication and room management

// API Configuration
const API_BASE_URL = 'http://localhost:3000';
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'quantrooms_access_token',
  REFRESH_TOKEN: 'quantrooms_refresh_token',
  USER_DATA: 'quantrooms_user_data'
};

// State management
let socket = null;
let currentUser = null;
let currentRoom = null;
let authToken = null;

// DOM Elements
let elements = {};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  cacheElements();
  setupEventListeners();
  
  // Check for OAuth callback parameters
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('accessToken')) {
    await handleOAuthCallback(urlParams);
    return;
  }
  
  // Check authentication status
  await checkAuthStatus();
}

function cacheElements() {
  // Views
  elements.loginView = document.getElementById('loginView');
  elements.mainView = document.getElementById('mainView');
  elements.loadingView = document.getElementById('loadingView');
  
  // Sub-views
  elements.roomListView = document.getElementById('roomListView');
  elements.createRoomView = document.getElementById('createRoomView');
  elements.currentRoomView = document.getElementById('currentRoomView');
  
  // Auth elements
  elements.loginForm = document.getElementById('loginForm');
  elements.registerForm = document.getElementById('registerForm');
  elements.googleLoginBtn = document.getElementById('googleLoginBtn');
  elements.logoutBtn = document.getElementById('logoutBtn');
  
  // User info
  elements.currentUsername = document.getElementById('currentUsername');
  elements.currentElo = document.getElementById('currentElo');
  
  // Status
  elements.connectionDot = document.getElementById('connectionDot');
  elements.connectionStatus = document.getElementById('connectionStatus');
  
  // Room controls
  elements.quickMatchBtn = document.getElementById('quickMatchBtn');
  elements.createRoomBtn = document.getElementById('createRoomBtn');
  elements.joinRoomBtn = document.getElementById('joinRoomBtn');
  elements.createRoomForm = document.getElementById('createRoomForm');
  elements.leaveRoomBtn = document.getElementById('leaveRoomBtn');
  
  // Room lists
  elements.roomsList = document.getElementById('roomsList');
  elements.playersList = document.getElementById('playersList');
  
  // Stats
  elements.eloRating = document.getElementById('eloRating');
  elements.gamesPlayed = document.getElementById('gamesPlayed');
  elements.winRate = document.getElementById('winRate');
  
  // Chat
  elements.chatMessages = document.getElementById('chatMessages');
  elements.chatForm = document.getElementById('chatForm');
  elements.chatInput = document.getElementById('chatInput');
  
  // Notification
  elements.notification = document.getElementById('notification');
  elements.notificationText = document.getElementById('notificationText');
}

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      switchTab(tab);
    });
  });
  
  // Auth forms
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.registerForm.addEventListener('submit', handleRegister);
  elements.googleLoginBtn.addEventListener('click', handleGoogleLogin);
  elements.logoutBtn.addEventListener('click', handleLogout);
  
  // Room controls
  elements.quickMatchBtn.addEventListener('click', handleQuickMatch);
  elements.createRoomBtn.addEventListener('click', showCreateRoomView);
  elements.joinRoomBtn.addEventListener('click', handleJoinRoom);
  elements.createRoomForm.addEventListener('submit', handleCreateRoom);
  elements.leaveRoomBtn.addEventListener('click', handleLeaveRoom);
  
  // Cancel buttons
  document.getElementById('cancelCreateBtn').addEventListener('click', showRoomListView);
  
  // Chat
  elements.chatForm.addEventListener('submit', handleSendMessage);
  
  // Room list event delegation for join buttons
  elements.roomsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('join-room-btn')) {
      const roomItem = e.target.closest('.room-item');
      const roomId = roomItem.dataset.roomId;
      if (roomId) {
        joinRoom(roomId);
      }
    }
  });
  
  // Password validation
  const passwordInput = document.getElementById('registerPassword');
  if (passwordInput) {
    passwordInput.addEventListener('input', validatePasswordStrength);
  }
}

// View Management
function showView(viewName) {
  document.querySelectorAll('.view').forEach(view => {
    view.style.display = 'none';
  });
  
  if (elements[viewName + 'View']) {
    elements[viewName + 'View'].style.display = 'block';
  }
}

function showSubView(subViewName) {
  console.log('🔄 Switching to sub-view:', subViewName);
  document.querySelectorAll('.sub-view').forEach(view => {
    view.style.display = 'none';
  });
  
  if (elements[subViewName + 'View']) {
    elements[subViewName + 'View'].style.display = 'block';
    console.log('✅ Sub-view switched to:', subViewName);
  } else {
    console.error('❌ Sub-view not found:', subViewName);
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  document.getElementById(tabName + 'Tab').classList.add('active');
}

// Authentication
async function checkAuthStatus() {
  showView('loading');
  
  try {
    // Get stored tokens
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.USER_DATA
    ]);
    
    if (result[STORAGE_KEYS.ACCESS_TOKEN]) {
      authToken = result[STORAGE_KEYS.ACCESS_TOKEN];
      currentUser = result[STORAGE_KEYS.USER_DATA];
      
      // Verify token is still valid
      const response = await fetchAPI('/auth/profile', 'GET');
      
      if (response.success) {
        currentUser = response.data;
        await onAuthSuccess();
      } else {
        // Try to refresh token
        await refreshAuthToken();
      }
    } else {
      showView('login');
    }
  } catch (error) {
    console.error('Auth check error:', error);
    showView('login');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  try {
    const response = await fetchAPI('/auth/login', 'POST', {
      email,
      password
    });
    
    if (response.success) {
      await saveAuthData(response.data);
      await onAuthSuccess();
    } else {
      showNotification(response.error || 'Login failed', 'error');
    }
  } catch (error) {
    showNotification('Login failed. Please try again.', 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  
  const username = document.getElementById('registerUsername').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerConfirmPassword').value;
  
  if (password !== confirmPassword) {
    showNotification('Passwords do not match', 'error');
    return;
  }
  
  try {
    const response = await fetchAPI('/auth/register', 'POST', {
      username,
      email,
      password
    });
    
    if (response.success) {
      await saveAuthData(response.data);
      await onAuthSuccess();
      showNotification('Registration successful!', 'success');
    } else {
      showNotification(response.error || 'Registration failed', 'error');
    }
  } catch (error) {
    showNotification('Registration failed. Please try again.', 'error');
  }
}

async function handleGoogleLogin() {
  // Open Google OAuth in a new tab
  const authUrl = `${API_BASE_URL}/auth/google`;
  chrome.tabs.create({ url: authUrl });
  
  // The OAuth callback will be handled when the extension is reopened
  window.close();
}

async function handleOAuthCallback(params) {
  showView('loading');
  
  const data = {
    user: {
      userId: params.get('userId'),
      username: params.get('username'),
      email: params.get('email') || '',
      elo: parseInt(params.get('elo')) || 1200
    },
    tokens: {
      accessToken: params.get('accessToken'),
      refreshToken: params.get('refreshToken')
    }
  };
  
  if (params.get('error')) {
    showNotification('Google login failed', 'error');
    showView('login');
    return;
  }
  
  await saveAuthData(data);
  await onAuthSuccess();
  
  // Clean up URL
  window.history.replaceState({}, document.title, "popup.html");
}

async function handleLogout() {
  try {
    if (authToken) {
      await fetchAPI('/auth/logout', 'POST', {
        refreshToken: await getRefreshToken()
      });
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
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  
  // Reset state
  authToken = null;
  currentUser = null;
  currentRoom = null;
  
  // Show login view
  showView('login');
  showNotification('Logged out successfully', 'info');
}

async function saveAuthData(data) {
  authToken = data.tokens.accessToken;
  currentUser = data.user;
  
  await chrome.storage.local.set({
    [STORAGE_KEYS.ACCESS_TOKEN]: data.tokens.accessToken,
    [STORAGE_KEYS.REFRESH_TOKEN]: data.tokens.refreshToken,
    [STORAGE_KEYS.USER_DATA]: data.user
  });
}

async function refreshAuthToken() {
  try {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token');
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
      await saveAuthData(data.data);
      await onAuthSuccess();
    } else {
      showView('login');
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    showView('login');
  }
}

async function getRefreshToken() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.REFRESH_TOKEN);
  return result[STORAGE_KEYS.REFRESH_TOKEN];
}

async function onAuthSuccess() {
  showView('main');
  showSubView('roomList');
  updateUserInfo();
  await connectSocket();
  await loadUserStats();
}

// Socket Connection
async function connectSocket() {
  if (socket) {
    socket.disconnect();
  }
  
  updateConnectionStatus('Connecting...');
  
  socket = io(API_BASE_URL, {
    auth: {
      token: authToken
    },
    transports: ['websocket', 'polling'],
    timeout: 20000,
    forceNew: true
  });
  
  socket.on('connect', () => {
    updateConnectionStatus('Connected');
    console.log('🔌 Socket connected');
  });
  
  socket.on('disconnect', () => {
    updateConnectionStatus('Disconnected');
    console.log('🔌 Socket disconnected');
  });
  
  socket.on('connect_error', (error) => {
    console.error('🚨 Socket connection error:', error);
    updateConnectionStatus('Connection error');
  });
  
  // Room events
  socket.on('room-list', handleRoomList);
  socket.on('room-created', handleRoomCreated);
  socket.on('room-joined', handleRoomJoined);
  socket.on('room-left', handleRoomLeft);
  socket.on('player-joined', handlePlayerJoined);
  socket.on('player-left', handlePlayerLeft);
  socket.on('current-room', handleCurrentRoom);
  
  // Chat events
  socket.on('new-message', handleNewMessage);
  
  // Error events
  socket.on('error', handleSocketError);
  
  // Request initial room list
  socket.emit('get-rooms');
}

// Room Management
async function handleQuickMatch() {
  showNotification('Quick match not available yet', 'info');
}

function showCreateRoomView() {
  showSubView('createRoom');
}

function showRoomListView() {
  showSubView('roomList');
  socket.emit('get-rooms');
}

async function handleCreateRoom(e) {
  e.preventDefault();
  
  const roomData = {
    name: document.getElementById('roomName').value,
    maxPlayers: parseInt(document.getElementById('maxPlayers').value),
    difficulty: document.getElementById('difficulty').value,
    eloMin: parseInt(document.getElementById('eloMin').value),
    eloMax: parseInt(document.getElementById('eloMax').value)
  };
  
  socket.emit('create-room', roomData);
}

async function handleJoinRoom() {
  const roomId = prompt('Enter room ID:');
  if (roomId) {
    socket.emit('join-room', { roomId });
  }
}

async function handleLeaveRoom() {
  console.log('🚪 Leave room button clicked');
  
  // Update UI immediately to prevent issues with popup closing
  currentRoom = null;
  showSubView('roomList');
  showNotification('Leaving room...', 'info');
  
  // Send leave-room event
  if (socket && socket.connected) {
    console.log('🚪 Sending leave-room event');
    socket.emit('leave-room');
    // Request updated room list
    socket.emit('get-rooms');
  } else {
    console.error('❌ Socket not connected when trying to leave room');
  }
}

// Socket Event Handlers
function handleRoomList(rooms) {
  if (!elements.roomsList) return;
  
  if (rooms.length === 0) {
    elements.roomsList.innerHTML = '<div class="no-rooms">No active rooms</div>';
    return;
  }
  
  elements.roomsList.innerHTML = rooms.map(room => `
    <div class="room-item" data-room-id="${room.room_id}">
      <div class="room-info">
        <h4>${room.name}</h4>
        <span class="room-players">${room.current_players}/${room.max_players} players</span>
        <span class="room-players">ELO: ${room.elo_min}-${room.elo_max}</span>
      </div>
      <button class="btn btn-sm btn-primary join-room-btn">Join</button>
    </div>
  `).join('');
}

function handleRoomCreated(data) {
  console.log('🏠 handleRoomCreated called with data:', data);
  if (data.success) {
    console.log('✅ Room created successfully, updating UI');
    currentRoom = data.room;
    showSubView('currentRoom');
    updateRoomView();
    showNotification('Room created successfully!', 'success');
  } else {
    console.error('❌ Room creation failed:', data);
  }
}

function handleRoomJoined(data) {
  console.log('🏠 handleRoomJoined called with data:', data);
  if (data.success) {
    console.log('✅ Room joined successfully, updating UI');
    currentRoom = data.room;
    showSubView('currentRoom');
    updateRoomView();
    showNotification('Joined room successfully!', 'success');
  } else {
    console.error('❌ Room join failed:', data);
  }
}

function handleRoomLeft(data) {
  console.log('🚪 handleRoomLeft called with data:', data);
  if (data.success) {
    console.log('✅ Room left successfully, updating UI');
    currentRoom = null;
    showSubView('roomList');
    showNotification('Left room', 'info');
    socket.emit('get-rooms');
  } else {
    console.error('❌ Room left failed:', data);
  }
}

function handleCurrentRoom(room) {
  currentRoom = room;
  showSubView('currentRoom');
  updateRoomView();
}

function handlePlayerJoined(data) {
  if (currentRoom) {
    showNotification(`${data.player.name} joined the room`, 'info');
    // Refresh room data
    socket.emit('get-rooms');
  }
}

function handlePlayerLeft(data) {
  if (currentRoom) {
    showNotification(`Player left the room`, 'info');
    currentRoom = data.room;
    updateRoomView();
  }
}

function handleNewMessage(data) {
  if (!elements.chatMessages) return;
  
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';
  messageEl.innerHTML = `<strong>${data.username}:</strong> ${data.message}`;
  
  elements.chatMessages.appendChild(messageEl);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function handleSocketError(error) {
  showNotification(error.message || 'An error occurred', 'error');
}

async function handleSendMessage(e) {
  e.preventDefault();
  
  const message = elements.chatInput.value.trim();
  if (message) {
    socket.emit('send-message', { message });
    elements.chatInput.value = '';
  }
}

// UI Updates
function updateUserInfo() {
  if (currentUser) {
    elements.currentUsername.textContent = currentUser.username;
    elements.currentElo.textContent = `ELO: ${currentUser.elo || 1200}`;
  }
}

function updateConnectionStatus(status) {
  elements.connectionStatus.textContent = status;
  elements.connectionDot.classList.toggle('disconnected', status !== 'Connected');
}

function updateRoomView() {
  if (!currentRoom) return;
  
  document.getElementById('currentRoomName').textContent = currentRoom.name;
  document.getElementById('currentRoomCode').textContent = `Room ID: ${currentRoom.room_id.substring(0, 8)}`;
  document.getElementById('playerCount').textContent = currentRoom.players?.length || 0;
  document.getElementById('maxPlayerCount').textContent = currentRoom.max_players;
  
  // Update players list
  if (currentRoom.players) {
    elements.playersList.innerHTML = currentRoom.players.map(player => `
      <div class="player-item ${player.isHost ? 'host' : ''}">
        <span>${player.name}</span>
        <span>ELO: ${player.elo}</span>
      </div>
    `).join('');
  }
}

async function loadUserStats() {
  try {
    const response = await fetchAPI('/auth/profile', 'GET');
    
    if (response.success) {
      const stats = response.data.statistics;
      elements.eloRating.textContent = response.data.elo;
      elements.gamesPlayed.textContent = stats.gamesPlayed;
      elements.winRate.textContent = `${stats.winRate}%`;
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// Password Validation
function validatePasswordStrength(e) {
  const password = e.target.value;
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };
  
  Object.keys(requirements).forEach(req => {
    const element = document.getElementById(`req-${req}`);
    if (element) {
      element.classList.toggle('valid', requirements[req]);
    }
  });
}

// Notifications
function showNotification(message, type = 'info') {
  elements.notificationText.textContent = message;
  elements.notification.className = `notification ${type}`;
  elements.notification.style.display = 'block';
  
  setTimeout(() => {
    elements.notification.style.display = 'none';
  }, 3000);
}

// API Helper
async function fetchAPI(endpoint, method = 'GET', body = null) {
  try {
    console.log(`🌐 Making ${method} request to: ${API_BASE_URL}${endpoint}`);
    console.log('📦 Request body:', body);
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    console.log('🔧 Request options:', options);
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    console.log('📡 Response status:', response.status);
    console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log('📄 Response data:', data);
    
    if (response.status === 401 && data.code === 'TOKEN_EXPIRED') {
      // Try to refresh token
      await refreshAuthToken();
      // Retry the request
      options.headers['Authorization'] = `Bearer ${authToken}`;
      const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, options);
      return await retryResponse.json();
    }
    
    return data;
  } catch (error) {
    console.error('❌ fetchAPI error:', error);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Function for room joining from list
function joinRoom(roomId) {
  console.log('🏠 Attempting to join room:', roomId);
  if (!socket || !socket.connected) {
    console.error('❌ Socket not connected');
    showNotification('Connection error. Please try again.', 'error');
    return;
  }
  socket.emit('join-room', { roomId });
}