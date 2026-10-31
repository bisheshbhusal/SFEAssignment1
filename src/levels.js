// Loads the level settings from config/levels.json.
// Difficulty lives in the json file, so a new level is just a new entry there.
const config = require('../config/levels.json');

// check the file when the server starts so a typo shows up straight away
config.levels.forEach((level, i) => {
  if (level.id !== i + 1) {
    throw new Error('Level ids must go 1, 2, 3... (problem at level ' + level.id + ')');
  }
  const regionExists = config.regions.some((r) => r.id === level.region);
  if (!regionExists) {
    throw new Error('Level ' + level.id + ' has an unknown region: ' + level.region);
  }
  ['puzzles', 'secondsPerPuzzle', 'lives'].forEach((key) => {
    if (!Number.isInteger(level[key]) || level[key] < 1) {
      throw new Error('Level ' + level.id + ': ' + key + ' must be a whole number above 0');
    }
  });
});

function getLevel(id) {
  return config.levels.find((l) => l.id === id);
}

// text shown on the level card for the special rules
function twists(level) {
  const list = [];
  if (level.penaltySeconds) {
    list.push('A wrong answer costs ' + level.penaltySeconds + 's');
  }
  if (level.newPuzzleOnWrong) {
    list.push('A wrong answer swaps the puzzle');
  }
  return list;
}

module.exports = { config, getLevel, twists };
