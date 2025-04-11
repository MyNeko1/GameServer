const express = require('express');
const { Server } = require('ws');
const app = express();

// Раздаём статические файлы (index.html)
app.use(express.static('.'));

// Запускаем HTTP-сервер
const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});

// Настраиваем WebSocket-сервер
const wss = new Server({ server });

// Хранилище состояния игры
const tiles = new Map(); // Клетки мира
const players = new Map(); // Игроки: id -> {x, y, blocks}
let seed = Math.random() * 1000; // Сид для генерации мира

// Функция генерации клетки (аналог getCell на клиенте)
function getCell(x, y) {
  const key = `${x},${y}`;
  if (!tiles.has(key)) {
    const scale = 0.2;
    const val = perlinNoise(x * scale + seed, y * scale + seed, 0);
    tiles.set(key, (val + 1) / 2 < 0.6 ? 0 : 1);
  }
  return tiles.get(key);
}

// Функция Perlin Noise (взята из твоего кода, адаптирована для сервера)
function perlinNoise(x, y, z) {
  const p = new Array(512);
  const perm = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
  for (let i = 0; i < 256; i++) p[256 + i] = p[i] = perm[i];
  let X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  let u = fade(x), v = fade(y), w = fade(z);
  let A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
  return lerp(w, lerp(v, lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)), lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))), lerp(v, lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)), lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))));
}
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

// Обработка подключения игроков
wss.on('connection', (ws) => {
  // Генерируем уникальный ID для игрока
  const playerId = Date.now().toString() + Math.random().toString(36).substring(2);
  
  // Инициализируем игрока
  let px = 0, py = 0;
  let blocks = 0;

  // Ищем свободную клетку для стартовой позиции
  if (getCell(px, py) === 1) {
    let found = false;
    for (let r = 1; r < 100 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if ((Math.abs(dx) === r || Math.abs(dy) === r) && getCell(px + dx, py + dy) === 0) {
            px += dx;
            py += dy;
            found = true;
            break;
          }
        }
      }
    }
  }

  // Сохраняем игрока
  players.set(playerId, { x: px, y: py, blocks });

  // Отправляем игроку его ID, начальное состояние мира и список игроков
  ws.send(JSON.stringify({
    type: 'init',
    playerId,
    tiles: Object.fromEntries(tiles),
    players: Object.fromEntries(players),
    seed
  }));

  // Оповещаем всех игроков о новом игроке
  broadcast({
    type: 'playerJoin',
    playerId,
    x: px,
    y: py,
    blocks
  });

  // Обработка сообщений от игрока
  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());
    const player = players.get(playerId);

    if (data.type === 'move') {
      const { x, y } = data;
      if (getCell(x, y) === 0 && nearby(player.x, player.y, x, y)) {
        player.x = x;
        player.y = y;
        broadcast({
          type: 'playerMove',
          playerId,
          x,
          y
        });
      }
    } else if (data.type === 'break') {
      const { x, y } = data;
      if (getCell(x, y) === 1 && nearby(player.x, player.y, x, y)) {
        tiles.set(`${x},${y}`, 0);
        player.blocks++;
        broadcast({
          type: 'updateTile',
          x,
          y,
          value: 0
        });
        broadcast({
          type: 'updateBlocks',
          playerId,
          blocks: player.blocks
        });
      }
    } else if (data.type === 'build') {
      const { x, y } = data;
      if (getCell(x, y) === 0 && player.blocks > 0 && nearby(player.x, player.y, x, y)) {
        tiles.set(`${x},${y}`, 1);
        player.blocks--;
        broadcast({
          type: 'updateTile',
          x,
          y,
          value: 1
        });
        broadcast({
          type: 'updateBlocks',
          playerId,
          blocks: player.blocks
        });
      }
    }
  });

  // Обработка отключения игрока
  ws.on('close', () => {
    players.delete(playerId);
    broadcast({
      type: 'playerLeave',
      playerId
    });
  });
});

// Функция для проверки, являются ли клетки соседними
function nearby(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) <= 1 && Math.abs(y1 - y2) <= 1 && (x1 !== x2 || y1 !== y2);
}

// Функция для отправки сообщений всем игрокам
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}
