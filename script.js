(() => {
  'use strict';

  const GRID_SIZE = 15;
  const DIRECTIONS = {
    horizontal: { dr: 0, dc: 1, label: 'Horizontal' },
    vertical: { dr: 1, dc: 0, label: 'Vertical' }
  };

  // A small emergency fallback keeps the tested puzzle runnable if the local
  // dictionary asset is ever missing. Normal play loads the bundled word list.
  const REQUIRED_WORDS = [
    'ABLE', 'ABOUT', 'ACORN', 'AFTER', 'AGENT', 'ALARM', 'ALONE', 'ANGLE', 'ANT', 'APPLE', 'ARCH',
    'BARN', 'BEACH', 'BEAR', 'BIRD', 'BLUE', 'BOAT', 'BOOK', 'BRAIN', 'BRIDGE', 'BRIGHT',
    'CAMP', 'CART', 'CHEST', 'COLD', 'CORN', 'CROSS', 'DARK', 'DREAM', 'EAGLE', 'EARTH', 'EAST',
    'FAIR', 'FALL', 'FARM', 'FIELD', 'FIND', 'FIRE', 'GARDEN', 'GATE', 'GOLD', 'GOLF', 'GRAPE', 'GREEN',
    'HARBOR', 'HEART', 'HILL', 'HOME', 'HOUSE', 'IDEA', 'ISLAND', 'JUMP', 'KITE', 'LAKE',
    'LAMP', 'LEAF', 'LIGHT', 'LINK', 'LOSER', 'MAP', 'MARK', 'MINT', 'MOON', 'NEST', 'NIGHT',
    'OCEAN', 'OPEN', 'PAPER', 'PARK', 'PATH', 'PLANT', 'RAIN', 'RIVER', 'ROAD', 'ROSE',
    'SAND', 'SEA', 'SHORE', 'SMALL', 'SNOW', 'SPARK', 'STAR', 'STONE', 'SUN', 'TABLE',
    'TENT', 'TIDE', 'TIME', 'TRAIN', 'TREE', 'VIOLET', 'WATER', 'WIND', 'WOLF', 'WORD', 'YARD'
  ];
  const Daily = window.WordLinksDaily;
  const STORAGE_PREFIX = `word-links:${Daily.VERSION}:`;
  let currentDate = Daily.dateInNewYork();
  let archiveMonth = currentDate.slice(0, 7);
  let storageHealthy = true;
  let storedGames = {};
  let viewingToday = true;
  let WORD_SET = new Set([...REQUIRED_WORDS, ...Daily.words]);
  let dictionaryReady = false;
  let dictionaryCount = REQUIRED_WORDS.length;
  let dictionaryLoad = null;
  const $ = (selector) => document.querySelector(selector);
  const inBounds = (row, col) => row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;

  let state = emptyGame();

  async function loadDictionary() {
    if (dictionaryLoad) return dictionaryLoad;
    dictionaryLoad = fetch('words.txt')
      .then((response) => {
        if (!response.ok) throw new Error(`Dictionary request failed (${response.status}).`);
        return response.text();
      })
      .then((text) => {
        const entries = text
          .split(/\s+/)
          .map((entry) => entry.trim().toUpperCase())
          .filter((entry) => /^[A-Z]+$/.test(entry) && entry.length >= 2 && entry.length <= GRID_SIZE);
        WORD_SET = new Set([...entries, ...REQUIRED_WORDS, ...Daily.words]);
        dictionaryCount = WORD_SET.size;
        dictionaryReady = true;
        document.querySelectorAll('[data-dictionary-count]').forEach((target) => {
          target.textContent = dictionaryCount.toLocaleString();
        });
        document.body.classList.remove('dictionary-loading');
      })
      .catch((error) => {
        console.error(error);
        dictionaryReady = true;
        dictionaryCount = WORD_SET.size;
        document.querySelectorAll('[data-dictionary-count]').forEach((target) => { target.textContent = dictionaryCount.toLocaleString(); });
        document.body.classList.remove('dictionary-loading');
        setFeedback('error', 'The full word list could not load. The puzzle is using its smaller backup list. Reload to try again.');
        render();
      });
    return dictionaryLoad;
  }

  function makeGrid() {
    return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => null));
  }

  function emptyGame() {
    return {
      grid: makeGrid(),
      words: [],
      starts: [],
      score: 0,
      selected: null,
      direction: 'horizontal',
      preview: null,
      feedback: { kind: 'info', text: 'Pick a square to begin.' },
      moveLog: [],
      puzzle: null,
      attemptNumber: 1,
      solutionProgress: 0,
      hintLevel: 0,
      won: false,
      nextWordNumber: 1
    };
  }

  function wordCells(word) {
    const { dr, dc } = DIRECTIONS[word.direction];
    return [...word.text].map((letter, index) => ({
      row: word.row + (dr * index),
      col: word.col + (dc * index),
      letter,
      index
    }));
  }

  function wordById(game, id) {
    return game.words.find((word) => word.id === id);
  }

  function boundsFor(words) {
    const all = words.flatMap(wordCells);
    return {
      minRow: Math.min(...all.map((cell) => cell.row)),
      maxRow: Math.max(...all.map((cell) => cell.row)),
      minCol: Math.min(...all.map((cell) => cell.col)),
      maxCol: Math.max(...all.map((cell) => cell.col))
    };
  }

  function makePuzzle(date = currentDate) { return Daily.makePuzzle(date); }

  function putWordOnGrid(game, word) {
    for (const cellInfo of wordCells(word)) {
      const existing = game.grid[cellInfo.row][cellInfo.col];
      const cell = existing || { letter: cellInfo.letter, horizontal: null, vertical: null };
      cell.letter = cellInfo.letter;
      cell[word.direction] = word.id;
      game.grid[cellInfo.row][cellInfo.col] = cell;
    }
  }

  function seedGame(puzzle) {
    const game = emptyGame();
    game.puzzle = puzzle;
    game.attemptNumber = puzzle.attemptNumber || 1;
    puzzle.starters.forEach((starter) => {
      const word = {
        id: `start-${starter.starter}`,
        text: starter.text,
        row: starter.row,
        col: starter.col,
        direction: starter.direction,
        starter: starter.starter,
        links: []
      };
      putWordOnGrid(game, word);
      game.words.push(word);
      game.starts.push(word.id);
    });
    return game;
  }

  function componentIds(game, startId) {
    const visited = new Set();
    const pending = [startId];
    while (pending.length) {
      const id = pending.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      const word = wordById(game, id);
      if (word) pending.push(...word.links.filter((link) => !visited.has(link)));
    }
    return visited;
  }

  function startsAreConnected(game) {
    return game.starts.length === 2 && componentIds(game, game.starts[0]).has(game.starts[1]);
  }

  function normalizeWord(raw) {
    return raw.trim().toUpperCase();
  }

  function validationFailure(code, message, cells = [], errorCells = []) {
    return { valid: false, code, message, cells, errorCells, intersections: [] };
  }

  // Pure validation: used by preview and submit, and never mutates game state.
  function validatePlacement(game, draft) {
    if (!draft || !Number.isInteger(draft.row) || !Number.isInteger(draft.col)) {
      return validationFailure('no-cell', 'Choose the first square for your word.');
    }
    // Stored puzzle moves use `text`; the form draft uses `word`.
    const word = normalizeWord(draft.word || draft.text || '');
    if (!word) return validationFailure('no-word', 'Enter a word to preview it.');
    if (!/^[A-Z]+$/.test(word)) return validationFailure('letters-only', 'Use letters only—no spaces, numbers, or punctuation.');
    if (!WORD_SET.has(word)) {
      return validationFailure('not-in-list', `“${word}” is not in this edition’s built-in word list.`);
    }
    if (game.words.some((placed) => placed.text === word)) {
      return validationFailure('duplicate', `“${word}” is already on the board. Try a different word.`);
    }

    const move = { text: word, row: draft.row, col: draft.col, direction: draft.direction };
    const cells = wordCells(move);
    const outside = cells.filter((cell) => !inBounds(cell.row, cell.col));
    if (outside.length) {
      return validationFailure('off-board', 'That word would run off the board.', cells, outside);
    }

    const { dr, dc } = DIRECTIONS[move.direction];
    const before = { row: move.row - dr, col: move.col - dc };
    const after = { row: move.row + (dr * word.length), col: move.col + (dc * word.length) };
    if ((inBounds(before.row, before.col) && game.grid[before.row][before.col]) ||
        (inBounds(after.row, after.col) && game.grid[after.row][after.col])) {
      return validationFailure('word-extension', 'Leave space before and after a word; it cannot extend another word.', cells);
    }

    const opposite = move.direction === 'horizontal' ? 'vertical' : 'horizontal';
    const intersections = [];
    for (const cellInfo of cells) {
      const existing = game.grid[cellInfo.row][cellInfo.col];
      if (existing) {
        if (existing.letter !== cellInfo.letter) {
          return validationFailure('letter-mismatch', 'That letter doesn’t match the word already there.', cells, [cellInfo]);
        }
        if (existing[move.direction]) {
          return validationFailure('same-direction', 'Words can’t overlap in the same direction.', cells, [cellInfo]);
        }
        if (!existing[opposite]) {
          return validationFailure('invalid-cell', 'That square is not a clean perpendicular crossing.', cells, [cellInfo]);
        }
        intersections.push({ ...cellInfo, wordId: existing[opposite] });
      } else {
        const sideA = { row: cellInfo.row + (move.direction === 'horizontal' ? -1 : 0), col: cellInfo.col + (move.direction === 'vertical' ? -1 : 0) };
        const sideB = { row: cellInfo.row + (move.direction === 'horizontal' ? 1 : 0), col: cellInfo.col + (move.direction === 'vertical' ? 1 : 0) };
        if ((inBounds(sideA.row, sideA.col) && game.grid[sideA.row][sideA.col]) ||
            (inBounds(sideB.row, sideB.col) && game.grid[sideB.row][sideB.col])) {
          return validationFailure('side-touch', 'Leave space except at a clean perpendicular crossing.', cells, [cellInfo]);
        }
      }
    }

    if (intersections.length === 0) {
      return validationFailure('no-cross', 'Your word must cross an existing word.', cells);
    }
    if (intersections.length > 2) {
      return validationFailure('too-many-crosses', 'That would make too many crossings. Use one, or the final two-cross bridge.', cells, intersections);
    }
    if (intersections.length === 2) {
      const startA = componentIds(game, game.starts[0]);
      const startB = componentIds(game, game.starts[1]);
      const firstInA = startA.has(intersections[0].wordId);
      const firstInB = startB.has(intersections[0].wordId);
      const secondInA = startA.has(intersections[1].wordId);
      const secondInB = startB.has(intersections[1].wordId);
      if (!((firstInA && secondInB) || (firstInB && secondInA))) {
        return validationFailure('wrong-bridge', 'A winning bridge must cross one word from each separate starting chain.', cells, intersections);
      }
      const names = intersections.map((cross) => wordById(game, cross.wordId)?.text).filter(Boolean);
      return {
        valid: true,
        bridge: true,
        code: 'bridge',
        message: `“${word}” will bridge ${names[0]} and ${names[1]} to finish the puzzle.`,
        word,
        move,
        cells,
        intersections
      };
    }

    const crossed = wordById(game, intersections[0].wordId);
    return {
      valid: true,
      bridge: false,
      code: 'ordinary',
      message: `“${word}” will cross ${crossed.text} once.`,
      word,
      move,
      cells,
      intersections
    };
  }

  function applyPlacement(game, result) {
    const word = {
      id: `move-${game.nextWordNumber++}`,
      text: result.word,
      row: result.move.row,
      col: result.move.col,
      direction: result.move.direction,
      starter: null,
      links: [...new Set(result.intersections.map((cross) => cross.wordId))]
    };
    putWordOnGrid(game, word);
    game.words.push(word);
    word.links.forEach((linkedId) => {
      const linked = wordById(game, linkedId);
      if (linked && !linked.links.includes(word.id)) linked.links.push(word.id);
    });
    const cost = 10 + word.text.length;
    game.score += cost;
    game.moveLog.push({ word, cost, bridge: result.bridge });
    return word;
  }

  function sameMove(a, b) {
    return a && b && a.text === b.text && a.row === b.row && a.col === b.col && a.direction === b.direction;
  }

  function solvePuzzle(puzzle) {
    const sandbox = seedGame(puzzle);
    for (const solutionMove of puzzle.solution) {
      const check = validatePlacement(sandbox, solutionMove);
      if (!check.valid) return false;
      applyPlacement(sandbox, check);
    }
    return startsAreConnected(sandbox) && sandbox.score === puzzle.parScore;
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  // Verify the date definitions with the exact engine used by players.
  function runEngineChecks() {
    for (let day = 0; day < 56; day += 1) {
      const date = Daily.addDays(Daily.LAUNCH, day);
      assert(solvePuzzle(makePuzzle(date)), `Unsolvable daily edition: ${date}`);
      assert(JSON.stringify(makePuzzle(date)) === JSON.stringify(makePuzzle(date)), 'Daily generation changed.');
    }
  }

  function getDraft() {
    return {
      word: $('#wordInput').value,
      row: state.selected?.row,
      col: state.selected?.col,
      direction: state.direction
    };
  }

  function setFeedback(kind, text) {
    state.feedback = { kind, text };
  }

  function renderBoard() {
    const board = $('#gameBoard');
    const preview = state.preview;
    const previewCells = new Map();
    if (preview?.result?.cells) {
      for (const cell of preview.result.cells) {
        if (inBounds(cell.row, cell.col)) previewCells.set(`${cell.row}:${cell.col}`, cell);
      }
    }
    const errors = new Set((preview?.result?.errorCells || []).map((cell) => `${cell.row}:${cell.col}`));
    const fragment = document.createDocumentFragment();
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const cellData = state.grid[row][col];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'grid-cell';
        button.dataset.row = String(row);
        button.dataset.col = String(col);
        button.setAttribute('role', 'gridcell');
        const selected = state.selected?.row === row && state.selected?.col === col;
        const previewCell = previewCells.get(`${row}:${col}`);
        const letter = cellData?.letter || previewCell?.letter || '';
        const starterWord = cellData && [cellData.horizontal, cellData.vertical]
          .map((id) => wordById(state, id))
          .find((word) => word?.starter);

        if (cellData) button.classList.add('occupied');
        if (starterWord?.starter === 'A') button.classList.add('start-a');
        if (starterWord?.starter === 'B') button.classList.add('start-b');
        if (selected) button.classList.add('selected');
        button.tabIndex = selected || (!state.selected && row === 0 && col === 0) ? 0 : -1;
        if (selected) {
          const arrow = document.createElement('span');
          arrow.className = 'direction-indicator';
          arrow.setAttribute('aria-hidden', 'true');
          arrow.textContent = state.direction === 'horizontal' ? '→' : '↓';
          button.append(arrow);
        }
        if (previewCell) {
          if (!preview.result.valid || errors.has(`${row}:${col}`)) button.classList.add('preview-bad');
          else if (preview.result.bridge) button.classList.add('preview-bridge');
          else button.classList.add('preview-good');
        }
        if (letter) button.append(document.createTextNode(letter));
        if (starterWord && starterWord.row === row && starterWord.col === col) {
          const token = document.createElement('span');
          token.className = 'starter-token';
          token.setAttribute('aria-hidden', 'true');
          token.textContent = starterWord.starter;
          button.append(token);
        }
        const pieces = [`Row ${row + 1}, column ${col + 1}`];
        if (letter) pieces.push(`letter ${letter}`);
        if (starterWord) pieces.push(`Start ${starterWord.starter}`);
        if (selected) pieces.push('selected as word start');
        button.setAttribute('aria-label', pieces.join(', '));
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        fragment.append(button);
      }
    }
    board.replaceChildren(fragment);
  }

  function renderStarts() {
    const target = $('#startWords');
    if (!state.starts.length) {
      target.innerHTML = '<p class="empty-log">Choose the bridge rule to reveal a puzzle.</p>';
      return;
    }
    target.innerHTML = state.starts.map((id) => {
      const word = wordById(state, id);
      return `<div class="start-word ${word.starter.toLowerCase()}">
        <span class="start-marker">${word.starter}</span>
        <span><strong>${word.text}</strong><span>Row ${word.row + 1}, column ${word.col + 1} · ${DIRECTIONS[word.direction].label.toLowerCase()}</span></span>
      </div>`;
    }).join('');
  }

  function renderControls() {
    const hasGame = state.starts.length === 2;
    const disabled = !hasGame || state.won;
    $('#horizontalButton').classList.toggle('active', state.direction === 'horizontal');
    $('#verticalButton').classList.toggle('active', state.direction === 'vertical');
    $('#horizontalButton').setAttribute('aria-pressed', String(state.direction === 'horizontal'));
    $('#verticalButton').setAttribute('aria-pressed', String(state.direction === 'vertical'));
    $('#horizontalButton').disabled = disabled;
    $('#verticalButton').disabled = disabled;
    $('#wordInput').disabled = disabled;
    $('#previewButton').disabled = disabled;
    $('#submitButton').disabled = disabled;
    $('#hintButton').disabled = !hasGame || state.won;
    $('#hintButton').textContent = state.hintLevel === 0
      ? 'Need a nudge?'
      : state.hintLevel === 1
        ? 'One more clue'
        : 'Reveal route word';
    const selected = state.selected;
    $('#selectedCell').textContent = selected
      ? `Row ${selected.row + 1}, column ${selected.col + 1} · ${DIRECTIONS[state.direction].label}. This is the first letter.`
      : 'Choose a square on the grid.';
    $('#placementState').textContent = selected ? 'Ready for steps 2–3' : 'Step 1 of 3';
    $('#feedback').className = `feedback ${state.feedback.kind}`;
    $('#feedback').textContent = state.feedback.text;
  }

  function renderMoveLog() {
    const target = $('#moveLog');
    if (!state.moveLog.length) {
      target.innerHTML = '<li class="empty-log">Accepted words will appear here.</li>';
      return;
    }
    target.innerHTML = state.moveLog.map((move, index) => `<li><strong>${index + 1}. ${move.word.text}</strong> · +${move.cost}${move.bridge ? ' · finishing bridge' : ''}</li>`).join('');
  }

  function renderSuccess() {
    const card = $('#successCard');
    card.hidden = !state.won;
    if (state.won) {
      const target = state.puzzle.parScore;
      const targetNote = state.score <= target
        ? `You met the ${target}-point target.`
        : `Target: ${target} points or lower.`;
      $('#successText').textContent = `Final score: ${state.score} points. ${targetNote}`;
    }
  }

  function readSaved(date) {
    if (storedGames[date]) return storedGames[date];
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + date);
      return raw ? JSON.parse(raw) : null;
    } catch { storageHealthy = false; return null; }
  }

  function saveProgress() {
    const record = {
      version: Daily.VERSION, date: state.puzzle.date,
      moves: state.moveLog.map(({ word }) => ({ text: word.text, row: word.row, col: word.col, direction: word.direction })),
      score: state.score, completed: state.won,
      selected: state.selected, direction: state.direction,
      draft: $('#wordInput').value
    };
    storedGames[record.date] = record;
    try { localStorage.setItem(STORAGE_PREFIX + record.date, JSON.stringify(record)); }
    catch { storageHealthy = false; }
  }

  function restoreProgress(puzzle) {
    const game = seedGame(puzzle);
    const record = readSaved(puzzle.date);
    if (!record || record.version !== Daily.VERSION || !Array.isArray(record.moves)) return game;
    for (const move of record.moves) {
      if (startsAreConnected(game)) break;
      const result = validatePlacement(game, move);
      if (!result.valid) {
        game.feedback = { kind: 'error', text: 'Some saved moves could not be restored. Your valid moves are still here.' };
        break;
      }
      applyPlacement(game, result);
    }
    game.won = startsAreConnected(game);
    game.direction = record.direction === 'vertical' ? 'vertical' : 'horizontal';
    if (!game.won && record.selected && inBounds(record.selected.row, record.selected.col)) game.selected = record.selected;
    return game;
  }

  function progressStatus(date) {
    const record = readSaved(date);
    return record?.completed ? 'Completed' : record?.moves?.length ? 'In progress' : 'Not started';
  }

  function renderDaily() {
    const puzzle = state.puzzle;
    if (!puzzle) return;
    const isToday = puzzle.date === currentDate;
    $('#editionLabel').textContent = isToday ? 'Today’s Puzzle' : 'Archive Puzzle';
    $('#puzzleDate').textContent = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${puzzle.date}T12:00:00Z`));
    $('#puzzleDate').dateTime = puzzle.date;
    $('#difficultyLabel').textContent = `${puzzle.difficulty} · ${puzzle.weekday}`;
    $('#progressLabel').textContent = state.won ? '✓ Completed' : state.moveLog.length ? '◐ In progress' : '○ Not started';
    $('#scoreTarget').textContent = puzzle.parScore;
    $('#routeNote').textContent = `${puzzle.solution.length} words in the verified route. Difficulty is an estimate; shorter solutions may exist.`;
    const release = Daily.nextMidnight();
    const releaseLabel = new Intl.DateTimeFormat('en-US', { timeZone: Daily.ZONE, month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(release);
    const releaseText = `Next daily edition: ${releaseLabel} (New York midnight).`;
    $('#nextRelease').textContent = (state.won ? `✓ Connection made! Final score: ${state.score} points. ` : '') + releaseText;
    $('#nextRelease').classList.toggle('completed-notice', state.won);
    $('#successNext').textContent = releaseText;
    $('#saveNote').textContent = storageHealthy ? 'Progress is saved on this browser and device.' : 'Browser storage is unavailable. Progress will last only while this page stays open.';
    $('#todayButton').disabled = isToday;
  }

  function renderArchive() {
    const first = `${archiveMonth}-01`;
    const monthDate = new Date(`${first}T12:00:00Z`);
    $('#archiveMonth').textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(monthDate);
    $('#previousMonth').disabled = archiveMonth <= Daily.LAUNCH.slice(0, 7);
    $('#nextMonth').disabled = archiveMonth >= currentDate.slice(0, 7);
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < monthDate.getUTCDay(); i += 1) fragment.append(document.createElement('span'));
    for (let date = first; date.slice(0, 7) === archiveMonth; date = Daily.addDays(date, 1)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.date = date;
      const available = Daily.available(date, currentDate);
      const status = progressStatus(date);
      const record = readSaved(date);
      const marker = status === 'Completed' ? '✓' : status === 'In progress' ? '◐' : '○';
      button.disabled = !available;
      button.className = 'calendar-date';
      button.setAttribute('aria-pressed', String(state.puzzle?.date === date));
      button.setAttribute('aria-label', `${date}: ${available ? status + (status === 'Completed' ? ', ' + record.score + ' points' : '') : 'Unavailable'}`);
      const number = document.createElement('strong');
      number.textContent = Number(date.slice(8));
      const note = document.createElement('span');
      note.textContent = available ? `${marker} ${status === 'Completed' ? record.score + ' pts' : status}` : 'Unavailable';
      note.className = 'calendar-status';
      const compact = document.createElement('span');
      compact.className = 'calendar-compact';
      compact.setAttribute('aria-hidden', 'true');
      compact.textContent = available ? `${marker}${status === 'Completed' ? ' ' + record.score : ''}` : '—';
      button.append(number, note, compact);
      fragment.append(button);
    }
    $('#archiveDates').replaceChildren(fragment);
  }

  function render() {
    $('#scoreValue').textContent = String(state.score);
    renderBoard();
    renderStarts();
    renderControls();
    renderMoveLog();
    renderDaily();
    renderArchive();
    renderSuccess();
  }

  function previewPlacement() {
    if (state.won) return;
    const result = validatePlacement(state, getDraft());
    state.preview = { result };
    setFeedback(result.valid ? 'preview' : 'error', result.message);
    render();
  }

  function submitPlacement(event) {
    event.preventDefault();
    if (state.won) return;
    const result = validatePlacement(state, getDraft());
    state.preview = null;
    if (!result.valid) {
      setFeedback('error', result.message);
      render();
      return;
    }
    const placed = applyPlacement(state, result);
    if (state.puzzle?.solution[state.solutionProgress] && sameMove(placed, state.puzzle.solution[state.solutionProgress])) {
      state.solutionProgress += 1;
    }
    state.hintLevel = 0;
    state.selected = null;
    $('#wordInput').value = '';
    if (startsAreConnected(state)) {
      state.won = true;
      saveProgress();
      setFeedback('success', `Connection complete! ${placed.text} joined both chains.`);
      render();
      $('#successCard').focus();
    } else {
      saveProgress();
      setFeedback('success', `${placed.text} added for +${10 + placed.text.length} points. Choose the next first cell.`);
      render();
    }
  }

  async function openPuzzle(date, { focus = false } = {}) {
    if (!Daily.available(date, currentDate)) return;
    if (state.puzzle) saveProgress();
    await loadDictionary();
    const puzzle = makePuzzle(date);
    assert(solvePuzzle(puzzle), 'This daily edition failed its solution check.');
    state = restoreProgress(puzzle);
    const saved = readSaved(date);
    $('#wordInput').value = state.won ? '' : typeof saved?.draft === 'string' ? saved.draft.slice(0, 15) : '';
    viewingToday = date === currentDate;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'view', JSON.stringify({ date, followingToday: viewingToday }));
    } catch { storageHealthy = false; }
    setFeedback('info', state.won ? 'You’ve already linked this edition! Your completed board and score are saved.' : state.moveLog.length ? 'Welcome back. Continue your saved connection.' : 'Select the first square of your word, choose a direction, then preview or add it.');
    render();
    if (focus) { $('#boardTitle').focus(); $('#boardTitle').scrollIntoView({ block: 'start' }); }
  }

  function checkDayChange(instant = new Date()) {
    const nextDate = Daily.dateInNewYork(instant);
    if (nextDate === currentDate) return false;
    currentDate = nextDate;
    archiveMonth = currentDate.slice(0, 7);
    if (viewingToday) void openPuzzle(currentDate);
    else { renderDaily(); renderArchive(); }
    return true;
  }

  function showHint() {
    const next = state.puzzle?.solution.find((move) => !state.words.some((word) => sameMove(word, move)) && validatePlacement(state, move).valid);
    if (!next) {
      setFeedback('info', 'Your route differs from the reference route. Try extending toward the other starting chain; no legal reference clue is available here.');
      render();
      return;
    }
    const hintNumber = Math.min(state.hintLevel + 1, 3);
    const finalNote = next.bridge ? ' This is the two-cross finishing bridge.' : '';
    if (hintNumber === 1) {
      setFeedback('preview', `Nudge 1 of 3: the next route word starts at row ${next.row + 1}, column ${next.col + 1}, and reads ${DIRECTIONS[next.direction].label.toLowerCase()}.${finalNote}`);
    } else if (hintNumber === 2) {
      setFeedback('preview', `Nudge 2 of 3: it has ${next.text.length} letters and starts with “${next.text[0]}”.${finalNote}`);
    } else {
      setFeedback('preview', `Nudge 3 of 3: try ${next.text} from row ${next.row + 1}, column ${next.col + 1}, ${DIRECTIONS[next.direction].label.toLowerCase()}.${finalNote}`);
    }
    state.hintLevel = hintNumber;
    render();
  }

  function selectCell(row, col, shouldFocus = false) {
    if (!state.starts.length || state.won) return;
    state.selected = { row, col };
    state.preview = null;
    setFeedback('info', `Selected row ${row + 1}, column ${col + 1}. Now choose a direction and enter a word.`);
    render();
    saveProgress();
    if (shouldFocus) document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`)?.focus();
  }

  function bindEvents() {
    $('#gameBoard').addEventListener('click', (event) => {
      const cell = event.target.closest('.grid-cell');
      if (!cell) return;
      selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
    });
    $('#gameBoard').addEventListener('keydown', (event) => {
      const cell = event.target.closest('.grid-cell');
      if (!cell) return;
      const movements = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      const move = movements[event.key];
      if (!move) return;
      event.preventDefault();
      selectCell(
        Math.max(0, Math.min(GRID_SIZE - 1, Number(cell.dataset.row) + move[0])),
        Math.max(0, Math.min(GRID_SIZE - 1, Number(cell.dataset.col) + move[1])),
        true
      );
    });
    $('#horizontalButton').addEventListener('click', () => {
      state.direction = 'horizontal';
      state.preview = null;
      setFeedback('info', 'Horizontal selected: your word reads left to right.');
      render();
      saveProgress();
    });
    $('#verticalButton').addEventListener('click', () => {
      state.direction = 'vertical';
      state.preview = null;
      setFeedback('info', 'Vertical selected: your word reads top to bottom.');
      render();
      saveProgress();
    });
    $('#wordInput').addEventListener('input', () => {
      if (state.preview) {
        state.preview = null;
        render();
      }
      saveProgress();
    });
    $('#previewButton').addEventListener('click', previewPlacement);
    $('#placementForm').addEventListener('submit', submitPlacement);
    $('#todayButton').addEventListener('click', () => { void openPuzzle(currentDate, { focus: true }); });
    $('#archiveToday').addEventListener('click', () => { void openPuzzle(currentDate, { focus: true }); });
    $('#hintButton').addEventListener('click', showHint);
    $('#archiveDates').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-date]');
      if (button && !button.disabled) void openPuzzle(button.dataset.date, { focus: true });
    });
    function changeMonth(offset) {
      const value = new Date(`${archiveMonth}-01T12:00:00Z`);
      value.setUTCMonth(value.getUTCMonth() + offset);
      archiveMonth = value.toISOString().slice(0, 7);
      renderArchive();
    }
    $('#previousMonth').addEventListener('click', () => changeMonth(-1));
    $('#nextMonth').addEventListener('click', () => changeMonth(1));
    window.addEventListener('pagehide', () => { if (state.puzzle) saveProgress(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });
    setInterval(checkDayChange, 1000);
  }

  window.WordLinksTest = { validatePlacement, makePuzzle, solvePuzzle, runEngineChecks };
  async function initialize() {
    try {
      runEngineChecks();
      bindEvents();
      let initialDate = currentDate;
      try {
        const view = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'view') || 'null');
        if (view && !view.followingToday && Daily.available(view.date, currentDate)) initialDate = view.date;
      } catch { storageHealthy = false; }
      await openPuzzle(initialDate);
    } catch (error) {
      console.error(error);
      $('#feedback').textContent = 'This edition could not load. Please check the local server and reload.';
    }
  }
  void initialize();
})();
