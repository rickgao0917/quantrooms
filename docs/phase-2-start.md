# QuantRooms Phase 2 Setup Guide

This guide walks you through setting up and running the complete QuantRooms Phase 2 stack with database integration, authentication, and real-time multiplayer functionality.

## 🎯 What You'll Get

- PostgreSQL database with user accounts and room persistence
- Google OAuth 2.0 and email/password authentication
- JWT token-based session management
- Chrome extension with authentication UI
- Real-time multiplayer room functionality
- Enhanced security and rate limiting

## 📋 Prerequisites

Before starting, ensure you have:

- **Node.js** (v18 or higher)
- **PostgreSQL** (v12 or higher)
- **Chrome Browser** (for extension testing)
- **Git** (for version control)

### Install PostgreSQL (macOS)

```bash
# Install PostgreSQL using Homebrew
brew install postgresql

# Start PostgreSQL service
brew services start postgresql

# Verify PostgreSQL is running
brew services list | grep postgresql
```

### Install PostgreSQL (Ubuntu/Debian)

```bash
# Update package list
sudo apt update

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Install PostgreSQL (Windows)

1. Download from [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
2. Run the installer and follow the setup wizard
3. Remember your superuser password

## 🗄️ Database Setup

### 1. Create Database

```bash
# Create the quantrooms database
createdb quantrooms

# Alternative: Using psql
psql postgres
CREATE DATABASE quantrooms;
\q
```

### 2. Create PostgreSQL User (Optional)

If you need a specific user for the application:

```bash
# Create user with password
psql postgres -c "CREATE USER quantrooms_user WITH PASSWORD 'your_secure_password';"

# Grant privileges
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE quantrooms TO quantrooms_user;"
```

## ⚙️ Server Configuration

### 1. Navigate to Server Directory

```bash
cd server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
# Copy the environment template
cp .env.example .env
```

Edit the `.env` file with your actual configuration:

```env
# QuantRooms Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://your_username:your_password@localhost:5432/quantrooms
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quantrooms
DB_USER=your_username
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_change_this_in_production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Google OAuth Configuration (Optional)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Security Configuration
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
CORS_ORIGIN=chrome-extension://,https://quantguide.io

# Session Configuration
SESSION_SECRET=your_session_secret_here_change_this_in_production
```

### 4. Configure Database Credentials

**Option A: Use your system user (macOS/Linux)**
```bash
# Check your username
whoami

# Use your username in .env
DB_USER=your_username
DB_PASSWORD=  # Leave empty if no password set
```

**Option B: Use specific PostgreSQL user**
```bash
# If you created a specific user
DB_USER=quantrooms_user
DB_PASSWORD=your_secure_password
```

### 5. Run Database Migrations

```bash
# Run all database migrations
npm run migrate

# Verify migrations completed successfully
npm run migrate:status
```

### 6. Seed Database (Optional)

```bash
# Add sample data
npm run seed
```

## 🚀 Start the Server

### Development Mode (Auto-reload)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Verify Server is Running

```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2024-06-04T...","uptime":...,"database":"connected"}
```

## 🔌 Chrome Extension Setup

### 1. Open Chrome Extensions

1. Open Chrome browser
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)

### 2. Load Extension

1. Click **"Load unpacked"**
2. Navigate to and select: `/path/to/quantrooms/extension/`
3. The QuantRooms extension should appear in your extensions list

### 3. Verify Extension Installation

1. Click the QuantRooms extension icon in your Chrome toolbar
2. You should see the authentication interface
3. The extension should show "Connected to server" status

## 🧪 Testing the Complete Stack

### 1. Test Authentication

**Register New Account:**
1. Click QuantRooms extension icon
2. Click "Register" tab
3. Fill in email, username, password
4. Click "Register"
5. Verify successful registration

**Login:**
1. Use the login form with your credentials
2. Verify successful authentication
3. Check that user profile displays

### 2. Test Google OAuth (Optional)

**Setup Google OAuth:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add `http://localhost:3000/auth/google/callback` to authorized redirect URIs
6. Update `.env` with your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

**Test OAuth:**
1. Click "Login with Google" in extension
2. Complete Google authentication flow
3. Verify account creation/login

### 3. Test Real-time Multiplayer

**Single Browser Test:**
1. Open multiple Chrome tabs
2. Click QuantRooms extension in each tab
3. Create a room in one tab
4. Join the room from another tab
5. Verify real-time synchronization

**Multi-Browser Test:**
1. Open Chrome and another browser (or incognito)
2. Load the extension in both
3. Test room creation and joining across browsers

### 4. Test Room Functionality

**Create Room:**
1. Click "Create Room"
2. Set room name and settings
3. Verify room creation

**Join Room:**
1. See available rooms list
2. Click "Join" on a room
3. Verify you're added to participant list

**Leave Room:**
1. Click "Leave Room"
2. Verify you're removed from participants

## 🔧 Troubleshooting

### Database Connection Issues

**Error: `password authentication failed`**
```bash
# Check PostgreSQL is running
brew services list | grep postgresql

# Reset PostgreSQL user password
psql postgres -c "ALTER USER $(whoami) PASSWORD 'newpassword';"

# Update .env with correct credentials
```

**Error: `database "quantrooms" does not exist`**
```bash
# Create the database
createdb quantrooms

# Or via psql
psql postgres -c "CREATE DATABASE quantrooms;"
```

### Server Issues

**Port 3000 already in use:**
```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process (replace PID)
kill -9 <PID>

# Or use different port in .env
PORT=3001
```

**Environment variables not loading:**
```bash
# Verify .env file exists and has correct permissions
ls -la .env
cat .env

# Ensure no extra spaces or quotes in .env values
```

### Extension Issues

**Extension not loading:**
1. Check Chrome console for errors (F12)
2. Verify extension directory contains `manifest.json`
3. Reload extension in `chrome://extensions/`

**Connection errors:**
1. Verify server is running on localhost:3000
2. Check CORS settings in server `.env`
3. Clear browser storage and cookies

**Authentication not working:**
1. Check server logs for authentication errors
2. Verify JWT_SECRET is set in `.env`
3. Clear browser storage and try again

### Migration Issues

**Migration fails:**
```bash
# Check database connection
psql -d quantrooms -c "SELECT version();"

# Reset migrations (WARNING: deletes data)
npm run migrate:rollback
npm run migrate
```

## 📊 Database Management

### Useful Commands

```bash
# Run specific migration
npx knex migrate:up

# Rollback last migration
npm run migrate:rollback

# Check migration status
npx knex migrate:currentVersion

# Reset database (WARNING: deletes all data)
npm run db:reset
```

### Database Access

```bash
# Connect to database
psql quantrooms

# List tables
\dt

# View users table
SELECT * FROM users;

# View rooms table
SELECT * FROM rooms;

# Exit psql
\q
```

## 🎉 Success Checklist

- [ ] PostgreSQL installed and running
- [ ] Database `quantrooms` created
- [ ] Server dependencies installed
- [ ] `.env` file configured with correct database credentials
- [ ] Database migrations completed successfully
- [ ] Server starts without errors (`npm start`)
- [ ] Health endpoint returns success (`curl localhost:3000/health`)
- [ ] Chrome extension loads without errors
- [ ] Extension shows "Connected to server" status
- [ ] User registration/login works
- [ ] Room creation and joining works
- [ ] Real-time synchronization between tabs works

## 🔄 Development Workflow

### Starting Development Session

```bash
# Terminal 1: Start database (if not auto-started)
brew services start postgresql

# Terminal 2: Start server in development mode
cd server
npm run dev

# Terminal 3: Monitor logs (optional)
tail -f logs/app.log
```

### Making Changes

**Server Changes:**
- Server auto-reloads with `npm run dev`
- Database schema changes require new migrations

**Extension Changes:**
- Reload extension in `chrome://extensions/`
- Clear browser storage if authentication changes

### Database Schema Changes

```bash
# Create new migration
npm run migrate:make migration_name

# Edit the migration file in database/migrations/
# Run migration
npm run migrate
```

## 📚 Next Steps

With Phase 2 running successfully, you're ready to:

1. **Implement Phase 3**: Game logic, ELO system, and competitive scoring
2. **Add Features**: Problem selection, voting system, leaderboards
3. **Enhance UI**: Better extension interface and QuantGuide.io integration
4. **Testing**: Comprehensive test suite and performance optimization

For more information, see:
- [Phase 3 Implementation Guide](phase3-implementation-guide.md)
- [API Documentation](../server/README.md)
- [Extension Development Guide](../extension/README.md)

---

🎯 **You now have a fully functional multiplayer coding practice platform with authentication and real-time features!**