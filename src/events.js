// Event system for the server.
// The routes only announce that something happened (emit). The handlers in
// listeners.js decide what to do about it.
const { EventEmitter } = require('node:events');

const bus = new EventEmitter();

// all event names in one place to avoid typos
const EVENTS = {
  USER_REGISTERED: 'user:registered',
  USER_LOGIN: 'user:login',
  USER_LOGIN_FAILED: 'user:login_failed',
  USER_LOGOUT: 'user:logout',
  LEVEL_STARTED: 'quest:level_started',
  PUZZLE_SOLVED: 'quest:puzzle_solved',
  GUESS_WRONG: 'quest:guess_wrong',
  TIMER_EXPIRED: 'quest:timer_expired',
  LEVEL_COMPLETED: 'quest:level_completed',
  LEVEL_FAILED: 'quest:level_failed',
  TROPHY_FOUND: 'quest:trophy_found',
  TREASURE_FOUND: 'quest:treasure_found',
  API_ERROR: 'banana:api_error',
};

module.exports = { bus, EVENTS };
