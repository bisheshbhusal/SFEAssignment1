// Starts the web server
const { createApp } = require('./src/app');
const { registerListeners } = require('./src/listeners');

// the event handlers have to be attached before any request comes in
registerListeners();

const PORT = process.env.PORT || 3000;
createApp().listen(PORT, () => {
  console.log('Banana Quest running at http://localhost:' + PORT);
});
