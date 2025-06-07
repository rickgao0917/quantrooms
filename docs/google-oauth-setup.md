# Google OAuth Setup Guide for QuantRooms

This guide will help you set up Google OAuth for the QuantRooms extension.

## Prerequisites

- A Google account
- Access to Google Cloud Console
- The QuantRooms server running locally

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" in the top navigation
3. Click "New Project"
4. Name your project (e.g., "QuantRooms")
5. Click "Create"

## Step 2: Enable Google+ API

1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Google+ API"
3. Click on it and press "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - Choose "External" user type
   - Fill in the required fields:
     - App name: QuantRooms
     - User support email: Your email
     - Developer contact: Your email
   - Add scopes: `email` and `profile`
   - Add test users if in development

4. For the OAuth client:
   - Application type: **Web application**
   - Name: QuantRooms Web Client
   - Authorized JavaScript origins:
     ```
     http://localhost:3000
     ```
   - Authorized redirect URIs:
     ```
     http://localhost:3000/auth/google/callback
     ```
   - Click "Create"

## Step 4: Save Your Credentials

After creating the OAuth client, you'll see:
- **Client ID**: Something like `123456789-abcdefg.apps.googleusercontent.com`
- **Client Secret**: A long string of characters

Keep these safe - you'll need them for the next step.

## Step 5: Configure the Server

1. Create a `.env` file in the server directory if it doesn't exist:
   ```bash
   cd server
   cp .env.example .env
   ```

2. Edit the `.env` file and add your Google OAuth credentials:
   ```env
   # Google OAuth Configuration
   GOOGLE_CLIENT_ID=your_actual_client_id_here
   GOOGLE_CLIENT_SECRET=your_actual_client_secret_here
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
   ```

3. Make sure your database configuration is also set in the `.env` file

## Step 6: Get Your Chrome Extension ID

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Load the QuantRooms extension if not already loaded
4. Copy the Extension ID (looks like: `abcdefghijklmnopqrstuvwxyz123456`)

## Step 7: Update the Extension Code

1. Open `/server/routes/auth.js`
2. Find the line with `'YOUR_EXTENSION_ID'` (around line 496)
3. Replace it with your actual extension ID:
   ```javascript
   chrome.runtime.sendMessage(
     'your_actual_extension_id_here',
     { type: 'oauth-success', data: authData },
   ```

## Step 8: Restart and Test

1. Restart the server:
   ```bash
   cd server
   npm start
   ```

2. Reload the Chrome extension:
   - Go to `chrome://extensions/`
   - Click the refresh button on the QuantRooms extension

3. Test Google login:
   - Click the QuantRooms extension icon
   - Click "Login with Google"
   - Complete the Google sign-in flow
   - You should be redirected back and logged in

## Troubleshooting

### "The OAuth client was not found" Error
- Double-check your Client ID and Client Secret in the `.env` file
- Make sure there are no extra spaces or quotes
- Ensure the `.env` file is in the server directory

### "Redirect URI mismatch" Error
- Verify the redirect URI in Google Cloud Console matches exactly:
  `http://localhost:3000/auth/google/callback`
- Check that you're accessing the extension from `localhost` not `127.0.0.1`

### Extension Not Getting Auth Data
- Make sure you updated the extension ID in the server code
- Check that `externally_connectable` is set in `manifest.json`
- Try reloading both the extension and server

### Development vs Production
When moving to production, you'll need to:
1. Update the redirect URIs in Google Cloud Console
2. Update the `.env` file with production URLs
3. Update the extension's manifest.json with production URLs
4. Consider using environment-specific configuration files

## Security Notes

- Never commit your `.env` file to version control
- Keep your Client Secret secure
- In production, use HTTPS for all OAuth flows
- Regularly rotate your credentials
- Review OAuth scopes and only request what you need