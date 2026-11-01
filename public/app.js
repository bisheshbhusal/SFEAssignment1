// Browser side of Banana Quest.
// Most of this file is event handlers: clicks, key presses, form submits, the
// countdown timer and two custom events. The server decides all the rules,
// this file just shows what the server sends back.

(function () {
  const $ = (id) => document.getElementById(id);

  const STEP = 88;  // distance between map nodes in pixels (64px node + 24px gap)

  // all the page elements we need
  const el = {
    authPanel: $('auth-panel'),
    authForm: $('auth-form'),
    username: $('username'),
    password: $('password'),
    registerBtn: $('register-btn'),
    root: $('game-root'),
    playerName: $('player-name'),
    logoutBtn: $('logout-btn'),
    tabs: $('tabs'),
    path: $('path'),
    levelCard: $('level-card'),
    playTitle: $('play-title'),
    retreatBtn: $('retreat-btn'),
    hearts: $('hearts'),
    dots: $('dots'),
    timerText: $('timer-text'),
    timerFill: $('timer-fill'),
    puzzle: $('puzzle'),
    retryBtn: $('retry-btn'),
    keypad: $('keypad'),
    message: $('message'),
    stats: $('stats'),
    trophyGrid: $('trophy-grid'),
    history: $('history'),
    board: $('leaderboard'),
    news: $('feed'),
    dialog: $('result-dialog'),
    resultBody: $('result-body'),
    newsCard: $('news-card'),
  };

  // current state of the page
  let me = null;            // username of the logged in player
  let meta = null;          // map data from the server (levels and regions)
  let selectedId = 1;       // level picked on the map
  let explorerIdx = 0;      // where the explorer is standing on the map
  let playing = false;      // true while the keypad is usable
  let deadline = 0;         // time (performance.now) when the current puzzle runs out
  let limitMs = 1;          // time allowed for one puzzle, used for the bar width
  let tickHandle = null;    // id of the setInterval for the countdown
  let sortMode = 'wins';    // leaderboard sorting

  // ---------- small helper functions ----------

  function say(text, kind) {
    el.message.textContent = text;
    el.message.className = kind || '';
  }

  function stars(n) {
    return '★'.repeat(n) + '☆'.repeat(3 - n);
  }

  function limitFor(levelId) {
    const level = meta.levels.find((l) => l.id === levelId);
    return level.secondsPerPuzzle * 1000;
  }

  function formatTime(ms) {
    const s = ms / 1000;
    const minutes = Math.floor(s / 60);
    const seconds = (s % 60).toFixed(1).padStart(4, '0');
    return minutes + ':' + seconds;
  }

  // makes an element with text. textContent is used (not innerHTML) so
  // usernames can't inject html into the page
  function make(tag, text, className) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  }

  // calls our own server (JSON in, JSON out)
  async function api(path, body) {
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',   // sends the session cookie
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed (' + res.status + ')');
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---------- custom events ----------
  // when the server sends a new game state we announce it with an event and the
  // listeners below update the screen

  function announce(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }

  document.addEventListener('quest:state', (e) => {
    const s = e.detail;
    el.playTitle.textContent = 'Level ' + s.levelId + ': ' + s.name;
    el.hearts.textContent = '❤️'.repeat(s.lives) + '🖤'.repeat(s.maxLives - s.lives);
    el.dots.textContent = '●'.repeat(s.solved) + '○'.repeat(s.total - s.solved);
    if (s.image) {
      el.puzzle.src = s.image;
      el.puzzle.hidden = false;
    }
    startCountdown(s.remainingMs, limitFor(s.levelId));
  });

  document.addEventListener('quest:result', (e) => {
    showResult(e.detail);
  });

  // ---------- countdown timer ----------

  function startCountdown(remainingMs, perPuzzleMs) {
    clearInterval(tickHandle);
    limitMs = perPuzzleMs || Math.max(remainingMs, 1);
    deadline = performance.now() + remainingMs;
    tickHandle = setInterval(onTick, 100);
    onTick();
  }

  function stopCountdown() {
    clearInterval(tickHandle);
    tickHandle = null;
  }

  // runs every 100ms
  function onTick() {
    const left = Math.max(0, deadline - performance.now());
    el.timerText.textContent = (left / 1000).toFixed(1) + 's';
    el.timerFill.style.width = Math.min(100, (left / limitMs) * 100) + '%';
    el.timerFill.classList.toggle('low', left < 5000);

    if (left <= 0 && playing) {
      onTimeUp();
    }
  }

  async function onTimeUp() {
    setPlaying(false);
    stopCountdown();
    try {
      handleStep(await api('/api/game/timeout', {}));
    } catch (err) {
      handleError(err);
    }
  }

  // ---------- switching between views ----------

  function showView(name) {
    document.querySelectorAll('.view').forEach((v) => {
      v.hidden = v.id !== 'view-' + name;
    });
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.view === name);
    });
    if (name === 'map') loadMap();
    if (name === 'trophies') loadTrophies();
    if (name === 'board') loadBoard();
  }

  function setPlaying(on) {
    playing = on;
    el.keypad.querySelectorAll('button').forEach((b) => {
      b.disabled = !on;
    });
  }

  // ---------- map ----------

  async function loadMap() {
    try {
      meta = await api('/api/game/map');
    } catch (err) {
      return say(err.message, 'bad');
    }
    renderMap();
    loadNews();
  }

  function renderMap() {
    const targetIdx = meta.currentLevel - 1;
    el.path.replaceChildren();

    // coloured bar and name behind each region
    meta.regions.forEach((r) => {
      const left = (r.firstLevel - 1) * STEP + 8;
      const width = (r.lastLevel - r.firstLevel + 1) * STEP - 24 + 16;

      const bar = make('div', undefined, 'region-bar');
      bar.style.left = left + 'px';
      bar.style.width = width + 'px';
      bar.style.background = 'var(--' + r.id + ')';

      const label = make('div', r.emoji + ' ' + r.name, 'region-label');
      label.style.left = (left + 12) + 'px';

      el.path.append(bar, label);
    });

    // one button per level
    meta.levels.forEach((l) => {
      const b = make('button', l.unlocked ? String(l.id) : '🔒', 'node');
      b.dataset.level = l.id;

      if (l.stars > 0) b.classList.add('cleared');
      else if (l.unlocked) b.classList.add('current');
      else b.classList.add('locked');

      if (l.id === selectedId) b.classList.add('selected');
      if (l.stars > 0) b.append(make('span', stars(l.stars), 'stars'));

      b.setAttribute('aria-label', 'Level ' + l.id + ': ' + l.name + (l.unlocked ? '' : ' (locked)'));
      el.path.append(b);
    });

    el.path.append(make('div', '💎', 'node treasure'));

    // the explorer starts at the old spot and then walks to the current level
    // (the css transition on "left" makes it slide)
    const explorer = make('div', '🧗');
    explorer.id = 'explorer';
    explorer.style.left = (explorerIdx * STEP + 16) + 'px';
    el.path.append(explorer);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        explorer.style.left = (targetIdx * STEP + 16) + 'px';
      });
    });
    explorerIdx = targetIdx;

    const selectedLevel = meta.levels.find((l) => l.id === selectedId);
    if (!selectedLevel || !selectedLevel.unlocked) {
      selectedId = meta.currentLevel;
    }
    renderLevelCard();
  }

  function renderLevelCard() {
    const l = meta.levels.find((x) => x.id === selectedId);
    el.levelCard.replaceChildren();
    if (!l) return;

    const region = meta.regions.find((r) => r.id === l.region);
    el.levelCard.append(make('strong', region.emoji + ' Level ' + l.id + ': ' + l.name));

    const list = make('ul');
    list.append(make('li', l.puzzles + ' puzzles, ' + l.secondsPerPuzzle + 's each, ' + l.lives + ' lives'));
    l.twists.forEach((t) => list.append(make('li', t)));
    if (l.stars) list.append(make('li', 'Your stars this hunt: ' + stars(l.stars)));
    el.levelCard.append(list);

    const startBtn = make('button', l.stars ? 'Replay level' : 'Start level');
    startBtn.id = 'start-btn';
    startBtn.disabled = !l.unlocked;
    el.levelCard.append(startBtn);
  }

  // one click handler on the whole path instead of one for every level button
  el.path.addEventListener('click', (e) => {
    const b = e.target.closest('.node[data-level]');
    if (!b) return;
    selectedId = Number(b.dataset.level);
    el.path.querySelectorAll('.node').forEach((n) => {
      n.classList.toggle('selected', n === b);
    });
    renderLevelCard();
  });

  el.levelCard.addEventListener('click', (e) => {
    if (e.target.id === 'start-btn') startLevel(selectedId);
  });

  // ---------- playing a level ----------

  async function startLevel(id) {
    try {
      say('Loading puzzle...');
      enterPlay(await api('/api/game/levels/' + id + '/start', {}));
    } catch (err) {
      say(err.message, 'bad');
    }
  }

  function enterPlay(state) {
    document.querySelectorAll('.view').forEach((v) => {
      v.hidden = v.id !== 'view-play';
    });
    el.tabs.hidden = true;
    el.retryBtn.hidden = true;
    announce('quest:state', state);
    say('What digit is the banana?');
    setPlaying(true);
  }

  function leavePlay() {
    stopCountdown();
    setPlaying(false);
    el.puzzle.hidden = true;
    el.tabs.hidden = false;
    showView('map');
  }

  // the 0-9 keypad buttons (made once, one click handler for all of them)
  for (let d = 0; d <= 9; d++) {
    const b = make('button', String(d));
    b.dataset.digit = d;
    b.disabled = true;
    el.keypad.append(b);
  }

  el.keypad.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-digit]');
    if (b) submitGuess(Number(b.dataset.digit));
  });

  // keyboard shortcut: press a number key to answer
  document.addEventListener('keydown', (e) => {
    if (!playing || e.target.tagName === 'INPUT') return;
    if (/^[0-9]$/.test(e.key)) submitGuess(Number(e.key));
  });

  async function submitGuess(digit) {
    if (!playing) return;
    setPlaying(false);   // stops double clicks while we wait for the server
    try {
      handleStep(await api('/api/game/guess', { guess: digit }));
    } catch (err) {
      handleError(err);
    }
  }

  // works out what the server's answer means for the screen
  function handleStep(r) {
    if (r.levelComplete) {
      stopCountdown();
      return announce('quest:result', { type: 'win', ...r });
    }
    if (r.levelFailed) {
      stopCountdown();
      return announce('quest:result', { type: 'fail', ...r });
    }

    if (r.outcome === 'solved') say('Correct! ✔', 'good');
    else if (r.outcome === 'wrong') say('Wrong answer!', 'bad');
    else say('Too slow! You lost a life.', 'bad');

    announce('quest:state', r);
    setPlaying(true);
  }

  async function handleError(err) {
    if (err.data && err.data.needsPuzzle) {
      return retryPuzzle();
    }
    say(err.message, 'bad');
    setPlaying(true);
  }

  // the Banana API failed in the middle of a level: progress is kept and we retry
  async function retryPuzzle() {
    stopCountdown();
    setPlaying(false);

    for (let i = 0; i < 3; i++) {
      say('Puzzle service is slow, retrying...');
      try {
        const state = await api('/api/game/puzzle', {});
        el.retryBtn.hidden = true;
        announce('quest:state', state);
        say('What digit is the banana?');
        setPlaying(true);
        return;
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    say('Puzzle service unavailable. Your progress is saved, try again.', 'bad');
    el.retryBtn.hidden = false;
  }

  el.retryBtn.addEventListener('click', retryPuzzle);

  el.retreatBtn.addEventListener('click', () => {
    say('You retreated to the map.');
    leavePlay();
  });

  // ---------- result pop up ----------

  function showResult(r) {
    const body = el.resultBody;
    body.replaceChildren();

    if (r.type === 'fail') {
      body.append(
        make('div', '💥', 'treasure-big'),
        make('h2', 'Out of lives!'),
        make('p', r.name + ' beat you this time. Try again.')
      );
    } else if (r.treasureFound) {
      const record = r.isRecord ? ' 🏅 new personal best!' : '';
      body.append(
        make('div', '👑', 'treasure-big'),
        make('h2', 'You found the treasure!'),
        make('p', 'Hunt time: ' + formatTime(r.journeyTimeMs) + record),
        make('p', 'Treasure hunts completed: ' + r.wins),
        make('p', 'The map resets so you can hunt again and beat your time.')
      );
    } else {
      body.append(
        make('h2', r.name + ' cleared!'),
        make('div', stars(r.stars), 'big-stars'),
        make('p', 'Time: ' + formatTime(r.timeMs))
      );
    }

    (r.newTrophies || []).forEach((t) => {
      body.append(make('p', t.emoji + ' You found the ' + t.name + '!'));
    });

    const okBtn = make('button', 'Back to the map');
    okBtn.addEventListener('click', () => el.dialog.close());
    body.append(okBtn);

    el.dialog.showModal();
  }

  // 'close' fires for the button and also when Escape is pressed
  el.dialog.addEventListener('close', () => {
    say('');
    leavePlay();
    loadNews();
  });

  // ---------- trophy room ----------

  function statBox(label, value) {
    const box = make('div', undefined, 'stat');
    box.append(make('b', String(value)), make('span', label));
    return box;
  }

  async function loadTrophies() {
    try {
      const results = await Promise.all([api('/api/game/profile'), api('/api/game/map')]);
      const profile = results[0];
      meta = results[1];

      el.stats.replaceChildren(
        statBox('Treasure hunts won', profile.wins),
        statBox('Fastest hunt', profile.bestTimeMs === null ? '-' : formatTime(profile.bestTimeMs)),
        statBox('Stars', profile.totalStars + '/' + profile.maxStars)
      );

      // one card for each region chest, grey if not found yet
      el.trophyGrid.replaceChildren(...meta.regions.map((r) => {
        const found = profile.trophies.find((t) => t.id === r.chest.id);
        const card = make('div', undefined, found ? 'trophy' : 'trophy locked');
        card.append(
          make('span', found ? found.emoji : '🔒', 'big'),
          make('strong', found ? found.name : '???'),
          make('div', found ? 'Found ' + new Date(found.foundAt).toLocaleDateString() : 'Clear the ' + r.name)
        );
        return card;
      }));

      if (profile.history.length === 0) {
        el.history.replaceChildren(make('li', 'No completed hunts yet.'));
      } else {
        el.history.replaceChildren(...profile.history.map((h) => {
          return make('li', formatTime(h.timeMs) + ' on ' + new Date(h.at).toLocaleDateString());
        }));
      }
    } catch (err) {
      say(err.message, 'bad');
    }
  }

  // ---------- leaderboard ----------

  async function loadBoard() {
    try {
      const rows = await api('/api/game/leaderboard?sort=' + sortMode);

      if (rows.length === 0) {
        el.board.replaceChildren(make('li', 'Nobody has found the treasure yet. Be the first!'));
        return;
      }

      el.board.replaceChildren(...rows.map((r) => {
        const li = make('li', r.username + ' ', r.username === me ? 'me' : '');
        const plural = r.wins === 1 ? '' : 's';
        li.append(make('span', r.wins + ' win' + plural + ' · fastest ' + formatTime(r.bestTimeMs), 'meta'));
        return li;
      }));
    } catch (err) {
      say(err.message, 'bad');
    }
  }

  document.querySelectorAll('.sort').forEach((b) => {
    b.addEventListener('click', () => {
      sortMode = b.dataset.sort;
      document.querySelectorAll('.sort').forEach((x) => {
        x.classList.toggle('active', x === b);
      });
      loadBoard();
    });
  });

  // ---------- expedition news ----------

  async function loadNews() {
    try {
      const items = await api('/api/game/news');
      if (items.length === 0) {
        el.news.replaceChildren(make('li', 'No news yet.'));
      } else {
        el.news.replaceChildren(...items.slice(0, 6).map((i) => make('li', i.text)));
      }
    } catch (err) {
      // news is not important, ignore errors
    }
  }

  // ---------- login / register / logout ----------

  function enterGame(username) {
    me = username;
    el.playerName.textContent = username;
    el.authPanel.hidden = true;
    el.root.hidden = false;
    el.tabs.hidden = false;
    el.newsCard.hidden = false;                       // news only shows once logged in
    document.body.classList.remove('logged-out');     // stops centering the login card
    explorerIdx = 0;
  }

  async function authenticate(path) {
    try {
      const result = await api(path, {
        username: el.username.value.trim(),
        password: el.password.value,
      });
      el.password.value = '';
      say('');
      enterGame(result.username);
      showView('map');
    } catch (err) {
      say(err.message, 'bad');
    }
  }

  el.authForm.addEventListener('submit', (e) => {
    e.preventDefault();   // stops the page reloading
    authenticate('/api/auth/login');
  });

  el.registerBtn.addEventListener('click', () => {
    if (el.authForm.reportValidity()) {
      authenticate('/api/auth/register');
    }
  });

  el.logoutBtn.addEventListener('click', async () => {
    await api('/api/auth/logout', {}).catch(() => {});
    stopCountdown();
    setPlaying(false);
    me = null;
    meta = null;
    el.root.hidden = true;
    el.authPanel.hidden = false;
    el.newsCard.hidden = true;
    document.body.classList.add('logged-out');
    say('Logged out.');
  });

  el.tabs.addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) showView(t.dataset.view);
  });

  // ---------- when the page first loads ----------
  // check if the cookie is still valid, and carry on a level if one was running

  (async function start() {
    try {
      const result = await api('/api/auth/me');
      if (result.username) {
        enterGame(result.username);
        await loadMap();
        const current = await api('/api/game/current');
        if (current.active) {
          enterPlay(current);
        } else {
          showView('map');
        }
      }
    } catch (err) {
      // not logged in, the login form stays visible
    }
    loadNews();
  })();
})();