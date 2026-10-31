// Player progress: unlocking levels, trophies, wins and the leaderboard.
// A "journey" is one run from level 1 to the treasure. After a win it resets so the
// hunt can be done again, which is what makes the number of wins mean something.

const MAX_HISTORY = 20;

function newProfile(username) {
  return {
    username: username,
    wins: 0,
    bestTimeMs: null,
    bestStars: {},        // best stars ever for each level
    trophies: [],
    history: [],          // times of past completed hunts
    journey: { stars: {}, levelTimes: {} },
  };
}

// level 1 is always open, the others open when the one before is cleared
function isUnlocked(profile, levelId) {
  if (levelId === 1) return true;
  return profile.journey.stars[levelId - 1] !== undefined;
}

// the first level that has not been cleared in this journey
function currentLevel(profile, levelCount) {
  for (let i = 1; i <= levelCount; i++) {
    if (profile.journey.stars[i] === undefined) return i;
  }
  return levelCount;
}

// called when a level is cleared, returns what happened (new trophies, treasure found...)
function recordClear(profile, config, level, stars, timeMs) {
  const journey = profile.journey;
  const result = { newTrophies: [], treasureFound: false };

  // keep the best stars and the best time for this level
  if (journey.stars[level.id] === undefined || stars > journey.stars[level.id]) {
    journey.stars[level.id] = stars;
  }
  const oldTime = journey.levelTimes[level.id];
  if (oldTime === undefined || timeMs < oldTime) {
    journey.levelTimes[level.id] = timeMs;
  }
  if (profile.bestStars[level.id] === undefined || stars > profile.bestStars[level.id]) {
    profile.bestStars[level.id] = stars;
  }

  // the last level of each region has a chest, only given the first time
  const region = config.regions.find((r) => r.id === level.region);
  const levelsInRegion = config.levels.filter((l) => l.region === level.region);
  const lastLevelOfRegion = levelsInRegion[levelsInRegion.length - 1];
  const alreadyHasChest = profile.trophies.some((t) => t.id === region.chest.id);

  if (lastLevelOfRegion.id === level.id && !alreadyHasChest) {
    const trophy = {
      id: region.chest.id,
      name: region.chest.name,
      emoji: region.chest.emoji,
      foundAt: new Date().toISOString(),
    };
    profile.trophies.push(trophy);
    result.newTrophies.push(trophy);
  }

  // clearing the very last level means the treasure is found
  if (level.id === config.levels.length) {
    let journeyTimeMs = 0;
    Object.values(journey.levelTimes).forEach((t) => {
      journeyTimeMs += t;
    });

    profile.wins += 1;
    const isRecord = profile.bestTimeMs === null || journeyTimeMs < profile.bestTimeMs;
    if (isRecord) {
      profile.bestTimeMs = journeyTimeMs;
    }

    profile.history.unshift({ timeMs: journeyTimeMs, at: new Date().toISOString() });
    profile.history = profile.history.slice(0, MAX_HISTORY);

    // start a fresh hunt
    profile.journey = { stars: {}, levelTimes: {} };

    result.treasureFound = true;
    result.journeyTimeMs = journeyTimeMs;
    result.wins = profile.wins;
    result.isRecord = isRecord;
  }

  return result;
}

// only players who have found the treasure at least once are listed
function rankLeaderboard(profiles, sort, limit) {
  const rows = profiles
    .filter((p) => p.wins > 0)
    .map((p) => ({ username: p.username, wins: p.wins, bestTimeMs: p.bestTimeMs }));

  if (sort === 'fastest') {
    rows.sort((a, b) => a.bestTimeMs - b.bestTimeMs || b.wins - a.wins || a.username.localeCompare(b.username));
  } else {
    rows.sort((a, b) => b.wins - a.wins || a.bestTimeMs - b.bestTimeMs || a.username.localeCompare(b.username));
  }
  return rows.slice(0, limit || 10);
}

function totalStars(profile) {
  let total = 0;
  Object.values(profile.bestStars).forEach((n) => {
    total += n;
  });
  return total;
}

module.exports = { newProfile, isUnlocked, currentLevel, recordClear, rankLeaderboard, totalStars };
