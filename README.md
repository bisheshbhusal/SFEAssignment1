# Banana Quest

CIS046-3 Software for Enterprise, Assignment 1.

A level-based puzzle game. An explorer crosses 9 levels (Forest, Mountains, Volcano) to reach the
treasure. Every obstacle is a set of puzzles from the Banana API, and the levels get harder as you go.
Each puzzle shows a grid of equations with a banana in it, and the player works out which digit the
banana stands for. Finishing the last level finds the treasure. The map then resets so the hunt can be
done again. A trophy room and a leaderboard show how many times each player has won and their fastest hunt.

## How to run

You need Node.js 18 or newer.

```
npm install
npm start
```

Then open http://localhost:3000, register an account and play.
`npm test` runs the unit tests for the game rules.

## Game rules

- Levels are set in `config/levels.json` (number of puzzles, seconds per puzzle, lives).
- Mountains: a wrong answer takes 3 seconds off the clock. Volcano: a wrong answer swaps the puzzle.
- Stars: 3 for no mistakes, 2 for one mistake, 1 otherwise.
- A level unlocks when the one before it is cleared. Progress is saved per account.
- Hunt time = best clear time of each level added together. Winning adds one win and resets the map.
- The last level of each region has a chest (trophy), given once.

## Files

| File | What it does |
|---|---|
| `server.js` | starts the server |
| `src/app.js` | express setup, security headers, session cookie |
| `src/auth.js` | register, login, logout, password hashing |
| `src/game.js` | the game routes (map, start level, guess, timeout, profile, leaderboard) |
| `src/engine.js` | rules for one level attempt (lives, timer, stars) |
| `src/progress.js` | unlocking levels, trophies, wins, leaderboard order |
| `src/levels.js`, `config/levels.json` | level settings and a check of them |
| `src/bananaClient.js` | calls the Banana API |
| `src/events.js`, `src/listeners.js` | event bus and the event handlers |
| `src/store.js` | saves users and profiles in `data/db.json` |
| `public/` | the web page (`app.js` has the browser event handlers) |
| `test/engine.test.js` | unit tests for the rules |

## The four themes

1. **Version control:** Git repository with feature branches and tags. The code is split into small
   modules (auth, game routes, rules, progress, API client, store).
2. **Event-driven programming:** browser events (clicks, key presses, form submit, timer, custom events)
   in `public/app.js`, and a server event bus in `src/events.js` and `src/listeners.js`.
3. **Interoperability:** the server calls the Banana API over HTTPS and reads JSON (`src/bananaClient.js`),
   and the browser talks to our own JSON API under `/api`.
4. **Virtual identity:** accounts with bcrypt password hashing, session cookies, rate limited login and
   progress saved per account (`src/auth.js`, `src/app.js`).

## References

- Banana API: Marc Conrad, University of Bedfordshire, https://marcconrad.com/uob/banana/doc.php
- npm packages: express, express-session, bcryptjs.
- The first version of the code in this project was written using AI (Anthropic). I then ran it, tested it against the real Banana API, reviewed it and changed it.

Later changes(self):

- Added a new star rule that also rewards speed
- A news message when a level is failed
- Two extra unit tests.
- Redesigned the ui in dark (yellow) theme.
