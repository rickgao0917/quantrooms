# QuantRooms Setup Guide

This document provides step-by-step instructions to set up the development environment for QuantRooms.

## Prerequisites

### Required Software
1. **Node.js** (version 16+): [Download from nodejs.org](https://nodejs.org/)
2. **PostgreSQL** (version 12+): [Download from postgresql.org](https://postgresql.org/download/)
3. **Git**: [Download from git-scm.com](https://git-scm.com/)
4. **Chrome Browser**: For extension development and testing

### Optional Tools
- **Redis**: For caching and session management
- **PM2**: For production process management (`npm install -g pm2`)

## Project Structure Setup

### 1. Create Backend Server Directory and Dependencies

```bash
# Create server directory
mkdir -p server
cd server

# Initialize npm project
npm init -y

# Install production dependencies
npm install express socket.io pg pg-pool jsonwebtoken bcrypt passport passport-google-oauth20 passport-jwt cors helmet express-rate-limit uuid dotenv joi compression express-validator

# Install development dependencies
npm install --save-dev nodemon jest supertest

# Optional: Install Redis support
npm install redis connect-redis

# Optional: Install logging
npm install winston

cd ..
```

### 2. Create Extension Build Setup

```bash
# Navigate to extension directory
cd extension

# Initialize npm project
npm init -y

# Install dependencies
npm install socket.io-client

# Install development dependencies for build process
npm install --save-dev webpack webpack-cli copy-webpack-plugin

cd ..
```

### 3. Database Setup

#### PostgreSQL Database Creation
```bash
# Connect to PostgreSQL (replace 'username' with your PostgreSQL user)
psql -U username -h localhost

# Create database
CREATE DATABASE quantrooms;

# Connect to the database
\c quantrooms;

# Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "jsonb_plpgsql";

# Exit PostgreSQL
\q
```

#### Database Schema Setup
Create the database schema by running the migration script (to be created):

```bash
cd server
node migrations/migrate.js
```

### 4. Environment Configuration

#### Server Environment Variables
Create `/server/.env`:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/quantrooms
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quantrooms
DB_USER=your_username
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Google OAuth Configuration (get from Google Console)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Server Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN=https://quantguide.io

# Redis Configuration (if using Redis)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

#### Extension Build Configuration
Create `/extension/webpack.config.js`:

```javascript
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    content: './content.js',
    background: './background.js',
    popup: './popup.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'popup.html', to: 'popup.html' },
        { from: 'styles.css', to: 'styles.css' },
        { from: 'icons', to: 'icons' }
      ]
    })
  ],
  mode: 'development'
};
```

### 5. Package.json Scripts Setup

#### Server package.json scripts
Update `/server/package.json` scripts section:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "migrate": "node migrations/migrate.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint .",
    "seed": "node seeds/seed.js"
  }
}
```

#### Extension package.json scripts
Update `/extension/package.json` scripts section:

```json
{
  "scripts": {
    "build": "webpack --mode=production",
    "dev": "webpack --mode=development --watch",
    "clean": "rm -rf dist"
  }
}
```

## Development Workflow

### 1. Start the Backend Server

```bash
cd server
npm run dev
```

The server will start on `http://localhost:3000` with hot reload enabled.

### 2. Build the Chrome Extension

```bash
cd extension
npm run dev
```

This will build the extension and watch for changes.

### 3. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `/extension/dist` directory (or `/extension` if not using build process)

### 4. Test the Extension

1. Navigate to `https://quantguide.io`
2. The QuantRooms floating button should appear
3. Click the extension icon in Chrome toolbar to open popup

## Database Migration and Seeding

### Create Migration File
Create `/server/migrations/migrate.js`:

```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        google_id VARCHAR(255) UNIQUE,
        username VARCHAR(50) NOT NULL,
        password_hash VARCHAR(255),
        elo_rating INTEGER DEFAULT 1200,
        games_played INTEGER DEFAULT 0,
        total_wins INTEGER DEFAULT 0,
        total_points INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create rooms table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        creator_id UUID REFERENCES users(user_id),
        max_players INTEGER DEFAULT 8,
        current_players INTEGER DEFAULT 0,
        elo_min INTEGER DEFAULT 0,
        elo_max INTEGER DEFAULT 3000,
        status VARCHAR(20) DEFAULT 'waiting',
        difficulty VARCHAR(20) DEFAULT 'Medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create games table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS games (
        game_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        room_id UUID REFERENCES rooms(room_id),
        problem_id VARCHAR(100) NOT NULL,
        participants JSONB NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        winner_id UUID REFERENCES users(user_id),
        final_scores JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

migrate();
```

### Run Migration

```bash
cd server
npm run migrate
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized domains: `http://localhost:3000` and `https://quantguide.io`
6. Update your `.env` file with the client ID and secret

## Verification

### Test Backend Server
```bash
curl http://localhost:3000/health
```

Should return server status information.

### Test Extension
1. Load extension in Chrome
2. Visit `https://quantguide.io`
3. Verify floating button appears
4. Check popup functionality

## Troubleshooting

### Common Issues

1. **PostgreSQL Connection Failed**
   - Verify PostgreSQL is running: `brew services start postgresql` (macOS) or `sudo service postgresql start` (Linux)
   - Check connection credentials in `.env`

2. **Extension Not Loading**
   - Check for JavaScript errors in Chrome DevTools
   - Verify manifest.json permissions
   - Rebuild extension: `npm run build`

3. **CORS Errors**
   - Verify CORS_ORIGIN in server `.env`
   - Check Chrome extension host_permissions in manifest.json

4. **Socket.io Connection Issues**
   - Verify server is running on correct port
   - Check WebSocket connection in browser network tab

## Next Steps

After successful setup:
1. Implement backend API endpoints
2. Complete WebSocket event handlers
3. Add authentication middleware
4. Implement room management logic
5. Add problem selection and voting system
6. Create ELO rating calculations
7. Add comprehensive testing