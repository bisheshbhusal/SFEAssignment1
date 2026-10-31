// Event handlers: everything that reacts to an event is registered here
const { bus, EVENTS } = require('./events');

// latest things that happened, shown as "Expedition news" on the page
const news = [];

function addNews(text) {
  news.unshift({ text: text, at: new Date().toISOString() });
  if (news.length > 15) {
    news.pop();
  }
}

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor(ms / 1000) % 60;
  return minutes + ':' + String(seconds).padStart(2, '0');
}

function registerListeners() {
  // log every event to the console
  Object.values(EVENTS).forEach((name) => {
    bus.on(name, (data) => {
      console.log('[event]', name, JSON.stringify(data));
    });
  });

  bus.on(EVENTS.LEVEL_COMPLETED, (e) => {
    addNews(e.username + ' cleared ' + e.name + ' ' + '★'.repeat(e.stars));
  });

  bus.on(EVENTS.LEVEL_FAILED, (e) => {
    addNews(e.username + ' was beaten by level ' + e.level);
  });
  
  bus.on(EVENTS.TROPHY_FOUND, (e) => {
    addNews(e.username + ' found the ' + e.trophy.name + ' ' + e.trophy.emoji);
  });

  bus.on(EVENTS.TREASURE_FOUND, (e) => {
    addNews('🏆 ' + e.username + ' claimed the treasure in ' + formatTime(e.timeMs) + ' (win #' + e.wins + ')');
  });
}

function getNews() {
  return news.slice();
}

module.exports = { registerListeners, getNews };
