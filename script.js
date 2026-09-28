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
    'FAIR', 'FARM', 'FIELD', 'FIND', 'FIRE', 'GARDEN', 'GATE', 'GOLD', 'GRAPE', 'GREEN',
    'HARBOR', 'HEART', 'HILL', 'HOME', 'HOUSE', 'IDEA', 'ISLAND', 'JUMP', 'KITE', 'LAKE',
    'LAMP', 'LEAF', 'LIGHT', 'LINK', 'LOSER', 'MAP', 'MARK', 'MINT', 'MOON', 'NEST', 'NIGHT',
    'OCEAN', 'OPEN', 'PAPER', 'PARK', 'PATH', 'PLANT', 'RAIN', 'RIVER', 'ROAD', 'ROSE',
    'SAND', 'SEA', 'SHORE', 'SMALL', 'SNOW', 'SPARK', 'STAR', 'STONE', 'SUN', 'TABLE',
    'TENT', 'TIDE', 'TIME', 'TRAIN', 'TREE', 'VIOLET', 'WATER', 'WIND', 'WORD', 'YARD'
  ];
  let WORD_SET = new Set(REQUIRED_WORDS);
  let dictionaryReady = false;
  let dictionaryCount = REQUIRED_WORDS.length;
  let dictionaryLoad = null;
  const $ = (selector) => document.querySelector(selector);
  const inBounds = (row, col) => row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;

  let bridgeRuleAccepted = false;
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
        WORD_SET = new Set([...entries, ...REQUIRED_WORDS]);
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

  function randomInteger(min, max) {
    return Math.floor(Math.random() * ((max - min) + 1)) + min;
  }

  function baseBlueprint() {
    return [
      { role: 'starter', starter: 'A', text: 'COLD', row: 3, col: 2, direction: 'horizontal' },
      { role: 'starter', starter: 'B', text: 'TIDE', row: 9, col: 8, direction: 'horizontal' },
      { role: 'move', text: 'LAMP', row: 3, col: 4, direction: 'vertical' },
      { role: 'move', text: 'MAP', row: 5, col: 4, direction: 'horizontal' },
      { role: 'move', text: 'PARK', row: 5, col: 6, direction: 'vertical' },
      { role: 'move', text: 'DARK', row: 8, col: 3, direction: 'horizontal' },
      { role: 'move', text: 'RAIN', row: 8, col: 5, direction: 'vertical' },
      { role: 'move', text: 'TENT', row: 6, col: 8, direction: 'vertical' },
      { role: 'move', text: 'EAST', row: 7, col: 8, direction: 'horizontal' },
      { role: 'move', text: 'CHEST', row: 3, col: 11, direction: 'vertical' },
      { role: 'move', text: 'CAMP', row: 3, col: 11, direction: 'horizontal' },
      { role: 'move', text: 'ANT', row: 6, col: 6, direction: 'horizontal', bridge: true }
    ];
  }

  function makePuzzle({
    randomize = true,
    transpose = Math.random() < .5
  } = {}) {
    let entries = baseBlueprint().map((entry) => {
      let transformed = { ...entry };
      if (transpose) {
        transformed = {
          ...transformed,
          row: transformed.col,
          col: transformed.row,
          direction: transformed.direction === 'horizontal' ? 'vertical' : 'horizontal'
        };
      }
      return transformed;
    });
    const bounds = boundsFor(entries);
    const rowOffset = randomize ? randomInteger(-bounds.minRow, (GRID_SIZE - 1) - bounds.maxRow) : 0;
    const colOffset = randomize ? randomInteger(-bounds.minCol, (GRID_SIZE - 1) - bounds.maxCol) : 0;
    entries = entries.map((entry) => ({ ...entry, row: entry.row + rowOffset, col: entry.col + colOffset }));

    const solution = entries.filter((entry) => entry.role === 'move');
    return {
      starters: entries.filter((entry) => entry.role === 'starter'),
      solution,
      parScore: solution.reduce((total, move) => total + 10 + move.text.length, 0),
      attempts: [],
      attemptNumber: 1,
      transposed: transpose
    };
  }

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
    return startsAreConnected(sandbox) && sandbox.score === 139;
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  // Lightweight regression checks exercise the same engine used by players.
  function runEngineChecks() {
    const fixed = makePuzzle({ transpose: false, randomize: false });
    const game = seedGame(fixed);
    assert(game.score === 0 && game.words.length === 2 && !game.won, 'Replay seed did not reset correctly.');
    const originalWordCount = game.words.length;
    assert(validatePlacement(game, { text: 'COLD', row: 14, col: 14, direction: 'horizontal' }).code === 'duplicate', 'Duplicate word check failed.');
    assert(validatePlacement(game, { text: 'LAMP', row: 14, col: 14, direction: 'horizontal' }).code === 'off-board', 'Boundary check failed.');
    assert(validatePlacement(game, { text: 'LAMP', row: 0, col: 0, direction: 'horizontal' }).code === 'no-cross', 'No-cross check failed.');
    assert(validatePlacement(game, { text: 'PLANT', row: 3, col: 4, direction: 'vertical' }).code === 'letter-mismatch', 'Mismatch check failed.');
    assert(game.words.length === originalWordCount && game.score === 0, 'Invalid placement mutated state.');
    const overlapGame = seedGame(fixed);
    const lamp = validatePlacement(overlapGame, fixed.solution[0]);
    applyPlacement(overlapGame, lamp);
    assert(validatePlacement(overlapGame, { text: 'LINK', row: 3, col: 4, direction: 'vertical' }).code === 'same-direction', 'Same-direction overlap check failed.');

    for (const move of fixed.solution) {
      const result = validatePlacement(game, move);
      assert(result.valid, `Solution move ${move.text} was rejected.`);
      applyPlacement(game, result);
    }
    assert(startsAreConnected(game), 'Victory connection was not detected.');
    assert(game.score === 139, 'Score calculation was incorrect.');
    for (const transpose of [false, true]) assert(
      solvePuzzle(makePuzzle({ transpose, randomize: false })),
      'A transposed puzzle variation was not solvable.'
    );
    for (let index = 0; index < 12; index += 1) assert(solvePuzzle(makePuzzle()), 'Generated puzzle was not solvable.');
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
        const letter = previewCell ? previewCell.letter : cellData?.letter || '';
        const starterWord = cellData && [cellData.horizontal, cellData.vertical]
          .map((id) => wordById(state, id))
          .find((word) => word?.starter);

        if (cellData) button.classList.add('occupied');
        if (starterWord?.starter === 'A') button.classList.add('start-a');
        if (starterWord?.starter === 'B') button.classList.add('start-b');
        if (selected) button.classList.add('selected');
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
    $('#retryPuzzle').disabled = !hasGame;
    $('#newPuzzle').disabled = !bridgeRuleAccepted;
    const selected = state.selected;
    $('#selectedCell').textContent = selected
      ? `Row ${selected.row + 1}, column ${selected.col + 1} is the first letter.`
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
      $('#successText').textContent = `Attempt ${state.attemptNumber}: ${state.score} points. ${targetNote}`;
    }
  }

  function renderAttemptLeaderboard() {
    const puzzle = state.puzzle;
    $('#attemptLabel').textContent = `Attempt ${state.attemptNumber}`;
    $('#scoreTarget').textContent = puzzle ? String(puzzle.parScore) : '—';
    const target = $('#attemptLeaderboard');
    const results = puzzle?.attempts || [];
    if (!results.length) {
      target.innerHTML = '<li class="empty-log">Finish an attempt to begin your scorecard.</li>';
      return;
    }
    target.innerHTML = [...results]
      .sort((a, b) => a.score - b.score || a.number - b.number)
      .map((result, rank) => `<li><strong>#${rank + 1} · ${result.score} points</strong> <span>Attempt ${result.number}${result.score <= puzzle.parScore ? ' · at target' : ''}</span></li>`)
      .join('');
  }

  function render() {
    $('#scoreValue').textContent = String(state.score);
    renderBoard();
    renderStarts();
    renderControls();
    renderMoveLog();
    renderAttemptLeaderboard();
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
    state.selected = null;
    $('#wordInput').value = '';
    if (startsAreConnected(state)) {
      state.won = true;
      state.puzzle.attempts.push({ number: state.attemptNumber, score: state.score });
      setFeedback('success', `Connection complete! ${placed.text} joined both chains.`);
      render();
      $('#successCard').focus();
    } else {
      setFeedback('success', `${placed.text} added for +${10 + placed.text.length} points. Choose the next first cell.`);
      render();
    }
  }

  async function startNewPuzzle() {
    if (!bridgeRuleAccepted) {
      $('#rulesDialog').showModal();
      return;
    }
    if (!dictionaryReady) {
      setFeedback('info', 'Loading the bundled dictionary…');
      render();
      await loadDictionary();
    }
    let puzzle = makePuzzle();
    let attempts = 0;
    while (!solvePuzzle(puzzle) && attempts < 20) {
      puzzle = makePuzzle();
      attempts += 1;
    }
    if (!solvePuzzle(puzzle)) throw new Error('Unable to generate a solvable puzzle.');
    state = seedGame(puzzle);
    $('#wordInput').value = '';
    setFeedback('info', 'New puzzle ready. Choose a first cell, a direction, and a word.');
    render();
  }

  function retryCurrentPuzzle() {
    if (!state.puzzle) return;
    state.puzzle.attemptNumber += 1;
    state = seedGame(state.puzzle);
    $('#wordInput').value = '';
    setFeedback('info', `Attempt ${state.attemptNumber} started. Your earlier scores stay on this puzzle’s scorecard.`);
    render();
  }

  function showHint() {
    const next = state.puzzle?.solution[state.solutionProgress];
    if (!next) {
      setFeedback('info', 'This puzzle’s tested route is complete. Start a new puzzle for another challenge.');
      render();
      return;
    }
    const finalNote = next.bridge ? ' This is the two-cross finishing bridge.' : '';
    setFeedback('preview', `Nudge: try ${next.text} from row ${next.row + 1}, column ${next.col + 1}, ${DIRECTIONS[next.direction].label.toLowerCase()}.${finalNote}`);
    render();
  }

  function selectCell(row, col, shouldFocus = false) {
    if (!state.starts.length || state.won) return;
    state.selected = { row, col };
    state.preview = null;
    setFeedback('info', `Selected row ${row + 1}, column ${col + 1}. Now choose a direction and enter a word.`);
    render();
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
    });
    $('#verticalButton').addEventListener('click', () => {
      state.direction = 'vertical';
      state.preview = null;
      setFeedback('info', 'Vertical selected: your word reads top to bottom.');
      render();
    });
    $('#wordInput').addEventListener('input', () => {
      if (state.preview) {
        state.preview = null;
        render();
      }
    });
    $('#previewButton').addEventListener('click', previewPlacement);
    $('#placementForm').addEventListener('submit', submitPlacement);
    $('#newPuzzle').addEventListener('click', () => { void startNewPuzzle(); });
    $('#retryPuzzle').addEventListener('click', retryCurrentPuzzle);
    $('#successNewPuzzle').addEventListener('click', () => { void startNewPuzzle(); });
    $('#successRetryPuzzle').addEventListener('click', retryCurrentPuzzle);
    $('#hintButton').addEventListener('click', showHint);

    $('#rulesDecisionForm').addEventListener('change', (event) => {
      const yes = event.target.value === 'yes';
      $('#beginGame').disabled = !yes;
      $('#decisionNote').className = `decision-note${yes ? '' : ' warning'}`;
      $('#decisionNote').textContent = yes
        ? 'The final bridge rule is explicit. You can now begin a solvable puzzle.'
        : 'With strict one-cross rules, the two separate chains cannot be connected. Choose “Yes” to start a playable puzzle.';
    });
    $('#rulesDecisionForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const decision = new FormData(event.currentTarget).get('bridgeRule');
      if (decision !== 'yes') return;
      bridgeRuleAccepted = true;
      $('#rulesDialog').close();
      void startNewPuzzle();
    });
    $('#rulesDialog').addEventListener('cancel', (event) => event.preventDefault());
  }

  // Useful for local console verification without affecting play.
  window.WordLinksTest = { validatePlacement, makePuzzle, solvePuzzle, runEngineChecks };

  try {
    runEngineChecks();
    bindEvents();
    render();
    loadDictionary();
    $('#rulesDialog').showModal();
  } catch (error) {
    console.error(error);
    document.body.innerHTML = '<main style="max-width:40rem;margin:4rem auto;padding:1.5rem;font-family:system-ui"><h1>Word Links could not start</h1><p>The built-in puzzle check failed. Please reload the page.</p></main>';
  }
})();
