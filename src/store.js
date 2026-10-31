// Saves users and player profiles in a json file (data/db.json).
// The rest of the code only uses the functions below, so the file could be
// swapped for a real database later without changing the routes.
const fs = require('node:fs');
const path = require('node:path');

const FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');

function load() {
  try {
    const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!db.users) db.users = [];
    if (!db.profiles) db.profiles = {};
    return db;
  } catch (err) {
    // file does not exist yet on the first run
    return { users: [], profiles: {} };
  }
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  // write to a temp file first and then rename, so a crash can't leave a half written file
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

const db = load();

function findUser(username) {
  return db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

function addUser(user) {
  db.users.push(user);
  save();
  return user;
}

function getProfile(userId) {
  return db.profiles[userId];
}

function setProfile(userId, profile) {
  db.profiles[userId] = profile;
  save();
}

function allProfiles() {
  return Object.values(db.profiles);
}

module.exports = { findUser, addUser, getProfile, setProfile, saveProfiles: save, allProfiles };
