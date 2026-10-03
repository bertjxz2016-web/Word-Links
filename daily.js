/* Versioned, dictionary-independent daily puzzle definitions. No runtime randomness. */
(() => {
  'use strict';
  const VERSION = 'daily-1';
  const LAUNCH = '2026-09-28';
  const ZONE = 'America/New_York';
  const WEEK = [
    { name: 'Sunday', label: 'Gentle', starts: ['park', 'tide'], route: ['tent', 'bridge'] },
    { name: 'Monday', label: 'Easy', starts: ['park', 'tent'], route: ['bridge'] },
    { name: 'Tuesday', label: 'Relaxed', starts: ['map', 'tent'], route: ['park', 'bridge'] },
    { name: 'Wednesday', label: 'Medium', starts: ['lamp', 'tent'], route: ['map', 'park', 'bridge'] },
    { name: 'Thursday', label: 'Tricky', starts: ['cold', 'tent'], route: ['lamp', 'map', 'park', 'bridge'] },
    { name: 'Friday', label: 'Challenging', starts: ['cold', 'east'], route: ['lamp', 'map', 'park', 'tent', 'bridge'] },
    { name: 'Saturday', label: 'Expert', starts: ['cold', 'camp'], route: ['lamp', 'map', 'park', 'chest', 'east', 'tent', 'bridge'] }
  ];
  const words = ['COLD', 'GOLD', 'FALL', 'HILL', 'WOLF', 'LAMP', 'LIMP', 'MAP', 'MOP', 'PARK', 'PART', 'TIDE', 'TIME', 'TREE', 'TENT', 'TEST', 'EAST', 'CHEST', 'CREST', 'CAMP', 'CART', 'CORN', 'ANT', 'ART', 'ACT', 'ALOFT', 'APART'];
  function dateInNewYork(instant = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
    const part = (type) => parts.find((p) => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function addDays(date, count) {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + count);
    return value.toISOString().slice(0, 10);
  }
  function validDate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  }
  function available(date, today = dateInNewYork()) { return validDate(date) && date >= LAUNCH && date <= today; }
  function nextMidnight(instant = new Date()) {
    const today = dateInNewYork(instant);
    let low = instant.getTime(), high = low + 27 * 60 * 60 * 1000;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (dateInNewYork(new Date(middle)) === today) low = middle;
      else high = middle;
    }
    return new Date(high);
  }
  function seeded(seed) {
    let hash = 2166136261;
    for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return () => {
      hash += 0x6D2B79F5;
      let value = hash;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }
  function makePuzzle(date) {
    if (!validDate(date)) throw new Error('Invalid puzzle date.');
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const profile = WEEK[day], random = seeded(`${VERSION}:${date}`);
    const pick = (items) => items[Math.floor(random() * items.length)];
    // Wider bridges on late-week editions change the layout, not just the words.
    const bridge = day >= 4 && day <= 6 ? pick(['ALOFT', 'APART']) : pick(['ANT', 'ART', 'ACT']);
    const shift = bridge.length - 3;
    const node = (text, row, col, direction) => ({ text, row, col, direction });
    const nodes = {
      cold: node(pick(['COLD', 'GOLD', 'FALL', 'HILL', 'WOLF']), 3, 2, 'horizontal'),
      lamp: node(pick(['LAMP', 'LIMP']), 3, 4, 'vertical'),
      map: node(pick(['MAP', 'MOP']), 5, 4, 'horizontal'),
      park: node(pick(['PARK', 'PART']), 5, 6, 'vertical'),
      tide: node(pick(['TIDE', 'TIME', 'TREE']), 9, 8 + shift, 'horizontal'),
      tent: node(pick(['TENT', 'TEST']), 6, 8 + shift, 'vertical'),
      east: node('EAST', 7, 8 + shift, 'horizontal'),
      chest: node(pick(['CHEST', 'CREST']), 3, 11 + shift, 'vertical'),
      camp: node(pick(['CAMP', 'CART', 'CORN']), 3, 11 + shift, 'horizontal'),
      bridge: { ...node(bridge, 6, 6, 'horizontal'), bridge: true }
    };
    // Rare letters on the weekend offer fewer familiar crossing choices.
    if (day === 6) nodes.cold.text = 'WOLF';
    let entries = [...profile.starts.map((key, index) => ({ ...nodes[key], role: 'starter', starter: index ? 'B' : 'A' })), ...profile.route.map((key) => ({ ...nodes[key], role: 'move' }))];
    if (random() < 0.5) entries = entries.map((entry) => ({ ...entry, row: entry.col, col: entry.row, direction: entry.direction === 'horizontal' ? 'vertical' : 'horizontal' }));
    const allCells = entries.flatMap((word) => [...word.text].map((_, i) => ({ row: word.row + (word.direction === 'vertical' ? i : 0), col: word.col + (word.direction === 'horizontal' ? i : 0) })));
    const minRow = Math.min(...allCells.map((cell) => cell.row)), maxRow = Math.max(...allCells.map((cell) => cell.row));
    const minCol = Math.min(...allCells.map((cell) => cell.col)), maxCol = Math.max(...allCells.map((cell) => cell.col));
    const rowOffset = -minRow + Math.floor(random() * (15 - maxRow + minRow));
    const colOffset = -minCol + Math.floor(random() * (15 - maxCol + minCol));
    entries = entries.map((entry) => ({ ...entry, row: entry.row + rowOffset, col: entry.col + colOffset }));
    const solution = entries.filter((entry) => entry.role === 'move');
    return { date, version: VERSION, difficulty: profile.label, weekday: profile.name, starters: entries.filter((entry) => entry.role === 'starter'), solution, parScore: solution.reduce((sum, move) => sum + 10 + move.text.length, 0) };
  }
  const api = { VERSION, LAUNCH, ZONE, WEEK, words, dateInNewYork, addDays, available, nextMidnight, makePuzzle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.WordLinksDaily = api;
})();
