const fs = require('fs');

let playersLog = [];
const logFile = 'playersLog.json';

if (fs.existsSync(logFile)) {
  playersLog = JSON.parse(fs.readFileSync(logFile, 'utf8'));
}

function logPlayer(id, name, timestamp) {
  playersLog.push({ id, name, timestamp });
  fs.writeFileSync(logFile, JSON.stringify(playersLog, null, 2));
}

module.exports = { logPlayer };
