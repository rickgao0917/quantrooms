const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const db = require('../database/connection');

// JWT Strategy
passport.use(new JwtStrategy({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'default_secret_change_this',
  issuer: 'quantrooms',
  audience: 'quantrooms-users'
}, async (payload, done) => {
  try {
    const user = await db('users')
      .where({ user_id: payload.userId, is_active: true })
      .first();
    
    if (user) {
      return done(null, {
        userId: user.user_id,
        email: user.email,
        username: user.username,
        elo: user.elo_rating
      });
    }
    
    return done(null, false);
  } catch (error) {
    return done(error, false);
  }
}));

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Extract user data from Google profile
    const googleId = profile.id;
    const email = profile.emails[0].value;
    const displayName = profile.displayName;
    
    // Check if user exists
    let user = await db('users')
      .where({ google_id: googleId })
      .orWhere({ email })
      .first();
    
    if (user) {
      // Update Google ID if user registered with email first
      if (!user.google_id) {
        await db('users')
          .where({ user_id: user.user_id })
          .update({ 
            google_id: googleId,
            last_active: db.fn.now()
          });
      }
    } else {
      // Create new user
      // Generate unique username from display name
      let username = displayName.toLowerCase().replace(/\s+/g, '');
      username = username.substring(0, 20); // Limit length
      
      // Check if username exists and make it unique
      let counter = 0;
      let finalUsername = username;
      while (true) {
        const existingUser = await db('users')
          .where({ username: finalUsername })
          .first();
        
        if (!existingUser) break;
        
        counter++;
        finalUsername = `${username}${counter}`;
      }
      
      [user] = await db('users')
        .insert({
          google_id: googleId,
          email,
          username: finalUsername,
          elo_rating: 1200,
          email_verified: true // Google accounts are pre-verified
        })
        .returning('*');
    }
    
    return done(null, {
      userId: user.user_id,
      email: user.email,
      username: user.username,
      elo: user.elo_rating
    });
  } catch (error) {
    return done(error, null);
  }
}));

// Serialize/Deserialize user for session
passport.serializeUser((user, done) => {
  done(null, user.userId);
});

passport.deserializeUser(async (userId, done) => {
  try {
    const user = await db('users')
      .where({ user_id: userId })
      .first();
    
    if (user) {
      done(null, {
        userId: user.user_id,
        email: user.email,
        username: user.username,
        elo: user.elo_rating
      });
    } else {
      done(null, false);
    }
  } catch (error) {
    done(error, false);
  }
});

module.exports = passport;