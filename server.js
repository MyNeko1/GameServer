const express = require('express');
const WebSocket = require('ws');
const app = express();
const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    threshold: 1024
  }
});
let tiles = [];
let players = new Map();
let seed = Math.random() * 1000;
let updatesBuffer = [];
function Noise() {
  this.p = new Array(512);
  this.perm = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
  for (let i = 0; i < 256; i++) this.p[256 + i] = this.p[i] = this.perm[i];
}
Noise.prototype.noise = function(x, y, z) {
  let p = this.p, X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  let u = fade(x), v = fade(y), w = fade(z);
  let A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
  return lerp(w, lerp(v, lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)), lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))), lerp(v, lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)), lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))));
};
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(t, a, b) {
  return a + t * (b - a);
}
function grad(h, x, y, z) {
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : (h == 12 || h == 14 ? x : z);
  return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
}
const perlin = new Noise();
function getCell(x, y) {
  if (!tiles[x]) tiles[x] = [];
  if (tiles[x][y] === undefined) {
    let scale = 0.2;
    let val = perlin.noise(x * scale + seed, y * scale + seed, 0);
    tiles[x][y] = (val + 1) / 2 < 0.6 ? 0 : 1;
  }
  return tiles[x][y];
}
function setCell(x, y, val) {
  if (!tiles[x]) tiles[x] = [];
  tiles[x][y] = val;
}
function nearby(x1, y1, x2, y2, range = 1) {
  return Math.abs(x1 - x2) <= range && Math.abs(y1 - y2) <= range && (x1 != x2 || y1 != y2);
}
function isInRange(x1, y1, x2, y2, range) {
  return Math.abs(x1 - x2) <= range && Math.abs(y1 - y2) <= range;
}
function generateInitialTiles() {
  for (let x = -50; x <= 50; x++) {
    for (let y = -50; y <= 50; y++) {
      getCell(x, y);
    }
  }
}
generateInitialTiles();
const usedColors = new Set();
function getUniqueColor() {
  const colors = ['#FF5555', '#55FF55', '#5555FF', '#FFFF55', '#FF55FF', '#55FFFF', '#FFAA55', '#55FFAA'];
  for (let color of colors) {
    if (!usedColors.has(color)) {
      usedColors.add(color);
      return color;
    }
  }
  return '#' + Math.floor(Math.random()*16777215).toString(16);
}
function queueUpdate(message) {
  updatesBuffer.push(message);
}
setInterval(() => {
  if (updatesBuffer.length === 0) return;
  const updates = [...updatesBuffer];
  updatesBuffer = [];
  const groupedUpdates = new Map();
  updates.forEach(update => {
    const key = JSON.stringify({ type: update.type, id: update.id, x: update.x, y: update.y });
    groupedUpdates.set(key, update);
  });
  const deduplicatedUpdates = Array.from(groupedUpdates.values());
  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const playerId = client.playerId;
    const player = players.get(playerId);
    if (!player) return;
    const visibleUpdates = deduplicatedUpdates.filter((update) => {
      if (update.type === 'updatePlayer' || update.type === 'join') {
        const otherPlayer = update.type === 'join' ? update.player : players.get(update.id);
        return isInRange(player.x, player.y, otherPlayer.x, otherPlayer.y, 15);
      }
      if (update.type === 'updateTile') {
        return isInRange(player.x, player.y, update.x, update.y, 15);
      }
      if (update.type === 'chat') {
        const otherPlayer = players.get(update.id);
        return isInRange(player.x, player.y, otherPlayer.x, otherPlayer.y, 15);
      }
      if (update.type === 'arrow') {
        return isInRange(player.x, player.y, update.x, update.y, 15) || isInRange(player.x, player.y, update.targetX, update.targetY, 15);
      }
      return true;
    });
    if (visibleUpdates.length > 0) {
      client.send(JSON.stringify({ type: 'batch', updates: visibleUpdates }));
    }
  });
}, 100);
wss.on('connection', (ws) => {
  const id = Date.now() + Math.random();
  ws.playerId = id;
  let player = { x: 0, y: 0, blocks: 0, hp: 100, name: '', color: getUniqueColor() };
  if (getCell(player.x, player.y) == 1) {
    let found = false;
    for (let r = 1; r < 100 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if ((Math.abs(dx) == r || Math.abs(dy) == r) && getCell(player.x + dx, player.y + dy) == 0) {
            player.x += dx;
            player.y += dy;
            found = true;
            break;
          }
        }
      }
    }
  }
  players.set(id, player);
  const tilesData = {};
  for (let x = -50; x <= 50; x++) {
    for (let y = -50; y <= 50; y++) {
      if (tiles[x] && tiles[x][y] !== undefined) {
        tilesData[x + "," + y] = tiles[x][y];
      }
    }
  }
  ws.send(JSON.stringify({ type: 'init', id, players: Object.fromEntries(players), tiles: tilesData }));
  queueUpdate({ type: 'join', id, player });
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    const player = players.get(id);
    if (data.type === 'setName') {
      player.name = data.name;
      queueUpdate({ type: 'updatePlayer', id, player });
    } else if (data.type === 'move') {
      const { x, y } = data;
      if (nearby(player.x, player.y, x, y, 1) && getCell(x, y) == 0) {
        player.x = x;
        player.y = y;
        queueUpdate({ type: 'updatePlayer', id, player });
      }
    } else if (data.type === 'break') {
      const { x, y } = data;
      if (nearby(player.x, player.y, x, y, 1) && getCell(x, y) == 1) {
        setCell(x, y, 0);
        player.blocks++;
        queueUpdate({ type: 'updateTile', x, y, value: 0 });
        queueUpdate({ type: 'updatePlayer', id, player });
      }
    } else if (data.type === 'build') {
      const { x, y } = data;
      if (nearby(player.x, player.y, x, y, 2) && getCell(x, y) == 0 && player.blocks > 0) {
        setCell(x, y, 1);
        player.blocks--;
        queueUpdate({ type: 'updateTile', x, y, value: 1 });
        queueUpdate({ type: 'updatePlayer', id, player });
      }
    } else if (data.type === 'chat') {
      const timestamp = Date.now();
      queueUpdate({ type: 'chat', id, text: data.text, timestamp });
    } else if (data.type === 'damage') {
      const target = players.get(data.targetId);
      if (target) {
        target.hp = Math.max(0, target.hp - data.damage);
        if (target.hp === 0) {
          target.hp = 100;
          let found = false;
          for (let r = 1; r < 100 && !found; r++) {
            for (let dy = -r; dy <= r && !found; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                if ((Math.abs(dx) == r || Math.abs(dy) == r) && getCell(target.x + dx, target.y + dy) == 0) {
                  target.x += dx;
                  target.y += dy;
                  found = true;
                  break;
                }
              }
            }
          }
        }
        queueUpdate({ type: 'updatePlayer', id: data.targetId, player: target });
      }
    } else if (data.type === 'heal') {
      player.hp = Math.min(100, player.hp + data.amount);
      queueUpdate({ type: 'updatePlayer', id, player });
    } else if (data.type === 'arrow') {
      queueUpdate({ type: 'arrow', x: data.x, y: data.y, targetX: data.targetX, targetY: data.targetY, shooterId: data.shooterId });
    }
  });
  ws.on('close', () => {
    usedColors.delete(player.color);
    players.delete(id);
    queueUpdate({ type: 'leave', id });
  });
});
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
