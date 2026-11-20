import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/sim/game.js';
import { buildDecor } from '../src/web/decor.js';

function approach(night, obstacles, pos) {
  return createGame({ night, obstacles, scenario: {
    player: { pos }, random_motes: false, random_shades: false, random_drifters: false,
  } });
}

for (const night of [1, 2, 3]) {
  test(`night ${night}: cottage walls, roofs, tree trunks and bushes are solid`, () => {
    const { obstacles } = buildDecor(night);
    const house = obstacles.find(o => o.halfWidth);
    const tree = obstacles.find(o => o.height > 3);
    const bush = obstacles.find(o => o.height < 2);
    for (const obstacle of [tree, bush]) {
      const { x, y, z, radius } = obstacle;
      const g = approach(night, obstacles, [x - radius - 1, y, z]);
      for (let i = 0; i < 45; i++) {
        step(g, { move: [1, 0], dash: i === 0 });
        assert.ok(g.player.pos[0] <= x - radius);
      }
      const stopped = g.player.pos[0];
      step(g, { move: [-1, 0] });
      assert.ok(g.player.pos[0] < stopped);
    }

    const { x, y, z, sin, cos, halfDepth } = house;
    const g = approach(night, obstacles, [x + sin * (halfDepth + 1), y, z + cos * (halfDepth + 1)]);
    for (let i = 0; i < 18; i++) {
      step(g, { move: [-sin, -cos], dash: i === 0, jump: i === 1 });
      assert.ok((g.player.pos[0] - x) * sin + (g.player.pos[2] - z) * cos >= halfDepth);
    }
    const roofHeight = y + house.eaves + house.rise;
    const falling = approach(night, obstacles, [x, roofHeight + 1, z]);
    for (let i = 0; i < 60; i++) step(falling, {});
    assert.equal(falling.player.grounded, true);
    assert.equal(falling.player.pos[1], roofHeight);
  });
}

test('night 2: with solid scenery on, both jump pads still land on the other island (arcs kept clear)', () => {
  const { obstacles } = buildDecor(2);
  for (const [start, dir, island] of [[[20, 0, 16.5], [0, 1], 70], [[50, 0, -16.5], [0, -1], 0]]) {
    const g = approach(2, obstacles, start);
    const events = [];
    for (let i = 0; i < 200; i++) events.push(...step(g, { move: i < 10 ? dir : [0, 0] }));
    assert.equal(events.filter((e) => e.name === 'player_hit').length, 0, 'no fall');
    assert.equal(g.player.grounded, true);
    assert.ok(Math.hypot(g.player.pos[0] - island, g.player.pos[2]) <= 28, `landed at ${g.player.pos}`);
  }
});
