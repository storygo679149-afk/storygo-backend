// server/src/config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { query } = require('./database');
const environment = require('./environment');

// ❌ No serialize/deserialize – session is false, JWT auth
passport.use(new GoogleStrategy({
    clientID: environment.GOOGLE_CLIENT_ID,
    clientSecret: environment.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback',
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      let user = await query('SELECT * FROM users WHERE email = $1', [email]);

      if (user.rows.length === 0) {
        // Create a new user for this Google account
        const username = profile.displayName.replace(/\s/g, '').toLowerCase() + profile.id;
        const newUser = await query(
          `INSERT INTO users (username, email, full_name, password_hash)
           VALUES ($1, $2, $3, $4)
           RETURNING id, username, email, full_name, is_creator, is_admin`,
          [username, email, profile.displayName, 'oauth']
        );
        return done(null, newUser.rows[0]);
      }

      return done(null, user.rows[0]);
    } catch (err) {
      return done(err, null);
    }
  }
));

module.exports = passport;