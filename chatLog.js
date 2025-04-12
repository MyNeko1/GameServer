const fs = require('fs');

let chatLog = [];
const logFile = 'chatLog.json';

if (fs.existsSync(logFile)) {
  chatLog = JSON.parse(fs.readFileSync(logFile, 'utf8'));
}

function logMessage(id, name, text, timestamp) {
  chatLog.push({ id, name, text, timestamp });
  fs.writeFileSync(logFile, JSON.stringify(chatLog, null, 2));
}

module.exports = { logMessage };
