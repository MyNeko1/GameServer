import items from './items.js';

let spellReady = false;
let currentSpell = null;
let projectileActive = false;

function interpretSpell(text) {
  const letters = text.split('');
  let type = null;
  let intensity = 1;
  let effect = null;

  for (let char of letters) {
    switch (char.toLowerCase()) {
      case 'п':
        type = 'projectile';
        if (char === char.toUpperCase()) type = 'strong_projectile';
        break;
      case 'и':
        intensity += 1;
        if (char === char.toUpperCase()) intensity += 1;
        break;
      case 'у':
        effect = 'destroy';
        if (char === char.toUpperCase()) effect = 'strong_destroy';
        break;
    }
  }

  return { type, intensity, effect };
}

function launchProjectile(startX, startY, targetX, targetY, spell, grid) {
  if (projectileActive) return;

  const dx = Math.sign(targetX - startX);
  const dy = Math.sign(targetY - startY);

  let x = startX;
  let y = startY;
  let steps = 0;
  projectileActive = true;

  const interval = setInterval(() => {
    if (steps >= spell.intensity * 5) {
      clearInterval(interval);
      projectileActive = false;
      return;
    }

    x += dx;
    y += dy;

    const cell = grid[y]?.[x];
    if (!cell) {
      clearInterval(interval);
      projectileActive = false;
      return;
    }

    if (cell.type === 'wall') {
      if (spell.effect === 'destroy' || spell.effect === 'strong_destroy') {
        grid[y][x] = { type: 'empty' };
      }
      clearInterval(interval);
      projectileActive = false;
      return;
    }

    steps++;
  }, 100);
}

export function onChatMessage(text, player, grid) {
  if (!items.stick.getState()) return;

  if (/п.*и.*у/i.test(text)) {
    spellReady = true;
    currentSpell = interpretSpell(text);
  }
}

export function onClick(targetX, targetY, player, grid) {
  if (!items.stick.getState()) return;
  if (!spellReady) return;

  const { x: startX, y: startY } = player;
  launchProjectile(startX, startY, targetX, targetY, currentSpell, grid);

  spellReady = false;
  currentSpell = null;
}
