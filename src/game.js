// Routes for the game. The server keeps the solutions, timers and progress,
// the browser only shows things, so a player can't cheat from the page.
const express = require('express');
const { requireLogin } = require('./auth');
const { fetchPuzzle } = require('./bananaClient');
const { config, getLevel, twists } = require('./levels');
const engine = require('./engine');
const progress = require('./progress');
const store = require('./store');
const { getNews } = require('./listeners');
const { bus, EVENTS } = require('./events');

const router = express.Router();

// ---- public routes (no login needed) ----

router.get('/leaderboard', (req, res) => {
  const sort = req.query.sort === 'fastest' ? 'fastest' : 'wins';
  res.json(progress.rankLeaderboard(store.allProfiles(), sort, 10));
});

router.get('/news', (req, res) => {
  res.json(getNews());
});

// ---- everything below needs a logged in user ----
router.use(requireLogin);

// gets the saved profile of the logged in player, makes one if it is their first time
function profileFor(req) {
  let profile = store.getProfile(req.session.userId);
  if (!profile) {
    profile = progress.newProfile(req.session.username);
    store.setProfile(req.session.userId, profile);
  }
  return profile;
}

// what the browser is allowed to know about the current attempt (no solution!)
function stateOf(attempt, level, now) {
  return {
    levelId: level.id,
    name: level.name,
    lives: attempt.lives,
    maxLives: level.lives,
    solved: attempt.solved,
    total: level.puzzles,
    image: attempt.image,
    remainingMs: attempt.issuedAt === null ? 0 : engine.remainingMs(attempt, level, now),
  };
}

router.get('/map', (req, res) => {
  const profile = profileFor(req);

  const regions = config.regions.map((r) => {
    const ids = config.levels.filter((l) => l.region === r.id).map((l) => l.id);
    return {
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      chest: r.chest,
      firstLevel: ids[0],
      lastLevel: ids[ids.length - 1],
    };
  });

  const levels = config.levels.map((l) => ({
    id: l.id,
    name: l.name,
    region: l.region,
    puzzles: l.puzzles,
    secondsPerPuzzle: l.secondsPerPuzzle,
    lives: l.lives,
    twists: twists(l),
    unlocked: progress.isUnlocked(profile, l.id),
    stars: profile.journey.stars[l.id] || 0,
  }));

  res.json({
    regions: regions,
    levels: levels,
    currentLevel: progress.currentLevel(profile, config.levels.length),
  });
});

router.get('/profile', (req, res) => {
  const profile = profileFor(req);
  res.json({
    username: profile.username,
    wins: profile.wins,
    bestTimeMs: profile.bestTimeMs,
    totalStars: progress.totalStars(profile),
    maxStars: config.levels.length * 3,
    trophies: profile.trophies,
    history: profile.history.slice(0, 5),
  });
});

// lets the page carry on a level after a refresh
router.get('/current', (req, res) => {
  const attempt = req.session.attempt;
  if (!attempt) {
    return res.json({ active: false });
  }
  const state = stateOf(attempt, getLevel(attempt.levelId), Date.now());
  res.json({ active: true, ...state });
});

router.post('/levels/:id/start', async (req, res) => {
  const id = Number(req.params.id);
  const level = Number.isInteger(id) ? getLevel(id) : undefined;

  if (!level) {
    return res.status(404).json({ error: 'No such level' });
  }
  if (!progress.isUnlocked(profileFor(req), id)) {
    return res.status(403).json({ error: 'Level locked: clear the previous one first' });
  }

  try {
    const puzzle = await fetchPuzzle();
    const attempt = engine.newAttempt(level);
    engine.setPuzzle(attempt, puzzle.solution, puzzle.image, Date.now());
    req.session.attempt = attempt;

    bus.emit(EVENTS.LEVEL_STARTED, { username: req.session.username, level: id });
    res.json(stateOf(attempt, level, Date.now()));
  } catch (err) {
    bus.emit(EVENTS.API_ERROR, { message: err.message });
    res.status(502).json({ error: 'Puzzle service unavailable, try again' });
  }
});

// asks Banana for a new puzzle again after it failed in the middle of a level
router.post('/puzzle', async (req, res) => {
  const attempt = req.session.attempt;
  if (!attempt) {
    return res.status(400).json({ error: 'No active level' });
  }
  const level = getLevel(attempt.levelId);

  if (attempt.solution === null) {
    try {
      const puzzle = await fetchPuzzle();
      engine.setPuzzle(attempt, puzzle.solution, puzzle.image, Date.now());
    } catch (err) {
      bus.emit(EVENTS.API_ERROR, { message: err.message });
      return res.status(502).json({ error: 'Puzzle service unavailable', needsPuzzle: true });
    }
  }
  res.json(stateOf(attempt, level, Date.now()));
});

// shared by /guess and /timeout: sends events, handles pass / fail, gets the next puzzle
async function afterStep(req, res, attempt, level, result) {
  const username = req.session.username;

  if (result.outcome === 'solved') {
    bus.emit(EVENTS.PUZZLE_SOLVED, { username: username, level: level.id, solved: attempt.solved });
  } else if (result.outcome === 'wrong') {
    bus.emit(EVENTS.GUESS_WRONG, { username: username, livesLeft: attempt.lives });
  } else {
    bus.emit(EVENTS.TIMER_EXPIRED, { username: username, livesLeft: attempt.lives });
  }

  if (result.passed) {
    return completeLevel(req, res, attempt, level);
  }

  if (result.failed) {
    bus.emit(EVENTS.LEVEL_FAILED, { username: username, level: level.id });
    delete req.session.attempt;
    return res.json({ outcome: result.outcome, levelFailed: true, lives: 0, name: level.name });
  }

  if (result.needsNewPuzzle) {
    try {
      const puzzle = await fetchPuzzle();
      engine.setPuzzle(attempt, puzzle.solution, puzzle.image, Date.now());
    } catch (err) {
      bus.emit(EVENTS.API_ERROR, { message: err.message });
      return res.status(502).json({ error: 'Puzzle service unavailable', needsPuzzle: true });
    }
  }

  const state = stateOf(attempt, level, Date.now());
  // only send the image when there is a new puzzle, otherwise the page keeps the old one
  res.json({
    outcome: result.outcome,
    ...state,
    image: result.needsNewPuzzle ? state.image : null,
  });
}

function completeLevel(req, res, attempt, level) {
  const stars = engine.starsFor(attempt, level);
  const profile = profileFor(req);
  const result = progress.recordClear(profile, config, level, stars, attempt.activeMs);
  store.saveProfiles();
  delete req.session.attempt;

  const username = req.session.username;
  bus.emit(EVENTS.LEVEL_COMPLETED, {
    username: username,
    level: level.id,
    name: level.name,
    stars: stars,
    timeMs: attempt.activeMs,
  });
  result.newTrophies.forEach((trophy) => {
    bus.emit(EVENTS.TROPHY_FOUND, { username: username, trophy: trophy });
  });
  if (result.treasureFound) {
    bus.emit(EVENTS.TREASURE_FOUND, { username: username, timeMs: result.journeyTimeMs, wins: result.wins });
  }

  res.json({
    outcome: 'solved',
    levelComplete: true,
    name: level.name,
    stars: stars,
    timeMs: attempt.activeMs,
    ...result,
    nextLevel: progress.currentLevel(profile, config.levels.length),
  });
}

router.post('/guess', async (req, res) => {
  const attempt = req.session.attempt;
  if (!attempt) {
    return res.status(400).json({ error: 'No active level' });
  }
  if (attempt.solution === null) {
    return res.status(409).json({ error: 'Puzzle not loaded yet', needsPuzzle: true });
  }

  const guess = Number(req.body && req.body.guess);
  if (!Number.isInteger(guess) || guess < 0 || guess > 9) {
    return res.status(400).json({ error: 'Guess must be a digit 0-9' });
  }

  const level = getLevel(attempt.levelId);
  const result = engine.applyGuess(attempt, level, guess, Date.now());
  afterStep(req, res, attempt, level, result);
});

// the page's countdown reached zero. The server checks the time itself so the
// browser can't just send this to lose or skip a puzzle.
router.post('/timeout', async (req, res) => {
  const attempt = req.session.attempt;
  if (!attempt) {
    return res.status(400).json({ error: 'No active level' });
  }
  if (attempt.solution === null) {
    return res.status(409).json({ error: 'Puzzle not loaded yet', needsPuzzle: true });
  }

  const level = getLevel(attempt.levelId);
  if (engine.remainingMs(attempt, level, Date.now()) > 1000) {
    return res.status(400).json({ error: 'Time has not run out yet' });
  }

  const result = engine.applyTimeout(attempt, 'timeout');
  afterStep(req, res, attempt, level, result);
});

module.exports = { router };
