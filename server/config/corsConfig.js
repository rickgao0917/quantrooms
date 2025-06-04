// CORS configuration for QuantRooms server

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://quantguide.io',
      'http://localhost:3000',
      'http://localhost:5173', // Vite dev server
      'chrome-extension://*' // Allow all Chrome extensions
    ];
    
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Check if origin matches allowed patterns
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace('*', '.*');
        return new RegExp(pattern).test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

module.exports = corsOptions;