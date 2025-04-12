const items = [
  { type: "blocks", name: "Блоки", count: 0, action: (player, targetX, targetY, ws, nearby, getCell, inventory) => {
    if (nearby(player.x, player.y, targetX, targetY, 2) && getCell(targetX, targetY) == 0 && inventory[0].count > 0) {
      ws.send(JSON.stringify({ type: 'build', x: targetX, y: targetY }));
    }
  }},
  { type: "sword", name: "Меч", action: (player, players, ws, nearby, myId) => {
    for (let [id, otherPlayer] of players) {
      if (id !== myId && nearby(player.x, player.y, otherPlayer.x, otherPlayer.y, 1)) {
        ws.send(JSON.stringify({ type: 'damage', targetId: id, damage: 10 }));
        break;
      }
    }
  }},
  { type: "pickaxe", name: "Кирка", action: (player, targetX, targetY, ws, nearby, getCell) => {
    if (nearby(player.x, player.y, targetX, targetY, 1) && getCell(targetX, targetY) == 1) {
      ws.send(JSON.stringify({ type: 'break', x: targetX, y: targetY }));
    }
  }},
  { type: "bow", name: "Лук", action: (player, targetX, targetY, ws, myId) => {
    ws.send(JSON.stringify({ type: 'arrow', x: player.x, y: player.y, targetX, targetY, shooterId: myId }));
  }},
  { type: "food", name: "Еда", action: (player, ws) => {
    ws.send(JSON.stringify({ type: 'heal', amount: 10 }));
  }}
];

function getItems() {
  return items;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getItems };
}
