const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const Daily = require('./daily.js');
const context = { window: { WordLinksDaily: Daily }, Intl, Date, console, document: {}, setInterval() {} };
let source = fs.readFileSync('script.js', 'utf8');
source = source.replace('void initialize();', 'window.Engine = { seedGame, validatePlacement, applyPlacement, startsAreConnected, solvePuzzle, restoreProgress };');
vm.createContext(context);
vm.runInContext(source, context);
const engine = context.window.Engine;
// A fresh module evaluation must not depend on the previously opened edition.
const freshContext = { window: {}, Intl, Date };
vm.createContext(freshContext);
vm.runInContext(fs.readFileSync('daily.js', 'utf8'), freshContext);
assert.equal(JSON.stringify(Daily.makePuzzle('2026-10-03')), JSON.stringify(freshContext.window.WordLinksDaily.makePuzzle('2026-10-03')));
const samples = [];
for (let i = 0; i < 365; i++) {
  const date = Daily.addDays(Daily.LAUNCH, i), puzzle = Daily.makePuzzle(date);
  assert.equal(JSON.stringify(puzzle), JSON.stringify(Daily.makePuzzle(date)));
  assert(engine.solvePuzzle(puzzle), `No legal solution for ${date}`);
  if (i < 7) samples.push({date, weekday:puzzle.weekday, difficulty:puzzle.difficulty, route:puzzle.solution.length, target:puzzle.parScore, starts:puzzle.starters});
}
assert.equal(new Set(samples.map((p) => JSON.stringify(p.starts))).size, 7);
const fixed = Daily.makePuzzle('2026-10-03'), game = engine.seedGame(fixed);
assert.equal(game.score, 0);
let before = JSON.stringify(game);
assert.equal(engine.validatePlacement(game, {word:'WATER',row:14,col:14,direction:'horizontal'}).code, 'off-board');
assert.equal(JSON.stringify(game), before);
for (const [draft, expected] of [
  [{word:'WATER',row:13,col:0,direction:'horizontal'}, 'no-cross'],
  [{word:'MAP',row:0,col:8,direction:'horizontal'}, 'letter-mismatch'],
  [{word:'WORD',row:0,col:8,direction:'vertical'}, 'same-direction']
]) {
  assert.equal(engine.validatePlacement(game, draft).code, expected);
  assert.equal(JSON.stringify(game), before);
}
fixed.solution.forEach((move, i) => {
  const result = engine.validatePlacement(game, move);
  assert(result.valid);
  assert.equal(result.bridge, i === fixed.solution.length - 1);
  const previous = game.score;
  engine.applyPlacement(game, result);
  assert.equal(game.score - previous, 10 + move.text.length);
});
assert(engine.startsAreConnected(game));
for (const [beforeMidnight, afterMidnight, dateBefore, dateAfter] of [
  ['2026-10-04T03:59:59Z','2026-10-04T04:00:00Z','2026-10-03','2026-10-04'],
  ['2026-11-02T04:59:59Z','2026-11-02T05:00:00Z','2026-11-01','2026-11-02'],
  ['2027-03-15T03:59:59Z','2027-03-15T04:00:00Z','2027-03-14','2027-03-15']
]) {
  assert.equal(Daily.dateInNewYork(new Date(beforeMidnight)), dateBefore);
  assert.equal(Daily.dateInNewYork(new Date(afterMidnight)), dateAfter);
  assert.equal(Daily.nextMidnight(new Date(beforeMidnight)).toISOString(), new Date(afterMidnight).toISOString());
}
assert(!Daily.available('2026-10-04', '2026-10-03'));
assert(!Daily.available('2026-09-27', '2026-10-03'));
assert(Daily.available('2026-09-28', '2026-10-03'));
// Exercise the actual rollover handler with controlled instants and UI stubs.
const rollover = {
  Daily, Date, currentDate: '2026-10-03', archiveMonth: '2026-10', viewingToday: true,
  opened: [], rendered: [],
  openPuzzle(date) { rollover.opened.push(date); },
  renderDaily() { rollover.rendered.push('daily'); },
  renderArchive() { rollover.rendered.push('archive'); }
};
vm.createContext(rollover);
const handler = source.match(/  function checkDayChange\([\s\S]*?\n  }/)[0];
vm.runInContext(handler, rollover);
assert.equal(rollover.checkDayChange(new Date('2026-10-04T03:59:59Z')), false);
assert.equal(rollover.checkDayChange(new Date('2026-10-04T04:00:00Z')), true);
assert.deepEqual(rollover.opened, ['2026-10-04']);
rollover.viewingToday = false;
assert(rollover.checkDayChange(new Date('2026-10-05T04:00:00Z')));
assert.deepEqual(rollover.opened, ['2026-10-04']);
assert.deepEqual(rollover.rendered, ['daily', 'archive']);
console.log(JSON.stringify(samples, null, 2));
console.log('PASS: 365 deterministic and solvable dates, varied weekly layouts, scoring, invalid-state invariance, New York midnight and DST, archive bounds.');
