#!/bin/bash

# QuantRooms Multi-User Testing Script
echo "🧪 Starting QuantRooms Multi-User Testing"
echo "🚀 Server should be running on localhost:3000"

# Check if server is running
if ! curl -s http://localhost:3000/api/health > /dev/null; then
    echo "❌ Server not running! Start it with: cd server && npm start"
    exit 1
fi

echo "✅ Server is running"
echo ""
echo "🔥 Opening 4 Chrome profiles for testing..."

# Create Chrome profiles for testing
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --user-data-dir=/tmp/quantrooms-test-1 \
    --profile-directory="QuantRooms-User1" &

sleep 2

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --user-data-dir=/tmp/quantrooms-test-2 \
    --profile-directory="QuantRooms-User2" &

sleep 2

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --user-data-dir=/tmp/quantrooms-test-3 \
    --profile-directory="QuantRooms-User3" &

sleep 2

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --user-data-dir=/tmp/quantrooms-test-4 \
    --profile-directory="QuantRooms-User4" &

echo ""
echo "🎯 Testing Instructions:"
echo "1. In each Chrome window, go to chrome://extensions/"
echo "2. Load the QuantRooms extension from: $(pwd)/extension"
echo "3. Create different user accounts:"
echo "   - testuser1@example.com"
echo "   - testuser2@example.com" 
echo "   - testuser3@example.com"
echo "   - testuser4@example.com"
echo "4. Test room creation, joining, leaving, and chat"
echo ""
echo "📊 Monitor server logs: tail -f server/server.log"
echo "🔧 Extension path: $(pwd)/extension"