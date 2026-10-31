// Register, login and logout (the virtual identity part)
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const store = require('./store');
const { bus, EVENTS } = require('./events');

const router = express.Router();

// remembers failed logins so one person can't keep guessing passwords
// (5 failures in 10 minutes for the same ip + username)
const failedLogins = new Map();

function tooManyFailures(key) {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  const recent = (failedLogins.get(key) || []).filter((time) => now - time < tenMinutes);
  failedLogins.set(key, recent);
  return recent.length >= 5;
}

function validUsername(name) {
  return typeof name === 'string' && /^[A-Za-z0-9_]{3,20}$/.test(name);
}

function validPassword(pw) {
  // bcrypt only uses the first 72 characters so that is the max
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 72;
}

// used when the username does not exist, so the login takes about the same time
// and nobody can tell which usernames are real
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};

  if (!validUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 letters, numbers or _' });
  }
  if (!validPassword(password)) {
    return res.status(400).json({ error: 'Password must be 8-72 characters' });
  }
  if (store.findUser(username)) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  // the password is hashed (with a salt) so the plain text is never saved
  const passwordHash = await bcrypt.hash(password, 10);

  const user = store.addUser({
    id: crypto.randomUUID(),
    username: username,
    passwordHash: passwordHash,
    createdAt: new Date().toISOString(),
  });
  bus.emit(EVENTS.USER_REGISTERED, { username: username });

  // new session id after registering
  req.session.regenerate(() => {
    req.session.userId = user.id;
    req.session.username = user.username;
    res.status(201).json({ username: user.username });
  });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const key = req.ip + ':' + String(username).toLowerCase();

  if (tooManyFailures(key)) {
    return res.status(429).json({ error: 'Too many attempts, try again later' });
  }

  const user = typeof username === 'string' ? store.findUser(username) : null;
  const hash = user ? user.passwordHash : DUMMY_HASH;
  const passwordOk = typeof password === 'string' && (await bcrypt.compare(password, hash));

  if (!user || !passwordOk) {
    failedLogins.get(key).push(Date.now());
    bus.emit(EVENTS.USER_LOGIN_FAILED, { username: username });
    // same message for a wrong username and a wrong password
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  failedLogins.delete(key);

  // new session id on login stops session fixation attacks
  req.session.regenerate(() => {
    req.session.userId = user.id;
    req.session.username = user.username;
    bus.emit(EVENTS.USER_LOGIN, { username: user.username });
    res.json({ username: user.username });
  });
});

router.post('/logout', (req, res) => {
  const username = req.session.username;
  req.session.destroy(() => {
    res.clearCookie('banana.sid');
    bus.emit(EVENTS.USER_LOGOUT, { username: username });
    res.json({ ok: true });
  });
});

// lets the page check if the user is already logged in (e.g. after a refresh)
router.get('/me', (req, res) => {
  res.json({ username: req.session.username || null });
});

// middleware for routes that need a logged in user
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Please log in' });
  }
  next();
}

module.exports = { router, requireLogin };
