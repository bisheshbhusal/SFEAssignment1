// Sets up express: security headers, sessions and the routes
const express = require('express');
const session = require('express-session');
const path = require('node:path');
const crypto = require('node:crypto');
const auth = require('./auth');
const game = require('./game');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  // headers that limit where scripts and images can load from
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' https://marcconrad.com https://www.sanfoh.com; style-src 'self'; script-src 'self'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    next();
  });

  // the cookie only holds a random session id, the real data stays on the server
  app.use(session({
    name: 'banana.sid',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,      // javascript in the page cannot read the cookie
      sameSite: 'lax',     // not sent with cross-site POST requests
      secure: process.env.NODE_ENV === 'production',  // https only when deployed
      maxAge: 1000 * 60 * 60,  // 1 hour
    },
  }));

  app.use('/api/auth', auth.router);
  app.use('/api/game', game.router);
  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

module.exports = { createApp };
