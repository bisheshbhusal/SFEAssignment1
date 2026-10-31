// Unit tests for the pure rules engine and progress logic (no server, no network).
const test = require('node:test');
const assert = require('node:assert');
const engine = require('../src/engine');
const progress = require('../src/progress');
const { config: cfg, getLevel } = require('../src/levels');

const T0 = 1_000_000;
function attemptOn(levelId, solution = 5) {
  const level = getLevel(levelId);
  const a = engine.newAttempt(level);
  engine.setPuzzle(a, solution, 'img', T0);
  return { a, level };
}

test('correct guess advances; last puzzle passes the level', () => {
  const { a, level } = attemptOn(1);
  for (let i = 1; i <= level.puzzles; i++) {
    const r = engine.applyGuess(a, level, 5, T0 + 1000);
    assert.strictEqual(r.outcome, 'solved');
    assert.strictEqual(r.passed, i === level.puzzles);
    if (!r.passed) engine.setPuzzle(a, 5, 'img', T0);
  }
  assert.strictEqual(engine.starsFor(a, level), 3);
});

test('wrong guess costs a life; same puzzle stays on easy levels', () => {
  const { a, level } = attemptOn(1);
  const r = engine.applyGuess(a, level, 9, T0 + 500);
  assert.strictEqual(r.outcome, 'wrong');
  assert.strictEqual(a.lives, level.lives - 1);
  assert.strictEqual(r.needsNewPuzzle, false);
  assert.strictEqual(a.solution, 5);
});

test('mountain levels: wrong answer costs time penalty', () => {
  const { a, level } = attemptOn(4);
  const before = engine.remainingMs(a, level, T0);
  engine.applyGuess(a, level, 9, T0);
  assert.strictEqual(before - engine.remainingMs(a, level, T0), level.penaltySeconds * 1000);
});

test('volcano levels: wrong answer swaps the puzzle', () => {
  const { a, level } = attemptOn(7);
  const r = engine.applyGuess(a, level, 9, T0);
  assert.strictEqual(r.needsNewPuzzle, true);
  assert.strictEqual(a.solution, null);
});

test('answering after the time limit counts as a timeout, even if correct', () => {
  const { a, level } = attemptOn(1);
  const r = engine.applyGuess(a, level, 5, T0 + level.secondsPerPuzzle * 1000 + engine.GRACE_MS + 1);
  assert.strictEqual(r.outcome, 'timeout');
  assert.strictEqual(a.livesLost, 1);
});

test('losing all lives fails the level', () => {
  const { a, level } = attemptOn(7);
  let r;
  for (let i = 0; i < level.lives; i++) { r = engine.applyGuess(a, level, 9, T0); engine.setPuzzle(a, 5, 'img', T0); }
  assert.strictEqual(r.failed, true);
});

test('stars: 0 mistakes=3, 1=2, more=1', () => {
  const level = getLevel(1);
  const quick = { solved: 3, activeMs: 3000 };
  assert.strictEqual(engine.starsFor({ livesLost: 0, ...quick }, level), 3);
  assert.strictEqual(engine.starsFor({ livesLost: 1, ...quick }, level), 2);
  assert.strictEqual(engine.starsFor({ livesLost: 4, ...quick }, level), 1);
});

test('levels unlock one at a time', () => {
  const p = progress.newProfile('x');
  assert.ok(progress.isUnlocked(p, 1));
  assert.ok(!progress.isUnlocked(p, 2));
  progress.recordClear(p, cfg, getLevel(1), 3, 1000);
  assert.ok(progress.isUnlocked(p, 2));
  assert.strictEqual(progress.currentLevel(p, cfg.levels.length), 2);
});

test('region chest is awarded once; treasure win resets the journey and counts wins', () => {
  const p = progress.newProfile('x');
  let last;
  for (const l of cfg.levels) last = progress.recordClear(p, cfg, l, 3, 1000);
  assert.strictEqual(last.treasureFound, true);
  assert.strictEqual(p.wins, 1);
  assert.strictEqual(p.bestTimeMs, cfg.levels.length * 1000);
  assert.strictEqual(p.trophies.length, 3);
  assert.deepStrictEqual(p.journey.stars, {});            // fresh hunt
  for (const l of cfg.levels) last = progress.recordClear(p, cfg, l, 3, 500);
  assert.strictEqual(p.wins, 2);
  assert.strictEqual(p.bestTimeMs, cfg.levels.length * 500); // new record
  assert.strictEqual(p.trophies.length, 3);                  // no duplicate trophies
});

test('replaying a level inside one hunt keeps the best time', () => {
  const p = progress.newProfile('x');
  progress.recordClear(p, cfg, getLevel(1), 2, 9000);
  progress.recordClear(p, cfg, getLevel(1), 3, 4000);
  assert.strictEqual(p.journey.levelTimes[1], 4000);
  assert.strictEqual(p.journey.stars[1], 3);
});

test('leaderboard: ignores non-winners; sorts by wins or by fastest', () => {
  const mk = (username, wins, bestTimeMs) => ({ username, wins, bestTimeMs });
  const ps = [mk('amy', 3, 90000), mk('ben', 1, 50000), mk('cat', 0, null), mk('dan', 3, 80000)];
  assert.deepStrictEqual(progress.rankLeaderboard(ps, 'wins').map((r) => r.username), ['dan', 'amy', 'ben']);
  assert.deepStrictEqual(progress.rankLeaderboard(ps, 'fastest').map((r) => r.username), ['ben', 'dan', 'amy']);
});

test('flawless but slow run gets 2 stars, flawless and fast gets 3', () => {
  const level = getLevel(1);
  const limit = level.secondsPerPuzzle * 1000;
  const slow = { livesLost: 0, solved: 3, activeMs: 3 * limit * 0.9 };
  const fast = { livesLost: 0, solved: 3, activeMs: 3 * limit * 0.3 };
  assert.strictEqual(engine.starsFor(slow, level), 2);
  assert.strictEqual(engine.starsFor(fast, level), 3);
});

test('clearing level 1 does not unlock level 3', () => {
  const p = progress.newProfile('x');
  progress.recordClear(p, cfg, getLevel(1), 3, 1000);
  assert.ok(progress.isUnlocked(p, 2));
  assert.ok(!progress.isUnlocked(p, 3));
});