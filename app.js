const { Application, Container, Graphics, Text } = window.PIXI || {};

const STAR_POINTS = {
  9: [2, 4, 6],
  13: [3, 6, 9],
  19: [3, 9, 15],
};

const LETTERS = "ABCDEFGHJKLMNOPQRST";
const CLOUD_RADIUS = 3;
const MOTION_PRESETS = {
  tight: { orbitFocus: 4, orbitOther: 2, pushNear: 8, pushFar: 3, xEase: 0.22, yEase: 0.145 },
  calm: { orbitFocus: 10, orbitOther: 6, pushNear: 14, pushFar: 6, xEase: 0.165, yEase: 0.09 },
  floaty: { orbitFocus: 18, orbitOther: 11, pushNear: 18, pushFar: 9, xEase: 0.11, yEase: 0.06 },
};
const PALETTES = {
  mono: { bg: "#ffffff", panel: "#ffffff", surface: "#ffffff", ink: "#111111", muted: "#6a6a6a", controlBg: "rgba(17, 17, 17, 0.04)", grid: "#202020", star: "#111111", blackStone: "#111111", whiteStone: "#ffffff", markerDark: "#111111", markerLight: "#ffffff", link: "#c8c8c8", linkFocus: "#111111", haloSoft: "#e2e2e2", haloSelected: "#bdbdbd", rootStone: "#efefef" },
  paper: { bg: "#f6f1e8", panel: "#f6f1e8", surface: "#f3ede2", ink: "#2c241d", muted: "#7a6d61", controlBg: "rgba(108, 91, 74, 0.08)", grid: "#584a3a", star: "#584a3a", blackStone: "#2c241d", whiteStone: "#fffaf0", markerDark: "#7f5539", markerLight: "#fffaf0", link: "#d0c0ac", linkFocus: "#7f5539", haloSoft: "#dfd0bf", haloSelected: "#c3ab8c", rootStone: "#efe3d3" },
  sage: { bg: "#eef3ef", panel: "#eef3ef", surface: "#e6ede7", ink: "#20332a", muted: "#62756b", controlBg: "rgba(54, 82, 68, 0.08)", grid: "#365244", star: "#365244", blackStone: "#1f3028", whiteStone: "#fbfdfb", markerDark: "#4c7a67", markerLight: "#fbfdfb", link: "#bfd0c4", linkFocus: "#4c7a67", haloSoft: "#d6e0d9", haloSelected: "#9fb8a9", rootStone: "#dde8e0" },
  coral: { bg: "#fff3ee", panel: "#fff3ee", surface: "#fce8e1", ink: "#2f2020", muted: "#8a6661", controlBg: "rgba(134, 72, 61, 0.08)", grid: "#7b4f48", star: "#7b4f48", blackStone: "#2f2020", whiteStone: "#fffaf8", markerDark: "#d06b57", markerLight: "#fffaf8", link: "#e2beb6", linkFocus: "#d06b57", haloSoft: "#efd4cf", haloSelected: "#dca49a", rootStone: "#f3ddd7" },
  slate: { bg: "#f3f5f8", panel: "#f3f5f8", surface: "#ebeff4", ink: "#1e2934", muted: "#667685", controlBg: "rgba(48, 71, 92, 0.08)", grid: "#30475c", star: "#30475c", blackStone: "#1e2934", whiteStone: "#fdfefe", markerDark: "#52718f", markerLight: "#fdfefe", link: "#c6d0da", linkFocus: "#52718f", haloSoft: "#dbe2e9", haloSelected: "#aebccc", rootStone: "#e7edf2" },
};

function deepCloneBoard(board) {
  return board.map((row) => row.slice());
}

function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function coordKey(x, y) {
  return `${x},${y}`;
}

function moveKey(move) {
  return move?.pass ? "pass" : `${move.x},${move.y}`;
}

function inBounds(size, x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function opposite(color) {
  return color === "B" ? "W" : "B";
}

function pointToText(move, size) {
  if (!move || move.pass) {
    return "Pass";
  }
  return `${LETTERS[move.x]}${size - move.y}`;
}

function indexToAlphaLabel(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function pointToSgf(move) {
  if (!move || move.pass) {
    return "";
  }
  return String.fromCharCode(97 + move.x) + String.fromCharCode(97 + move.y);
}

function hashBoard(board, nextPlayer) {
  return `${nextPlayer}|${board.map((row) => row.map((cell) => cell || ".").join("")).join("/")}`;
}

function neighbors(size, x, y) {
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ].filter(([nx, ny]) => inBounds(size, nx, ny));
}

function collectGroup(board, x, y) {
  const size = board.length;
  const color = board[y][x];
  const stack = [[x, y]];
  const seen = new Set([coordKey(x, y)]);
  const stones = [];
  let liberties = 0;

  while (stack.length) {
    const [cx, cy] = stack.pop();
    stones.push([cx, cy]);
    for (const [nx, ny] of neighbors(size, cx, cy)) {
      const value = board[ny][nx];
      if (!value) {
        liberties += 1;
        continue;
      }
      if (value === color) {
        const key = coordKey(nx, ny);
        if (!seen.has(key)) {
          seen.add(key);
          stack.push([nx, ny]);
        }
      }
    }
  }

  return { stones, liberties };
}

function removeGroup(board, stones) {
  for (const [x, y] of stones) {
    board[y][x] = null;
  }
}

function collectGroupDetailed(board, x, y) {
  const size = board.length;
  const color = board[y][x];
  const stack = [[x, y]];
  const seen = new Set([coordKey(x, y)]);
  const stones = [];
  const liberties = new Set();

  while (stack.length) {
    const [cx, cy] = stack.pop();
    stones.push([cx, cy]);
    for (const [nx, ny] of neighbors(size, cx, cy)) {
      const value = board[ny][nx];
      if (!value) {
        liberties.add(coordKey(nx, ny));
        continue;
      }
      if (value === color) {
        const key = coordKey(nx, ny);
        if (!seen.has(key)) {
          seen.add(key);
          stack.push([nx, ny]);
        }
      }
    }
  }

  return { color, stones, liberties: liberties.size };
}

function buildGroups(board) {
  const size = board.length;
  const visited = new Set();
  const stoneToGroup = new Map();
  const groups = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = board[y][x];
      if (!color) {
        continue;
      }
      const startKey = coordKey(x, y);
      if (visited.has(startKey)) {
        continue;
      }
      const group = collectGroupDetailed(board, x, y);
      const id = groups.length;
      groups.push(group);
      for (const [sx, sy] of group.stones) {
        const key = coordKey(sx, sy);
        visited.add(key);
        stoneToGroup.set(key, id);
      }
    }
  }

  return { groups, stoneToGroup };
}

function scoreTerritory(position) {
  const { board, size } = position;
  const { groups, stoneToGroup } = buildGroups(board);
  const visited = new Set();
  const settled = { B: 0, W: 0 };
  const potential = { B: 0, W: 0 };
  let neutral = 0;
  let blackStones = 0;
  let whiteStones = 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = board[y][x];
      if (value === "B") {
        blackStones += 1;
      } else if (value === "W") {
        whiteStones += 1;
      }
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const startKey = coordKey(x, y);
      if (board[y][x] || visited.has(startKey)) {
        continue;
      }

      const queue = [[x, y]];
      visited.add(startKey);
      const region = [];
      const borderColors = new Set();
      const borderGroups = new Set();
      let touchesEdge = false;

      while (queue.length) {
        const [cx, cy] = queue.shift();
        region.push([cx, cy]);
        if (cx === 0 || cy === 0 || cx === size - 1 || cy === size - 1) {
          touchesEdge = true;
        }
        for (const [nx, ny] of neighbors(size, cx, cy)) {
          const value = board[ny][nx];
          if (!value) {
            const key = coordKey(nx, ny);
            if (!visited.has(key)) {
              visited.add(key);
              queue.push([nx, ny]);
            }
            continue;
          }
          borderColors.add(value);
          const gid = stoneToGroup.get(coordKey(nx, ny));
          if (gid != null) {
            borderGroups.add(gid);
          }
        }
      }

      if (borderColors.size !== 1) {
        neutral += region.length;
        continue;
      }

      const owner = Array.from(borderColors)[0];
      const safeBoundary = Array.from(borderGroups).every((gid) => (groups[gid]?.liberties || 0) >= 2);
      const edgeRisk = touchesEdge && borderGroups.size <= 1;

      if (safeBoundary && !edgeRisk) {
        settled[owner] += region.length;
      } else {
        potential[owner] += region.length;
      }
    }
  }

  const stonesPlayed = blackStones + whiteStones;
  const progress = stonesPlayed / (size * size);
  const potentialWeight = clamp((progress - 0.45) / 0.45, 0, 0.8);

  const blackScore = blackStones + position.captures.B + settled.B + potential.B * potentialWeight;
  const whiteScore = whiteStones + position.captures.W + settled.W + potential.W * potentialWeight;

  return {
    blackLead: blackScore - whiteScore,
    blackScore,
    whiteScore,
    settled,
    potential,
    neutral,
    progress,
  };
}

function evaluatePositionStrength(position, perspective = "B") {
  const territory = scoreTerritory(position);
  const lead = perspective === "B" ? territory.blackLead : -territory.blackLead;
  return { lead, territory };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function seedFromId(id) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

class GamePosition {
  constructor({ size, board, nextPlayer = "B", moveNumber = 1, captures = { B: 0, W: 0 }, history = [] }) {
    this.size = size;
    this.board = board || createEmptyBoard(size);
    this.nextPlayer = nextPlayer;
    this.moveNumber = moveNumber;
    this.captures = { ...captures };
    this.history = history.length ? history.slice() : [hashBoard(this.board, this.nextPlayer)];
  }

  clone() {
    return new GamePosition({
      size: this.size,
      board: deepCloneBoard(this.board),
      nextPlayer: this.nextPlayer,
      moveNumber: this.moveNumber,
      captures: this.captures,
      history: this.history,
    });
  }

  play(move) {
    const cloned = this.clone();
    if (move.pass) {
      cloned.nextPlayer = opposite(cloned.nextPlayer);
      cloned.moveNumber += 1;
      cloned.history.push(hashBoard(cloned.board, cloned.nextPlayer));
      return cloned;
    }

    const { x, y } = move;
    if (!inBounds(cloned.size, x, y) || cloned.board[y][x]) {
      return null;
    }

    const color = cloned.nextPlayer;
    const enemy = opposite(color);
    cloned.board[y][x] = color;
    let captured = 0;

    for (const [nx, ny] of neighbors(cloned.size, x, y)) {
      if (cloned.board[ny][nx] !== enemy) {
        continue;
      }
      const group = collectGroup(cloned.board, nx, ny);
      if (group.liberties === 0) {
        captured += group.stones.length;
        removeGroup(cloned.board, group.stones);
      }
    }

    const ownGroup = collectGroup(cloned.board, x, y);
    if (ownGroup.liberties === 0) {
      return null;
    }

    cloned.captures[color] += captured;
    cloned.nextPlayer = enemy;
    cloned.moveNumber += 1;
    const nextHash = hashBoard(cloned.board, cloned.nextPlayer);
    if (cloned.history.includes(nextHash)) {
      return null;
    }
    cloned.history.push(nextHash);
    return cloned;
  }

  legalMoves(limit = Infinity) {
    const moves = [];
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        const next = this.play({ x, y });
        if (next) {
          moves.push({ x, y });
          if (moves.length >= limit) {
            return moves;
          }
        }
      }
    }
    return moves;
  }
}

class VariationNode {
  constructor({
    id,
    parentId = null,
    position,
    move = null,
    score = null,
    label = "Root",
    rank = null,
    analysis = [],
    analysisSource = "",
  }) {
    this.id = id;
    this.parentId = parentId;
    this.position = position;
    this.move = move;
    this.score = score;
    this.label = label;
    this.rank = rank;
    this.analysis = analysis;
    this.analysisSource = analysisSource;
    this.children = [];
  }
}

class DemoAnalyzer {
  async analyze(position, topN = 10) {
    const legalMoves = position.legalMoves();
    const center = (position.size - 1) / 2;
    const baseEval = evaluatePositionStrength(position, position.nextPlayer);
    const enriched = legalMoves.map((move) => {
      const next = position.play(move);
      if (!next) {
        return null;
      }
      const evalNext = evaluatePositionStrength(next, position.nextPlayer);
      const captureGain = next.captures[position.nextPlayer] - position.captures[position.nextPlayer];
      let friendly = 0;
      let enemy = 0;
      for (const [nx, ny] of neighbors(position.size, move.x, move.y)) {
        const stone = position.board[ny][nx];
        if (stone === position.nextPlayer) {
          friendly += 1;
        } else if (stone === opposite(position.nextPlayer)) {
          enemy += 1;
        }
      }
      const distance = Math.abs(move.x - center) + Math.abs(move.y - center);
      const edgeBias = Math.min(move.x, move.y, position.size - 1 - move.x, position.size - 1 - move.y);
      const shape = friendly * 1.8 + enemy * 1.2 + edgeBias * 0.3 - distance * 0.6;
      const scoreLead = evalNext.lead;
      const score = (scoreLead - baseEval.lead) * 1.7 + scoreLead * 0.6 + captureGain * 4 + shape + Math.random() * 0.45;
      return { move, score, scoreLead };
    }).filter(Boolean);

    enriched.sort((a, b) => b.score - a.score);
    return {
      source: "Built-in territory analyzer",
      moves: enriched.slice(0, topN).map((entry, index) => ({
        rank: index + 1,
        move: entry.move,
        scoreLead: Number(entry.scoreLead.toFixed(1)),
      })),
    };
  }
}

class EndpointAnalyzer {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  async analyze(position, topN = 10) {
    const payload = {
      size: position.size,
      nextPlayer: position.nextPlayer,
      moveNumber: position.moveNumber,
      stones: serializeStones(position.board),
      topN,
    };

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Analysis request failed with ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data.moves)) {
      throw new Error("Endpoint response must include a moves array.");
    }

    return {
      source: data.source || this.endpoint,
      moves: data.moves.slice(0, topN).map((entry, index) => ({
        rank: entry.rank || index + 1,
        move: normalizeMove(entry.move, position.size),
        scoreLead: Number(entry.scoreLead ?? entry.winrate ?? 0),
      })),
    };
  }
}

function serializeStones(board) {
  const stones = [];
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board.length; x += 1) {
      if (board[y][x]) {
        stones.push({ color: board[y][x], x, y, sgf: pointToSgf({ x, y }) });
      }
    }
  }
  return stones;
}

function normalizeMove(input, size) {
  if (!input) {
    return { pass: true };
  }
  if (typeof input === "string") {
    if (input.toLowerCase() === "pass") {
      return { pass: true };
    }
    const column = LETTERS.indexOf(input[0].toUpperCase());
    const row = size - Number(input.slice(1));
    return { x: column, y: row };
  }
  if (input.pass) {
    return { pass: true };
  }
  return { x: Number(input.x), y: Number(input.y) };
}

function buildPathToRoot(nodes, nodeId) {
  const path = [];
  let current = nodes.get(nodeId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? nodes.get(current.parentId) : null;
  }
  return path;
}

function getNodeMoveColor(node) {
  if (!node.move) {
    return "root";
  }
  return opposite(node.position.nextPlayer) === "B" ? "black" : "white";
}

const refs = {
  boardHost: document.getElementById("board-stage"),
  cloudHost: document.getElementById("cloud-stage"),
  runtimeError: document.getElementById("runtime-error"),
  statusText: document.getElementById("status-text"),
  analysisMeta: document.getElementById("analysis-meta"),
  moveInfo: document.getElementById("move-info"),
  boardSizeSelect: document.getElementById("board-size"),
  paletteSelect: document.getElementById("palette-select"),
  treeDepth: document.getElementById("tree-depth"),
  treeSize: document.getElementById("tree-size"),
  treeMotion: document.getElementById("tree-motion"),
  treeBuffer: document.getElementById("tree-buffer"),
  treeVBuffer: document.getElementById("tree-vbuffer"),
  analyzeButton: document.getElementById("analyze-btn"),
  resetButton: document.getElementById("reset-btn"),
  passButton: document.getElementById("pass-btn"),
  cpuBlackButton: document.getElementById("cpu-black-btn"),
  cpuWhiteButton: document.getElementById("cpu-white-btn"),
  autoMoveCount: document.getElementById("auto-move-count"),
  showChildrenLabels: document.getElementById("show-children-labels"),
  showMoveNumbers: document.getElementById("show-move-numbers"),
  suggestCount: document.getElementById("suggest-count"),
  suggestCountInput: document.getElementById("suggest-count-input"),
  endpointInput: document.getElementById("engine-endpoint"),
};

const state = {
  nodes: new Map(),
  selectedNodeId: "root",
  hoveredNodeId: null,
  viewNodeId: "root",
  nodeCounter: 0,
  boardApp: null,
  cloudApp: null,
  boardLayers: {},
  cloudLayers: {},
  cloudViews: new Map(),
  time: 0,
  autoPlayer: null,
  autoBusy: false,
  paletteKey: "mono",
  edgeZoneDirection: 0,
  edgeScrollTimer: 0,
  treeDepth: CLOUD_RADIUS,
  treeScale: 1,
  treeMotion: 0.5,
  treeBuffer: 1,
  treeVBuffer: 1,
  showChildrenLabels: false,
  showMoveNumbers: false,
};

function createRoot(size) {
  state.nodes.clear();
  state.nodeCounter = 0;
  const root = new VariationNode({
    id: "root",
    position: new GamePosition({ size }),
  });
  state.nodes.set(root.id, root);
  state.selectedNodeId = root.id;
  state.hoveredNodeId = null;
  state.viewNodeId = root.id;
}

function getSelectedNode() {
  return state.nodes.get(state.selectedNodeId);
}

function getDisplayedNode() {
  return state.nodes.get(state.hoveredNodeId || state.selectedNodeId);
}

function getAnalyzer() {
  const endpoint = refs.endpointInput.value.trim();
  return endpoint ? new EndpointAnalyzer(endpoint) : new DemoAnalyzer();
}

function getPalette() {
  return PALETTES[state.paletteKey] || PALETTES.mono;
}

function getMotionPreset() {
  const t = clamp(Number(state.treeMotion) || 0.5, 0, 1);
  const lerpPreset = (a, b, amount) => ({
    orbitFocus: lerp(a.orbitFocus, b.orbitFocus, amount),
    orbitOther: lerp(a.orbitOther, b.orbitOther, amount),
    pushNear: lerp(a.pushNear, b.pushNear, amount),
    pushFar: lerp(a.pushFar, b.pushFar, amount),
    xEase: lerp(a.xEase, b.xEase, amount),
    yEase: lerp(a.yEase, b.yEase, amount),
  });
  if (t <= 0.5) {
    return lerpPreset(MOTION_PRESETS.tight, MOTION_PRESETS.calm, t / 0.5);
  }
  return lerpPreset(MOTION_PRESETS.calm, MOTION_PRESETS.floaty, (t - 0.5) / 0.5);
}

function applyPalette(key) {
  state.paletteKey = PALETTES[key] ? key : "mono";
  const palette = getPalette();
  const root = document.documentElement;
  root.style.setProperty("--bg", palette.bg);
  root.style.setProperty("--panel", palette.panel);
  root.style.setProperty("--surface", palette.surface);
  root.style.setProperty("--ink", palette.ink);
  root.style.setProperty("--muted", palette.muted);
  root.style.setProperty("--control-bg", palette.controlBg);
  root.style.setProperty("--control-text", palette.ink);
  renderBoard();
}

function getSuggestCount() {
  return clamp(Number(refs.suggestCount.value) || 10, 3, 20);
}

function getAutoSuggestCount() {
  return clamp(Number(refs.autoMoveCount.value) || 2, 1, 3);
}

function syncSuggestControls(nextValue) {
  const value = clamp(Number(nextValue) || 10, 3, 20);
  refs.suggestCount.value = String(value);
  refs.suggestCountInput.value = String(value);
}

function updateAnalysisMeta(message) {
  refs.analysisMeta.textContent = message;
}

function updateComputerControls() {
  refs.cpuBlackButton.classList.toggle("active", state.autoPlayer === "B");
  refs.cpuWhiteButton.classList.toggle("active", state.autoPlayer === "W");
}

function showRuntimeError(message) {
  refs.runtimeError.hidden = false;
  refs.runtimeError.textContent = message;
}

async function analyzeSelectedNode() {
  const node = getSelectedNode();
  updateAnalysisMeta("Generating best moves...");
  refs.analyzeButton.disabled = true;
  try {
    const result = await analyzeNode(node, getSuggestCount());
    updateAnalysisMeta(`${node.analysis.length} moves from ${result.source}. Hover to preview, click to commit.`);
    renderBoard();
  } catch (error) {
    node.analysis = [];
    node.analysisSource = "";
    updateAnalysisMeta(error.message);
  } finally {
    refs.analyzeButton.disabled = false;
  }
}

function applyAnalysisToNode(node, result) {
  node.analysis = result.moves;
  node.analysisSource = result.source;

  for (const candidate of node.analysis) {
    const nextPosition = node.position.play(candidate.move);
    if (!nextPosition) {
      continue;
    }
    const nextPositionHash = hashBoard(nextPosition.board, nextPosition.nextPlayer);
    let child = node.children
      .map((id) => state.nodes.get(id))
      .find((entry) => moveKey(entry.move) === moveKey(candidate.move)
        || hashBoard(entry.position.board, entry.position.nextPlayer) === nextPositionHash);

    if (!child) {
      child = new VariationNode({
        id: `node-${++state.nodeCounter}`,
        parentId: node.id,
        position: nextPosition,
        move: candidate.move,
        score: candidate.scoreLead,
        label: pointToText(candidate.move, node.position.size),
        rank: candidate.rank,
      });
      state.nodes.set(child.id, child);
      node.children.push(child.id);
    } else {
      child.position = nextPosition;
      child.score = candidate.scoreLead;
      child.rank = candidate.rank;
      child.label = pointToText(candidate.move, node.position.size);
    }
  }
}

async function analyzeNode(node, count) {
  const result = await getAnalyzer().analyze(node.position, count);
  applyAnalysisToNode(node, result);
  return result;
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  state.hoveredNodeId = null;
  state.viewNodeId = nodeId;
  updateSelectedAnalysisMessage();
  renderBoard();
  refreshStatus();
  updateMoveInfo();
}

function clearHover() {
  if (!state.hoveredNodeId) {
    return;
  }
  state.hoveredNodeId = null;
  renderBoard();
  refreshStatus();
  updateMoveInfo();
}

async function appendUserMove(move, trigger = "manual") {
  if (state.autoBusy && trigger === "manual") {
    refreshStatus("Computer is choosing a move.");
    return;
  }

  const parent = getSelectedNode();
  const nextPosition = parent.position.play(move);
  if (!nextPosition) {
    refreshStatus("Illegal move for the current position.");
    return;
  }

  const nextPositionHash = hashBoard(nextPosition.board, nextPosition.nextPlayer);
  const existingChild = parent.children
    .map((id) => state.nodes.get(id))
    .find((entry) => moveKey(entry.move) === moveKey(move)
      || hashBoard(entry.position.board, entry.position.nextPlayer) === nextPositionHash);
  if (existingChild) {
    selectNode(existingChild.id);
    await maybeAutoRespond(trigger);
    return;
  }

  const child = new VariationNode({
    id: `node-${++state.nodeCounter}`,
    parentId: parent.id,
    position: nextPosition,
    move,
    label: pointToText(move, parent.position.size),
  });

  state.nodes.set(child.id, child);
  parent.children.unshift(child.id);
  parent.analysis = [];
  parent.analysisSource = "";
  selectNode(child.id);
  await maybeAutoRespond(trigger);
}

function undoMove() {
  const node = getSelectedNode();
  if (node.parentId) {
    selectNode(node.parentId);
  }
}

function resetApp() {
  createRoot(Number(refs.boardSizeSelect.value));
  state.autoBusy = false;
  updateAnalysisMeta("Generate best moves to grow the cloud.");
  renderBoard();
  refreshStatus();
  updateMoveInfo();
  updateComputerControls();
}

async function maybeAutoRespond(trigger) {
  if ((trigger !== "manual" && trigger !== "toggle") || state.autoBusy || !state.autoPlayer) {
    return;
  }

  const node = getSelectedNode();
  if (node.position.nextPlayer !== state.autoPlayer) {
    return;
  }

  state.autoBusy = true;
  updateAnalysisMeta(`${state.autoPlayer === "B" ? "Black" : "White"} computer is choosing from ${getAutoSuggestCount()} moves...`);

  try {
    const result = await analyzeNode(node, getAutoSuggestCount());
    const candidates = node.analysis
      .map((candidate) => node.children
        .map((id) => state.nodes.get(id))
        .find((entry) => moveKey(entry.move) === moveKey(candidate.move)))
      .filter(Boolean);

    if (!candidates.length) {
      updateAnalysisMeta("Computer could not find a playable response.");
      return;
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    selectNode(chosen.id);
    updateAnalysisMeta(`${state.autoPlayer === "B" ? "Black" : "White"} computer chose ${chosen.label} from ${result.source}.`);
  } catch (error) {
    updateAnalysisMeta(`Computer move failed: ${error.message}`);
  } finally {
    state.autoBusy = false;
  }
}

async function setAutoPlayer(color) {
  const nextAutoPlayer = state.autoPlayer === color ? null : color;
  const wasAlreadySelected = state.autoPlayer === color;
  state.autoPlayer = nextAutoPlayer;
  updateComputerControls();

  if (wasAlreadySelected || !nextAutoPlayer) {
    return;
  }

  const node = getSelectedNode();
  if (node.position.nextPlayer === nextAutoPlayer) {
    await maybeAutoRespond("toggle");
  }
}

function getDepthMap() {
  const depthMap = new Map([["root", 0]]);
  const queue = ["root"];

  while (queue.length) {
    const id = queue.shift();
    const node = state.nodes.get(id);
    const depth = depthMap.get(id);
    for (const childId of node.children) {
      depthMap.set(childId, depth + 1);
      queue.push(childId);
    }
  }

  return depthMap;
}

function getNeighborhood(centerId, radius = CLOUD_RADIUS) {
  const visible = new Map([[centerId, 0]]);
  const queue = [centerId];

  while (queue.length) {
    const id = queue.shift();
    const distance = visible.get(id);
    if (distance >= radius) {
      continue;
    }

    const node = state.nodes.get(id);
    const adjacent = node.parentId ? [node.parentId, ...node.children] : node.children.slice();
    for (const nextId of adjacent) {
      if (!visible.has(nextId)) {
        visible.set(nextId, distance + 1);
        queue.push(nextId);
      }
    }
  }

  return visible;
}

function sortNodes(ids) {
  return ids.slice().sort((a, b) => {
    const pathA = buildPathToRoot(state.nodes, a).map((node) => node.rank ?? 0).join("-");
    const pathB = buildPathToRoot(state.nodes, b).map((node) => node.rank ?? 0).join("-");
    return pathA.localeCompare(pathB) || a.localeCompare(b);
  });
}

function buildRenderOrder() {
  const order = new Map();
  let cursor = 0;

  const walk = (nodeId) => {
    order.set(nodeId, cursor++);
    const node = state.nodes.get(nodeId);
    if (!node) {
      return;
    }
    const children = sortNodes(node.children);
    for (const childId of children) {
      walk(childId);
    }
  };

  walk("root");
  return order;
}

function sortByRenderOrder(ids, orderMap) {
  return ids.slice().sort((a, b) => {
    const ao = orderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bo = orderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ao - bo || a.localeCompare(b);
  });
}

function enforceRowOrderNoCross(targets, depthMap, focusDepth, orderMap, minGap = 20) {
  const rows = new Map();
  for (const id of targets.keys()) {
    const relativeDepth = (depthMap.get(id) || 0) - focusDepth;
    if (!rows.has(relativeDepth)) {
      rows.set(relativeDepth, []);
    }
    rows.get(relativeDepth).push(id);
  }

  for (const ids of rows.values()) {
    if (ids.length <= 1) {
      continue;
    }
    const ordered = sortByRenderOrder(ids, orderMap);
    const centerBefore = ordered.reduce((sum, id) => sum + targets.get(id).x, 0) / ordered.length;

    let lastX = -Infinity;
    for (const id of ordered) {
      const target = targets.get(id);
      const nextX = Math.max(target.x, lastX + minGap);
      target.x = nextX;
      lastX = nextX;
    }

    const centerAfter = ordered.reduce((sum, id) => sum + targets.get(id).x, 0) / ordered.length;
    const shift = centerBefore - centerAfter;
    for (const id of ordered) {
      targets.get(id).x += shift;
    }
  }
}

function pickScrollTarget(direction) {
  const anchorId = state.viewNodeId || state.selectedNodeId;
  const anchorNode = state.nodes.get(anchorId);
  if (!anchorNode) {
    return null;
  }

  if (direction < 0) {
    return anchorNode.parentId || null;
  }

  if (!anchorNode.children.length) {
    return null;
  }

  const selectedPath = buildPathToRoot(state.nodes, state.selectedNodeId).map((node) => node.id);
  const pathIndex = selectedPath.indexOf(anchorId);
  if (pathIndex >= 0 && pathIndex < selectedPath.length - 1) {
    const nextOnPath = selectedPath[pathIndex + 1];
    if (anchorNode.children.includes(nextOnPath)) {
      return nextOnPath;
    }
  }

  return sortNodes(anchorNode.children)[0] || null;
}

function stepEdgeScroll(direction) {
  const anchorId = state.hoveredNodeId || state.viewNodeId || state.selectedNodeId;
  const anchorNode = state.nodes.get(anchorId);
  if (!anchorNode) {
    return false;
  }

  let nextId = null;
  if (direction < 0) {
    nextId = anchorNode.parentId || null;
  } else if (direction > 0) {
    if (anchorNode.children.length) {
      const sortedChildren = sortNodes(anchorNode.children);
      const selectedPath = buildPathToRoot(state.nodes, state.selectedNodeId).map((node) => node.id);
      const pathIndex = selectedPath.indexOf(anchorId);
      if (pathIndex >= 0 && pathIndex < selectedPath.length - 1 && sortedChildren.includes(selectedPath[pathIndex + 1])) {
        nextId = selectedPath[pathIndex + 1];
      } else {
        nextId = sortedChildren[0];
      }
    }
  }

  if (!nextId || nextId === state.viewNodeId) {
    return false;
  }
  state.viewNodeId = nextId;
  if (state.hoveredNodeId) {
    clearHover();
  }
  refreshStatus();
  updateMoveInfo();
  return true;
}

function isEditableTarget(target) {
  if (!target) {
    return false;
  }
  const tag = target.tagName;
  return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function navigateSelectedByArrow(key) {
  const selected = getSelectedNode();
  if (!selected) {
    return;
  }

  if (key === "ArrowUp") {
    if (selected.parentId) {
      selectNode(selected.parentId);
    }
    return;
  }

  if (key === "ArrowDown") {
    if (!selected.children.length) {
      return;
    }
    const nextChildId = sortNodes(selected.children)[0];
    if (nextChildId) {
      selectNode(nextChildId);
    }
    return;
  }

  if (key !== "ArrowLeft" && key !== "ArrowRight") {
    return;
  }

  if (!selected.parentId) {
    return;
  }
  const parent = state.nodes.get(selected.parentId);
  if (!parent?.children?.length) {
    return;
  }
  const siblings = sortNodes(parent.children);
  const index = siblings.indexOf(selected.id);
  if (index < 0) {
    return;
  }
  const nextIndex = key === "ArrowLeft" ? index - 1 : index + 1;
  if (nextIndex >= 0 && nextIndex < siblings.length) {
    selectNode(siblings[nextIndex]);
  }
}

function applyEdgeZoneFromEvent(event) {
  const bounds = refs.cloudHost.getBoundingClientRect();
  if (!bounds.height) {
    state.edgeZoneDirection = 0;
    state.edgeScrollTimer = 0;
    return;
  }
  const topLimit = bounds.top + bounds.height * 0.15;
  const bottomLimit = bounds.bottom - bounds.height * 0.15;
  const nextDirection = event.clientY <= topLimit ? -1 : event.clientY >= bottomLimit ? 1 : 0;
  if (nextDirection !== state.edgeZoneDirection) {
    state.edgeZoneDirection = nextDirection;
    state.edgeScrollTimer = 0;
  }
  if (nextDirection && state.hoveredNodeId) {
    clearHover();
  }
}

function getBoardMetrics(size) {
  const width = state.boardApp.renderer.width;
  const height = state.boardApp.renderer.height;
  const inset = Math.max(34, Math.min(width, height) * 0.07);
  const boardSize = Math.min(width, height) - inset * 2;
  const originX = (width - boardSize) / 2;
  const originY = (height - boardSize) / 2;
  const step = boardSize / (size - 1);
  return { boardSize, originX, originY, step, inset };
}

function buildStoneMoveNumberMap(node) {
  const path = buildPathToRoot(state.nodes, node.id);
  const numberMap = new Map();
  const sim = new GamePosition({ size: path[0].position.size });

  for (let index = 1; index < path.length; index += 1) {
    const stepNode = path[index];
    const next = sim.play(stepNode.move);
    if (!next) {
      continue;
    }

    for (let y = 0; y < sim.size; y += 1) {
      for (let x = 0; x < sim.size; x += 1) {
        if (sim.board[y][x] && !next.board[y][x]) {
          numberMap.delete(coordKey(x, y));
        }
      }
    }

    if (stepNode.move && !stepNode.move.pass) {
      numberMap.set(coordKey(stepNode.move.x, stepNode.move.y), index);
    }

    sim.board = next.board;
    sim.nextPlayer = next.nextPlayer;
    sim.moveNumber = next.moveNumber;
    sim.captures = { ...next.captures };
    sim.history = next.history.slice();
  }

  return numberMap;
}

function drawBoardAnnotations(node, annotations, originX, originY, step) {
  const previous = annotations.removeChildren();
  previous.forEach((child) => child.destroy());

  if (state.showChildrenLabels) {
    const children = node.children
      .map((id) => state.nodes.get(id))
      .filter((child) => child && child.move && !child.move.pass)
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.id.localeCompare(b.id));
    children.forEach((child, index) => {
      const label = new Text({
        text: indexToAlphaLabel(index),
        style: {
          fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif",
          fontSize: Math.max(18, step * 0.5),
          fontWeight: "700",
          fill: "#000000",
        },
      });
      label.anchor.set(0.5);
      label.x = originX + child.move.x * step;
      label.y = originY + child.move.y * step;
      annotations.addChild(label);
    });
  }

  if (state.showMoveNumbers) {
    const numberMap = buildStoneMoveNumberMap(node);
    for (const [xy, number] of numberMap.entries()) {
      const [xText, yText] = xy.split(",");
      const x = Number(xText);
      const y = Number(yText);
      const stoneColor = node.position.board[y]?.[x];
      if (!stoneColor) {
        continue;
      }
      const text = new Text({
        text: String(number),
        style: {
          fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif",
          fontSize: Math.max(15, step * 0.4),
          fontWeight: "700",
          fill: stoneColor === "B" ? "#ffffff" : "#000000",
        },
      });
      text.anchor.set(0.5);
      text.x = originX + x * step;
      text.y = originY + y * step;
      annotations.addChild(text);
    }
  }
}

function drawStone(graphics, x, y, radius, color, outlineWidth = 2) {
  const palette = getPalette();
  graphics.clear();
  graphics.circle(x, y, radius).fill(color).stroke({ width: outlineWidth, color: palette.ink });
}

function renderBoard() {
  if (!state.boardApp) {
    return;
  }

  const node = getDisplayedNode();
  const { position } = node;
  const palette = getPalette();
  const { boardSize, originX, originY, step } = getBoardMetrics(position.size);
  const { background, grid, stars, stones, annotations, marker, hitArea } = state.boardLayers;

  background.clear();

  grid.clear();
  for (let index = 0; index < position.size; index += 1) {
    const offset = originY + step * index;
    grid.moveTo(originX, offset).lineTo(originX + boardSize, offset);
    grid.moveTo(originX + step * index, originY).lineTo(originX + step * index, originY + boardSize);
  }
  grid.stroke({ width: 1, color: palette.grid });

  stars.clear();
  for (const pointX of STAR_POINTS[position.size] || []) {
    for (const pointY of STAR_POINTS[position.size] || []) {
      stars.circle(originX + pointX * step, originY + pointY * step, 3.6).fill(palette.star);
    }
  }

  const previousStones = stones.removeChildren();
  previousStones.forEach((child) => child.destroy());
  for (let y = 0; y < position.size; y += 1) {
    for (let x = 0; x < position.size; x += 1) {
      const value = position.board[y][x];
      if (!value) {
        continue;
      }
      const stone = new Graphics();
      drawStone(
        stone,
        originX + x * step,
        originY + y * step,
        Math.max(10, step * 0.42),
        value === "B" ? palette.blackStone : palette.whiteStone,
        2
      );
      stones.addChild(stone);
    }
  }

  drawBoardAnnotations(node, annotations, originX, originY, step);

  marker.clear();
  if (node.move && !node.move.pass) {
    const ringColor = getNodeMoveColor(node) === "black" ? palette.markerLight : palette.markerDark;
    marker
      .circle(originX + node.move.x * step, originY + node.move.y * step, Math.max(12, step * 0.26))
      .stroke({ width: 2.2, color: ringColor });
  } else if (node.analysis?.length) {
    const best = node.analysis[0].move;
    if (!best.pass) {
      marker
        .circle(originX + best.x * step, originY + best.y * step, Math.max(7, step * 0.15))
        .fill(palette.markerDark);
    }
  }

  hitArea.clear();
  hitArea.rect(originX, originY, boardSize, boardSize).fill({ color: "#ffffff", alpha: 0.001 });
}

function refreshStatus(extraMessage = "") {
  const displayedNode = getDisplayedNode();
  const selectedNode = getSelectedNode();
  const isPreview = state.hoveredNodeId && state.hoveredNodeId !== state.selectedNodeId;
  const moveText = displayedNode.move
    ? `${opposite(displayedNode.position.nextPlayer)} played ${pointToText(displayedNode.move, displayedNode.position.size)}.`
    : "Opening position.";

  let text = `${displayedNode.position.nextPlayer === "B" ? "Black" : "White"} to play on move ${displayedNode.position.moveNumber}. ${moveText}`;
  if (isPreview) {
    text = `Previewing ${displayedNode.label}. Click to continue play from this position.`;
  } else if (selectedNode.analysis?.length) {
    text = `${text} ${selectedNode.analysis.length} suggested continuations loaded.`;
  }

  if (extraMessage) {
    text = `${text} ${extraMessage}`;
  }

  refs.statusText.textContent = text;
}

function boardPointFromGlobal(global) {
  const position = getSelectedNode().position;
  const { boardSize, originX, originY, step } = getBoardMetrics(position.size);
  const localX = global.x - originX;
  const localY = global.y - originY;

  if (localX < -step * 0.5 || localY < -step * 0.5 || localX > boardSize + step * 0.5 || localY > boardSize + step * 0.5) {
    return null;
  }

  const x = Math.round(localX / step);
  const y = Math.round(localY / step);
  return inBounds(position.size, x, y) ? { x, y } : null;
}

function drawCloudBackground() {
  const { backdrop } = state.cloudLayers;
  backdrop.clear();
}

function computeNormalTargets(rows, orderedDepths, neighborhood, motion, centerX, centerY, rowGap, columnGap, orderMap, focusId) {
  const targets = new Map();
  const focusOrder = orderMap.get(focusId) ?? 0;

  for (const depth of orderedDepths) {
    const row = sortByRenderOrder(rows.get(depth), orderMap);
    const rowCount = row.length;
    if (!rowCount) {
      continue;
    }
    const focusIndex = row.findIndex((id) => id === focusId);
    const pivotIndex = focusIndex >= 0
      ? focusIndex
      : row.reduce((bestIndex, id, index) => {
          const bestDelta = Math.abs((orderMap.get(row[bestIndex]) ?? 0) - focusOrder);
          const nextDelta = Math.abs((orderMap.get(id) ?? 0) - focusOrder);
          return nextDelta < bestDelta ? index : bestIndex;
        }, Math.floor((rowCount - 1) / 2));
    const rowSpread = columnGap * (1 + Math.abs(depth) * 0.05);
    const sideClamp = rowSpread * 0.35;

    row.forEach((id, index) => {
      const distance = neighborhood.get(id);
      const seed = seedFromId(id);
      const offset = rowCount === 1 ? 0 : index - pivotIndex;
      let baseX = centerX + offset * rowSpread;
      if (offset < 0) {
        baseX = Math.min(baseX, centerX - sideClamp);
      } else if (offset > 0) {
        baseX = Math.max(baseX, centerX + sideClamp);
      }
      const baseY = centerY + depth * rowGap;
      const orbitX = rowCount === 1
        ? 0
        : Math.sin(state.time * 0.85 + seed * Math.PI * 2) * (distance === 0 ? motion.orbitFocus : motion.orbitOther);
      const orbitY = Math.cos(state.time * 1.1 + seed * Math.PI * 2) * (distance === 0 ? motion.orbitFocus * 0.8 : motion.orbitOther * 0.75);
      targets.set(id, { x: baseX + orbitX, y: baseY + orbitY, distance });
    });
  }
  return targets;
}

function fitTargetsToViewport(targets, width, height, padding = 28) {
  const entries = Array.from(targets.values());
  if (!entries.length) {
    return;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const target of entries) {
    minX = Math.min(minX, target.x);
    maxX = Math.max(maxX, target.x);
    minY = Math.min(minY, target.y);
    maxY = Math.max(maxY, target.y);
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const availableX = Math.max(1, width - padding * 2);
  const availableY = Math.max(1, height - padding * 2);
  const fitScale = Math.min(1, availableX / spanX, availableY / spanY);
  const currentCenterX = (minX + maxX) / 2;
  const currentCenterY = (minY + maxY) / 2;
  const targetCenterX = width / 2;
  const targetCenterY = height / 2;

  for (const target of targets.values()) {
    target.x = (target.x - currentCenterX) * fitScale + targetCenterX;
    target.y = (target.y - currentCenterY) * fitScale + targetCenterY;
  }
}

function resolveTreeOverlaps(targets, minDistance, pinnedId = null) {
  const ids = Array.from(targets.keys());
  if (ids.length <= 1) {
    return;
  }
  const minDistSq = minDistance * minDistance;

  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < ids.length; i += 1) {
      const aId = ids[i];
      const a = targets.get(aId);
      for (let j = i + 1; j < ids.length; j += 1) {
        const bId = ids[j];
        const b = targets.get(bId);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDistSq) {
          continue;
        }

        const dist = Math.max(0.001, Math.sqrt(distSq));
        const overlap = (minDistance - dist) * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;
        const axLocked = aId === pinnedId;
        const bxLocked = bId === pinnedId;

        if (axLocked && !bxLocked) {
          b.x += nx * overlap * 2;
          b.y += ny * overlap * 2;
        } else if (!axLocked && bxLocked) {
          a.x -= nx * overlap * 2;
          a.y -= ny * overlap * 2;
        } else {
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
      }
    }
  }
}

function computeCloudLayout() {
  const interactionFocusId = state.hoveredNodeId || state.viewNodeId || state.selectedNodeId;
  const depthMap = getDepthMap();
  const orderMap = buildRenderOrder();
  const motion = getMotionPreset();
  const focusId = interactionFocusId;
  const neighborhoodAll = getNeighborhood(focusId, state.treeDepth);
  const neighborhood = new Map();
  for (const [id, distance] of neighborhoodAll.entries()) {
    const node = state.nodes.get(id);
    if (node?.move) {
      neighborhood.set(id, distance);
    }
  }
  const focusDepth = depthMap.get(focusId) || 0;
  const width = state.cloudApp.renderer.width;
  const height = state.cloudApp.renderer.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const spacingBuffer = clamp(state.treeBuffer || 1, 0.4, 2);
  const verticalBuffer = clamp(state.treeVBuffer || 1, 0.4, 2);
  const rowGap = clamp((height / 7.5) * verticalBuffer, 42, 220);
  const columnGap = clamp((width / 4.8) * spacingBuffer, 42, 148);
  const rows = new Map();

  for (const id of neighborhood.keys()) {
    const relativeDepth = (depthMap.get(id) || 0) - focusDepth;
    if (!rows.has(relativeDepth)) {
      rows.set(relativeDepth, []);
    }
    rows.get(relativeDepth).push(id);
  }

  const orderedDepths = Array.from(rows.keys()).sort((a, b) => a - b);
  const targets = computeNormalTargets(
    rows,
    orderedDepths,
    neighborhood,
    motion,
    centerX,
    centerY,
    rowGap,
    columnGap,
    orderMap,
    focusId
  );
  const spacingMinGap = clamp(columnGap * 0.28 * spacingBuffer, 8, 44);
  enforceRowOrderNoCross(targets, depthMap, focusDepth, orderMap, spacingMinGap);

  if (state.hoveredNodeId && targets.has(state.hoveredNodeId)) {
    const hoveredTarget = targets.get(state.hoveredNodeId);
    for (const [id, target] of targets.entries()) {
      if (id === state.hoveredNodeId) {
        continue;
      }
      const dx = target.x - hoveredTarget.x;
      const dy = target.y - hoveredTarget.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const push = target.distance <= 1 ? motion.pushNear : motion.pushFar;
      target.x += (dx / length) * push;
      target.y += (dy / length) * push * 0.8;
    }
  }

  const pinnedId = state.hoveredNodeId && targets.has(state.hoveredNodeId) ? state.hoveredNodeId : null;
  resolveTreeOverlaps(targets, clamp(18 * spacingBuffer, 14, 36), pinnedId);
  enforceRowOrderNoCross(targets, depthMap, focusDepth, orderMap, spacingMinGap);
  fitTargetsToViewport(targets, width, height, 34);

  const minDepth = orderedDepths.length ? orderedDepths[0] : 0;
  const maxDepth = orderedDepths.length ? orderedDepths[orderedDepths.length - 1] : 0;

  return {
    focusId,
    neighborhood,
    targets,
    minDepth,
    maxDepth,
    depthMap,
    interactionFocusId,
  };
}

function ensureCloudView(nodeId) {
  if (state.cloudViews.has(nodeId)) {
    return state.cloudViews.get(nodeId);
  }

  const container = new Container();
  const halo = new Graphics();
  const stone = new Graphics();
  container.addChild(halo, stone);
  container.eventMode = "static";
  container.cursor = "pointer";
  container.on("pointerover", () => {
    if (state.edgeZoneDirection !== 0) {
      return;
    }
    state.hoveredNodeId = nodeId;
    renderBoard();
    refreshStatus();
    updateMoveInfo();
  });
  container.on("pointertap", () => {
    selectNode(nodeId);
  });

  state.cloudLayers.nodes.addChild(container);
  const view = {
    container,
    halo,
    stone,
    x: state.cloudApp.renderer.width / 2,
    y: state.cloudApp.renderer.height / 2,
    scale: 1,
    alpha: 0,
  };
  state.cloudViews.set(nodeId, view);
  return view;
}

function drawCloudNode(view, node, info) {
  const palette = getPalette();
  const scaleBoost = state.treeScale;
  const fillColor = getNodeMoveColor(node) === "black"
    ? palette.blackStone
    : getNodeMoveColor(node) === "white"
      ? palette.whiteStone
      : palette.rootStone;
  const radius = (info.focus ? 15 : info.distance === 1 ? 13 : 11) * scaleBoost;
  const centerBoost = info.distance <= 1 ? 6 : info.distance === 2 ? 2 : 0;
  const haloRadius = radius + (info.hovered ? 10 + centerBoost : info.selected ? 7 + centerBoost : info.focus ? 5 + centerBoost : 0);

  view.halo.clear();
  if (info.hovered || info.selected || info.focus) {
    view.halo.circle(0, 0, haloRadius).stroke({
      width: info.hovered ? 3 : info.distance <= 1 ? 2.2 : 1.6,
      color: info.hovered ? palette.linkFocus : info.selected ? palette.haloSelected : palette.haloSoft,
    });
  }

  view.stone.clear();
  view.stone.circle(0, 0, radius).fill(fillColor).stroke({
    width: info.hovered ? 3 : info.selected ? 2.4 : 2,
    color: palette.ink,
  });
}

function drawCloudLinks(layout) {
  const palette = getPalette();
  const { baseLinks, focusLinks } = state.cloudLayers;
  baseLinks.clear();
  focusLinks.clear();
  let baseCount = 0;
  let focusCount = 0;

  for (const [id] of layout.neighborhood) {
    const node = state.nodes.get(id);
    if (!node.parentId || !layout.neighborhood.has(node.parentId)) {
      continue;
    }
    const from = state.cloudViews.get(node.parentId);
    const to = state.cloudViews.get(id);
    if (!from || !to || from.alpha < 0.03 || to.alpha < 0.03) {
      continue;
    }
    const midY = (from.y + to.y) / 2;
    const graphics = id === layout.focusId || node.parentId === layout.focusId ? focusLinks : baseLinks;
    graphics.moveTo(from.x, from.y);
    graphics.bezierCurveTo(from.x, midY, to.x, midY, to.x, to.y);
    if (graphics === focusLinks) {
      focusCount += 1;
    } else {
      baseCount += 1;
    }
  }

  if (baseCount) {
    baseLinks.stroke({ width: 1.4, color: palette.link });
  }
  if (focusCount) {
    focusLinks.stroke({ width: 2.2, color: palette.linkFocus });
  }
}

function stepCloud(deltaSeconds) {
  if (!state.cloudApp) {
    return;
  }

  state.time += deltaSeconds;
  if (state.edgeZoneDirection !== 0) {
    state.edgeScrollTimer += deltaSeconds;
    const scrollStepSeconds = 0.28;
    if (state.edgeScrollTimer >= scrollStepSeconds) {
      state.edgeScrollTimer -= scrollStepSeconds;
      stepEdgeScroll(state.edgeZoneDirection);
    }
  } else {
    state.edgeScrollTimer = 0;
  }
  drawCloudBackground();
  const layout = computeCloudLayout();
  const visibleIds = new Set(layout.neighborhood.keys());

  for (const [id, view] of state.cloudViews.entries()) {
    if (visibleIds.has(id)) {
      continue;
    }
    view.alpha = lerp(view.alpha, 0, 0.18);
    view.container.alpha = view.alpha;
    if (view.alpha < 0.02) {
      view.container.visible = false;
    }
  }

  for (const [id, target] of layout.targets.entries()) {
    const view = ensureCloudView(id);
    const node = state.nodes.get(id);
    const hovered = id === state.hoveredNodeId;
    const selected = id === state.selectedNodeId;
    const focus = id === layout.interactionFocusId;
    const scale = hovered ? 1.45 : focus ? 1.26 : target.distance === 1 ? 1.08 : target.distance === 2 ? 0.97 : 0.9;
    const targetAlpha = hovered ? 1 : focus ? 1 : target.distance === 1 ? 0.94 : target.distance === 2 ? 0.58 : 0.22;
    const motion = getMotionPreset();
    const xEase = motion.xEase;
    const yEase = motion.yEase;

    view.x = lerp(view.x, target.x, xEase);
    view.y = lerp(view.y, target.y, yEase);
    view.scale = lerp(view.scale, scale, 0.18);
    view.alpha = lerp(view.alpha, targetAlpha, 0.18);
    view.container.visible = true;
    view.container.alpha = view.alpha;
    view.container.position.set(view.x, view.y);
    view.container.scale.set(view.scale);
    view.container.cursor = "pointer";
    drawCloudNode(view, node, {
      distance: target.distance,
      hovered,
      selected,
      focus,
    });
  }

  drawCloudLinks(layout);
}

async function createPixiApp(host) {
  const app = new Application();
  await app.init({
    resizeTo: host,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
  });
  host.appendChild(app.canvas);
  return app;
}

async function bootstrapPixi() {
  state.boardApp = await createPixiApp(refs.boardHost);
  state.cloudApp = await createPixiApp(refs.cloudHost);

  const background = new Graphics();
  const grid = new Graphics();
  const stars = new Graphics();
  const stones = new Container();
  const annotations = new Container();
  const marker = new Graphics();
  const hitArea = new Graphics();
  hitArea.eventMode = "static";
  hitArea.cursor = "crosshair";
  hitArea.on("pointertap", (event) => {
    clearHover();
    const move = boardPointFromGlobal(event.global);
    if (move) {
      void appendUserMove(move, "manual");
    }
  });
  state.boardLayers = { background, grid, stars, stones, annotations, marker, hitArea };
  state.boardApp.stage.addChild(background, grid, stars, stones, annotations, marker, hitArea);

  const backdrop = new Graphics();
  const baseLinks = new Graphics();
  const focusLinks = new Graphics();
  const nodes = new Container();
  state.cloudLayers = { backdrop, baseLinks, focusLinks, nodes };
  state.cloudApp.stage.addChild(backdrop, baseLinks, focusLinks, nodes);
  state.cloudApp.ticker.add((ticker) => {
    stepCloud(ticker.deltaMS / 1000);
  });
}

function wireEvents() {
  refs.analyzeButton.addEventListener("click", analyzeSelectedNode);
  refs.resetButton.addEventListener("click", resetApp);
  refs.passButton.addEventListener("click", () => {
    void appendUserMove({ pass: true }, "control");
  });
  refs.cpuBlackButton.addEventListener("click", () => {
    void setAutoPlayer("B");
  });
  refs.cpuWhiteButton.addEventListener("click", () => {
    void setAutoPlayer("W");
  });
  refs.boardSizeSelect.addEventListener("change", resetApp);
  refs.paletteSelect.addEventListener("change", () => {
    applyPalette(refs.paletteSelect.value);
  });
  refs.treeDepth.addEventListener("input", () => {
    state.treeDepth = clamp(Number(refs.treeDepth.value) || CLOUD_RADIUS, 1, 8);
    refs.treeDepth.value = String(state.treeDepth);
  });
  refs.treeSize.addEventListener("input", () => {
    state.treeScale = clamp((Number(refs.treeSize.value) || 100) / 100, 0.7, 1.5);
  });
  refs.treeMotion.addEventListener("input", () => {
    state.treeMotion = clamp((Number(refs.treeMotion.value) || 50) / 100, 0, 1);
  });
  refs.treeBuffer.addEventListener("input", () => {
    state.treeBuffer = clamp((Number(refs.treeBuffer.value) || 100) / 100, 0.4, 2);
  });
  refs.treeVBuffer.addEventListener("input", () => {
    state.treeVBuffer = clamp((Number(refs.treeVBuffer.value) || 100) / 100, 0.4, 2);
  });
  refs.suggestCount.addEventListener("input", () => syncSuggestControls(refs.suggestCount.value));
  refs.suggestCountInput.addEventListener("input", () => syncSuggestControls(refs.suggestCountInput.value));
  refs.autoMoveCount.addEventListener("input", () => {
    refs.autoMoveCount.value = String(getAutoSuggestCount());
  });
  refs.showChildrenLabels.addEventListener("change", () => {
    state.showChildrenLabels = Boolean(refs.showChildrenLabels.checked);
    renderBoard();
  });
  refs.showMoveNumbers.addEventListener("change", () => {
    state.showMoveNumbers = Boolean(refs.showMoveNumbers.checked);
    renderBoard();
  });
  refs.cloudHost.addEventListener("mousemove", applyEdgeZoneFromEvent);
  refs.cloudHost.addEventListener("mouseleave", () => {
    state.edgeZoneDirection = 0;
    state.edgeScrollTimer = 0;
    clearHover();
  });
  window.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    event.preventDefault();
    navigateSelectedByArrow(event.key);
  });
  window.addEventListener("resize", renderBoard);
}

function updateSelectedAnalysisMessage() {
  const node = getSelectedNode();
  if (node.analysis?.length) {
    updateAnalysisMeta(`${node.analysis.length} moves from ${node.analysisSource || "analysis engine"}. Hover to preview, click to commit.`);
  } else {
    updateAnalysisMeta("Generate best moves to grow the cloud.");
  }
}

function updateMoveInfo() {
  const node = getDisplayedNode();
  const moveNumber = Math.max(0, node.position.moveNumber - 1);
  const parts = [`Position ${moveNumber}`];

  if (node.move) {
    parts.push(node.move.pass ? "Pass" : pointToText(node.move, node.position.size));
  }

  if (node.score != null) {
    parts.push(`Eval ${node.score.toFixed(1)}`);
  }

  refs.moveInfo.textContent = parts.join(" | ");
}

async function bootstrap() {
  if (!window.PIXI || !Application || !Container || !Graphics || !Text) {
    showRuntimeError("PixiJS failed to load. Check your internet connection or CDN access, then reload localhost.");
    return;
  }
  applyPalette(refs.paletteSelect?.value || "mono");
  syncSuggestControls(10);
  state.treeDepth = clamp(Number(refs.treeDepth?.value) || CLOUD_RADIUS, 1, 8);
  state.treeScale = clamp((Number(refs.treeSize?.value) || 100) / 100, 0.7, 1.5);
  state.treeMotion = clamp((Number(refs.treeMotion?.value) || 50) / 100, 0, 1);
  state.treeBuffer = clamp((Number(refs.treeBuffer?.value) || 100) / 100, 0.4, 2);
  state.treeVBuffer = clamp((Number(refs.treeVBuffer?.value) || 100) / 100, 0.4, 2);
  state.showChildrenLabels = Boolean(refs.showChildrenLabels?.checked);
  state.showMoveNumbers = Boolean(refs.showMoveNumbers?.checked);
  await bootstrapPixi();
  wireEvents();
  resetApp();
  updateSelectedAnalysisMessage();
}

bootstrap().catch((error) => {
  console.error(error);
  showRuntimeError(`App failed to start: ${error.message}`);
});
