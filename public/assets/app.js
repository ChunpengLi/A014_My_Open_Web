const updatedDate = document.querySelector("#updated-date");

if (updatedDate) {
  updatedDate.textContent = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
  }).format(new Date());
}

const boardCanvas = document.querySelector("#tetris-board");
const nextCanvas = document.querySelector("#tetris-next");

if (boardCanvas && nextCanvas) {
  const boardContext = boardCanvas.getContext("2d");
  const nextContext = nextCanvas.getContext("2d");
  const scoreNode = document.querySelector("#tetris-score");
  const linesNode = document.querySelector("#tetris-lines");
  const levelNode = document.querySelector("#tetris-level");
  const startButton = document.querySelector("#tetris-start");
  const pauseButton = document.querySelector("#tetris-pause");
  const resetButton = document.querySelector("#tetris-reset");
  const columns = 10;
  const rows = 20;
  const cell = 24;
  const nextCell = 18;
  const colors = {
    I: "#26a6d1",
    J: "#4d69d8",
    L: "#ec9b38",
    O: "#f4cf5d",
    S: "#37a96b",
    T: "#9b65d8",
    Z: "#dc5b5b",
  };
  const pieces = {
    I: [[1, 1, 1, 1]],
    J: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
    ],
  };
  const bag = Object.keys(pieces);
  let board;
  let activePiece;
  let nextPiece;
  let score;
  let lines;
  let level;
  let isRunning;
  let isPaused;
  let lastTime;
  let dropCounter;
  let animationFrame;

  function emptyBoard() {
    return Array.from({ length: rows }, () => Array(columns).fill(null));
  }

  function randomPiece() {
    const type = bag[Math.floor(Math.random() * bag.length)];
    return {
      type,
      matrix: pieces[type].map((row) => [...row]),
      x: Math.floor(columns / 2) - Math.ceil(pieces[type][0].length / 2),
      y: 0,
    };
  }

  function resetGame() {
    board = emptyBoard();
    activePiece = randomPiece();
    nextPiece = randomPiece();
    score = 0;
    lines = 0;
    level = 1;
    isRunning = false;
    isPaused = false;
    lastTime = 0;
    dropCounter = 0;
    updateStats();
    draw();
  }

  function updateStats() {
    if (scoreNode) scoreNode.textContent = score;
    if (linesNode) linesNode.textContent = lines;
    if (levelNode) levelNode.textContent = level;
  }

  function rotate(matrix) {
    return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
  }

  function collides(piece, nextX = piece.x, nextY = piece.y, matrix = piece.matrix) {
    return matrix.some((row, y) =>
      row.some((value, x) => {
        if (!value) return false;
        const boardX = nextX + x;
        const boardY = nextY + y;
        return (
          boardX < 0 ||
          boardX >= columns ||
          boardY >= rows ||
          Boolean(board[boardY]?.[boardX])
        );
      }),
    );
  }

  function mergePiece() {
    activePiece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value && board[activePiece.y + y]) {
          board[activePiece.y + y][activePiece.x + x] = activePiece.type;
        }
      });
    });
  }

  function clearLines() {
    let cleared = 0;
    board = board.filter((row) => {
      if (row.every(Boolean)) {
        cleared += 1;
        return false;
      }
      return true;
    });
    while (board.length < rows) {
      board.unshift(Array(columns).fill(null));
    }
    if (cleared) {
      lines += cleared;
      level = Math.floor(lines / 8) + 1;
      score += [0, 100, 300, 500, 800][cleared] * level;
      updateStats();
    }
  }

  function spawnPiece() {
    activePiece = nextPiece;
    activePiece.x = Math.floor(columns / 2) - Math.ceil(activePiece.matrix[0].length / 2);
    activePiece.y = 0;
    nextPiece = randomPiece();
    if (collides(activePiece)) {
      isRunning = false;
    }
  }

  function move(dx) {
    if (!isRunning || isPaused) return;
    if (!collides(activePiece, activePiece.x + dx, activePiece.y)) {
      activePiece.x += dx;
      draw();
    }
  }

  function softDrop() {
    if (!isRunning || isPaused) return;
    if (!collides(activePiece, activePiece.x, activePiece.y + 1)) {
      activePiece.y += 1;
      score += 1;
      updateStats();
    } else {
      mergePiece();
      clearLines();
      spawnPiece();
    }
    dropCounter = 0;
    draw();
  }

  function hardDrop() {
    if (!isRunning || isPaused) return;
    while (!collides(activePiece, activePiece.x, activePiece.y + 1)) {
      activePiece.y += 1;
      score += 2;
    }
    softDrop();
  }

  function rotateActivePiece() {
    if (!isRunning || isPaused) return;
    const rotated = rotate(activePiece.matrix);
    const originalX = activePiece.x;
    const offsets = [0, -1, 1, -2, 2];
    const offset = offsets.find((shift) => !collides(activePiece, originalX + shift, activePiece.y, rotated));
    if (offset !== undefined) {
      activePiece.matrix = rotated;
      activePiece.x = originalX + offset;
      draw();
    }
  }

  function startGame() {
    if (!isRunning && collides(activePiece)) resetGame();
    isRunning = true;
    isPaused = false;
    lastTime = 0;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(update);
  }

  function togglePause() {
    if (!isRunning) return;
    isPaused = !isPaused;
    if (!isPaused) {
      lastTime = 0;
      animationFrame = window.requestAnimationFrame(update);
    }
    draw();
  }

  function drawCell(context, x, y, size, color) {
    context.fillStyle = color;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.fillStyle = "rgba(255, 255, 255, 0.24)";
    context.fillRect(x * size + 3, y * size + 3, size - 6, 4);
  }

  function drawMatrix(context, matrix, offsetX, offsetY, size, type) {
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) drawCell(context, offsetX + x, offsetY + y, size, colors[type]);
      });
    });
  }

  function drawBoard() {
    boardContext.fillStyle = "#101820";
    boardContext.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    boardContext.strokeStyle = "rgba(255, 255, 255, 0.06)";
    boardContext.lineWidth = 1;
    for (let x = 1; x < columns; x += 1) {
      boardContext.beginPath();
      boardContext.moveTo(x * cell, 0);
      boardContext.lineTo(x * cell, boardCanvas.height);
      boardContext.stroke();
    }
    for (let y = 1; y < rows; y += 1) {
      boardContext.beginPath();
      boardContext.moveTo(0, y * cell);
      boardContext.lineTo(boardCanvas.width, y * cell);
      boardContext.stroke();
    }
    board.forEach((row, y) => {
      row.forEach((type, x) => {
        if (type) drawCell(boardContext, x, y, cell, colors[type]);
      });
    });
    drawMatrix(boardContext, activePiece.matrix, activePiece.x, activePiece.y, cell, activePiece.type);
    if (!isRunning || isPaused) {
      boardContext.fillStyle = "rgba(16, 24, 32, 0.64)";
      boardContext.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
      boardContext.fillStyle = "#ffffff";
      boardContext.font = "700 24px system-ui";
      boardContext.textAlign = "center";
      boardContext.textBaseline = "middle";
      boardContext.fillText(isPaused ? "Paused" : "Ready", boardCanvas.width / 2, boardCanvas.height / 2);
    }
  }

  function drawNext() {
    nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextContext.fillStyle = "#f2f7f8";
    nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    const offsetX = Math.floor((nextCanvas.width / nextCell - nextPiece.matrix[0].length) / 2);
    const offsetY = Math.floor((nextCanvas.height / nextCell - nextPiece.matrix.length) / 2);
    drawMatrix(nextContext, nextPiece.matrix, offsetX, offsetY, nextCell, nextPiece.type);
  }

  function draw() {
    drawBoard();
    drawNext();
  }

  function update(time = 0) {
    if (!isRunning || isPaused) return;
    const delta = time - lastTime;
    lastTime = time;
    dropCounter += delta;
    const interval = Math.max(120, 740 - level * 55);
    if (dropCounter > interval) softDrop();
    draw();
    animationFrame = window.requestAnimationFrame(update);
  }

  document.addEventListener("keydown", (event) => {
    const isHardDrop = event.key === " " || event.code === "Space";
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(event.key) || isHardDrop) {
      event.preventDefault();
    }
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
    if (event.key === "ArrowDown") softDrop();
    if (event.key === "ArrowUp") rotateActivePiece();
    if (isHardDrop) hardDrop();
  });

  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.move;
      if (action === "left") move(-1);
      if (action === "right") move(1);
      if (action === "down") softDrop();
      if (action === "rotate") rotateActivePiece();
      if (action === "drop") hardDrop();
    });
  });

  startButton?.addEventListener("click", startGame);
  pauseButton?.addEventListener("click", togglePause);
  resetButton?.addEventListener("click", () => {
    window.cancelAnimationFrame(animationFrame);
    resetGame();
  });

  resetGame();
}
