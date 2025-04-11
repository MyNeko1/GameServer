const express = require('express');
const WebSocket = require('ws');
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Game</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; background: #f0f0f0; }
        canvas { border: 1px solid black; }
        #login { margin: 20px; }
        #game { display: none; }
      </style>
    </head>
    <body>
      <div id="login">
        <input type="text" id="password" placeholder="Enter password">
        <input type="text" id="name" placeholder="Enter your name">
        <button onclick="login()">Login</button>
      </div>
      <div id="game">
        <canvas id="canvas" width="800" height="600"></canvas>
        <p>Players: <span id="players"></span></p>
      </div>
      <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const passwordInput = document.getElementById('password');
        const nameInput = document.getElementById('name');
        const loginDiv = document.getElementById('login');
        const gameDiv = document.getElementById('game');
        const playersDiv = document.getElementById('players');
        let ws;

        function login() {
          const password = passwordInput.value;
          const name = nameInput.value;
          if (password === 'mysecret123' && name) {
            loginDiv.style.display = 'none';
            gameDiv.style.display = 'block';
            connect(name);
          } else {
            alert('Invalid password or name');
          }
        }

        function connect(name) {
          ws = new WebSocket('wss://' + window.location.hostname + ':' + (window.location.port || 443));
          ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'join', name }));
          };
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'update') {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              data.players.forEach(player => {
                ctx.fillStyle = player.color;
                ctx.fillRect(player.x, player.y, 20, 20);
                ctx.fillStyle = 'black';
                ctx.fillText(player.name, player.x, player.y - 10);
              });
              playersDiv.textContent = data.players.map(p => p.name).join(', ');
            }
          };
          ws.onclose = () => {
            alert('Disconnected');
            location.reload();
          };
        }

        canvas.addEventListener('mousemove', (event) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            ws.send(JSON.stringify({ type: 'move', x, y }));
          }
        });
      </script>
    </body>
    </html>
  `);
});

const players = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'join') {
      const color = '#' + Math.floor(Math.random()*16777215).toString(16);
      players.set(ws, { name: data.name, x: 400, y: 300, color });
      broadcast();
    } else if (data.type === 'move') {
      const player = players.get(ws);
      if (player) {
        player.x = data.x;
        player.y = data.y;
        broadcast();
      }
    }
  });

  ws.on('close', () => {
    players.delete(ws);
    broadcast();
  });
});

function broadcast() {
  const data = {
    type: 'update',
    players: Array.from(players.values())
  };
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
