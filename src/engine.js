// The rules for one attempt at a level (lives, timer, stars).
// Nothing here uses the network or reads the clock, the current time is passed in.
// That keeps it simple to test.

// extra time allowed so a slow connection isn't punished
const GRACE_MS = 1500;

function newAttempt(level) {
  return {
    levelId: level.id,
    solved: 0,
    lives: level.lives,
    livesLost: 0,
    activeMs: 0,       // total thinking time on solved puzzles
    solution: null,
    image: null,
    issuedAt: null,    // when the current puzzle was given out
  };
}

function setPuzzle(attempt, solution, image, now) {
  attempt.solution = solution;
  attempt.image = image;
  attempt.issuedAt = now;
}

function remainingMs(attempt, level, now) {
  const left = level.secondsPerPuzzle * 1000 - (now - attempt.issuedAt);
  return Math.max(0, left);
}

// returns true when the player has no lives left
function loseLife(attempt) {
  attempt.lives -= 1;
  attempt.livesLost += 1;
  return attempt.lives <= 0;
}

function applyTimeout(attempt, outcome) {
  const failed = loseLife(attempt);
  // the puzzle is used up, so a new one is needed
  attempt.solution = null;
  attempt.image = null;
  return { outcome: outcome || 'timeout', passed: false, failed: failed, needsNewPuzzle: !failed };
}

function applyGuess(attempt, level, guess, now) {
  const limit = level.secondsPerPuzzle * 1000;
  const elapsed = now - attempt.issuedAt;

  // answered too late, even a correct answer does not count
  if (elapsed > limit + GRACE_MS) {
    return applyTimeout(attempt, 'timeout');
  }

  if (guess === attempt.solution) {
    attempt.solved += 1;
    attempt.activeMs += Math.min(elapsed, limit);
    const passed = attempt.solved >= level.puzzles;
    if (!passed) {
      attempt.solution = null;
      attempt.image = null;
    }
    return { outcome: 'solved', passed: passed, failed: false, needsNewPuzzle: !passed };
  }

  // wrong answer
  const failed = loseLife(attempt);

  // mountain levels: a wrong answer takes time off the clock
  if (level.penaltySeconds) {
    attempt.issuedAt -= level.penaltySeconds * 1000;
  }

  // volcano levels: a wrong answer gives a new puzzle
  const swap = !failed && level.newPuzzleOnWrong === true;
  if (swap) {
    attempt.solution = null;
    attempt.image = null;
  }

  return { outcome: 'wrong', passed: false, failed: failed, needsNewPuzzle: swap };
}

// 3 stars for no mistakes, 2 for one mistake, 1 otherwise
function starsFor(attempt) {
  if (attempt.livesLost === 0) return 3;
  if (attempt.livesLost === 1) return 2;
  return 1;
}

module.exports = { GRACE_MS, newAttempt, setPuzzle, remainingMs, applyGuess, applyTimeout, starsFor };
