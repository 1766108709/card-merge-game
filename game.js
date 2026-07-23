(() => {
  "use strict";

  const {
    CARD_RANKS,
    SAFE_RANK_SEQUENCES,
    compareRankIds,
    getNextRank,
  } = window.CardMergeRules;

  const LEVELS = [
    {
      title: "翻开第一手",
      subtitle: "暖身关 · 2 至 7",
      layout: () => [
        ...grid([140, 300, 460, 620, 780], [220, 390, 560], 0),
        ...grid([220, 380, 540, 700], [300, 470, 640], 1),
        ...grid([340, 500, 660], [390], 2),
      ],
    },
    {
      title: "数字阶梯",
      subtitle: "进阶关 · 连续进位",
      layout: () => [
        ...grid([120, 300, 480, 660, 840], [150, 340, 530, 720], 0),
        ...grid([210, 390, 570, 750], [240, 430, 620, 810], 1),
        ...grid([250, 420, 590, 760], [330, 520, 710], 2),
      ],
    },
    {
      title: "冲刺大王",
      subtitle: "挑战关 · 2 至大王",
      layout: () => [
        ...grid([80, 245, 410, 575, 740, 905], [140, 340, 540, 740], 0),
        ...grid([150, 330, 510, 690, 870], [230, 420, 610, 800], 1),
        ...grid([245, 415, 585, 755], [320, 510, 700], 2),
        ...grid([330, 500, 670, 840], [430], 3),
      ],
    },
  ];

  const TRAY_LIMIT = 7;
  const OVERLAP_X = 136;
  const OVERLAP_Y = 188;
  const STORAGE_PREFIX = "card-merge-";
  const SUPPORTS_POINTER_EVENTS = "PointerEvent" in window;
  const CARD_SUITS = Object.freeze([
    { symbol: "♠", color: "black" },
    { symbol: "♥", color: "red" },
    { symbol: "♣", color: "black" },
    { symbol: "♦", color: "red" },
  ]);

  const elements = {
    board: document.querySelector("#gameBoard"),
    tray: document.querySelector("#tray"),
    stashPanel: document.querySelector("#stashPanel"),
    stashSlots: document.querySelector("#stashSlots"),
    score: document.querySelector("#score"),
    levelNumber: document.querySelector("#levelNumber"),
    levelTitle: document.querySelector("#levelTitle"),
    progressFill: document.querySelector("#progressFill"),
    progressText: document.querySelector("#progressText"),
    movesCount: document.querySelector("#movesCount"),
    statusText: document.querySelector("#statusText"),
    comboBadge: document.querySelector("#comboBadge"),
    comboNumber: document.querySelector("#comboNumber"),
    undoButton: document.querySelector("#undoButton"),
    stashButton: document.querySelector("#stashButton"),
    shuffleButton: document.querySelector("#shuffleButton"),
    undoCount: document.querySelector("#undoCount"),
    stashCount: document.querySelector("#stashCount"),
    shuffleCount: document.querySelector("#shuffleCount"),
    restartButton: document.querySelector("#restartButton"),
    soundButton: document.querySelector("#soundButton"),
    helpButton: document.querySelector("#helpButton"),
    modal: document.querySelector("#modal"),
    modalCard: document.querySelector("#modalCard"),
    modalClose: document.querySelector("#modalClose"),
    modalIllustration: document.querySelector("#modalIllustration"),
    modalKicker: document.querySelector("#modalKicker"),
    modalTitle: document.querySelector("#modalTitle"),
    modalDescription: document.querySelector("#modalDescription"),
    modalRules: document.querySelector("#modalRules"),
    modalPrimary: document.querySelector("#modalPrimary"),
    modalSecondary: document.querySelector("#modalSecondary"),
    toast: document.querySelector("#toast"),
    liveRegion: document.querySelector("#liveRegion"),
    confettiLayer: document.querySelector("#confettiLayer"),
  };

  let audioContext = null;
  let hintTimer = null;
  let toastTimer = null;
  let primaryAction = null;
  let secondaryAction = null;
  let lastPointerActivation = { tileId: "", time: 0 };

  const savedLevel = Number.parseInt(localStorage.getItem(`${STORAGE_PREFIX}level`) || "0", 10);

  const state = {
    levelIndex: Number.isFinite(savedLevel)
      ? Math.min(Math.max(savedLevel, 0), LEVELS.length - 1)
      : 0,
    tiles: [],
    tray: [],
    stash: [],
    score: 0,
    moves: 0,
    cleared: 0,
    combo: 0,
    history: [],
    tools: { undo: 3, stash: 1, shuffle: 2 },
    resolving: false,
    status: "intro",
    sound: localStorage.getItem(`${STORAGE_PREFIX}sound`) !== "off",
  };

  function grid(xs, ys, layer) {
    const items = [];
    ys.forEach((y) => {
      xs.forEach((x) => items.push({ x, y, layer }));
    });
    return items;
  }

  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function overlaps(a, b) {
    return Math.abs(a.x - b.x) < OVERLAP_X && Math.abs(a.y - b.y) < OVERLAP_Y;
  }

  function tileIsAvailable(tile, remainingIds = null) {
    if (tile.removed || (remainingIds && !remainingIds.has(tile.id))) return false;

    return !state.tiles.some((other) => {
      if (other.id === tile.id || other.removed || other.layer <= tile.layer) return false;
      if (remainingIds && !remainingIds.has(other.id)) return false;
      return overlaps(tile, other);
    });
  }

  function buildPairRankSequence(levelIndex, groupCount) {
    const sequence = SAFE_RANK_SEQUENCES[levelIndex];
    if (sequence.length !== groupCount) {
      throw new Error("牌面点数序列与牌面数量不一致");
    }
    return sequence;
  }

  function buildSolvableTiles(levelIndex) {
    const placements = LEVELS[levelIndex].layout();
    const tiles = placements.map((placement, index) => ({
      ...placement,
      id: `l${levelIndex}-tile-${index}`,
      type: "",
      removed: false,
      safeRank: 0,
    }));

    state.tiles = tiles;
    const remainingIds = new Set(tiles.map((tile) => tile.id));
    const safeOrder = [];

    while (remainingIds.size) {
      const available = tiles.filter((tile) => tileIsAvailable(tile, remainingIds));
      const next = available[Math.floor(Math.random() * available.length)];
      safeOrder.push(next);
      remainingIds.delete(next.id);
    }

    if (safeOrder.length % 2 !== 0) {
      throw new Error("牌面数量必须是偶数");
    }

    const groups = safeOrder.length / 2;
    const rankSequence = buildPairRankSequence(levelIndex, groups);

    for (let groupIndex = 0; groupIndex < groups; groupIndex += 1) {
      const typeId = rankSequence[groupIndex];
      for (let offset = 0; offset < 2; offset += 1) {
        const tile = safeOrder[groupIndex * 2 + offset];
        tile.type = typeId;
        tile.safeRank = groupIndex * 2 + offset;
      }
    }

    return tiles;
  }

  function startLevel(levelIndex, { keepScore = false } = {}) {
    clearTimeout(hintTimer);
    state.levelIndex = levelIndex;
    state.tray = [];
    state.stash = [];
    state.moves = 0;
    state.cleared = 0;
    state.combo = 0;
    state.history = [];
    state.tools = { undo: 3, stash: 1, shuffle: 2 };
    state.resolving = false;
    state.status = "playing";
    if (!keepScore) state.score = 0;
    buildSolvableTiles(levelIndex);
    localStorage.setItem(`${STORAGE_PREFIX}level`, String(levelIndex));
    renderAll();
    scheduleHint();
  }

  function getType(typeId) {
    return CARD_RANKS.find((type) => type.id === typeId);
  }

  function getCardSuit(seed) {
    const hash = [...String(seed)].reduce((total, character) => total + character.charCodeAt(0), 0);
    return CARD_SUITS[hash % CARD_SUITS.length];
  }

  function cardFaceMarkup(type, seed) {
    const classes = ["card-rank"];
    if (["J", "Q", "K"].includes(type.id)) classes.push("is-face");
    if (["SMALL_JOKER", "BIG_JOKER"].includes(type.id)) classes.push("is-joker");
    const isJoker = classes.includes("is-joker");

    if (isJoker) {
      const jokerClass = type.id === "BIG_JOKER" ? "is-big-joker" : "is-small-joker";
      return `
        <span class="playing-card-face is-joker-card ${jokerClass}" aria-hidden="true">
          <span class="joker-word">JOKER</span>
          <span class="joker-emblem">✦</span>
          <span class="${classes.join(" ")}">${type.label}</span>
        </span>
      `;
    }

    const suit = getCardSuit(seed);
    return `
      <span class="playing-card-face is-${suit.color}" aria-hidden="true">
        <span class="card-corner card-corner-top">
          <b>${type.label}</b><i>${suit.symbol}</i>
        </span>
        <span class="card-center">
          <b class="${classes.join(" ")}">${type.label}</b>
          <i class="card-suit">${suit.symbol}</i>
        </span>
        <span class="card-corner card-corner-bottom">
          <b>${type.label}</b><i>${suit.symbol}</i>
        </span>
      </span>
    `;
  }

  function cardBackMarkup() {
    return `
      <span class="playing-card-back" aria-hidden="true">
        <span class="card-back-medallion">✦</span>
      </span>
    `;
  }

  function renderAll() {
    renderBoard();
    renderTray();
    renderStash();
    renderHud();
    renderTools();
  }

  function renderBoard() {
    elements.board.innerHTML = "";
    const fragment = document.createDocumentFragment();
    const remaining = state.tiles.filter((tile) => !tile.removed);
    const availableCount = remaining.filter((tile) => tileIsAvailable(tile)).length;

    remaining.forEach((tile, index) => {
      const type = getType(tile.type);
      const available = tileIsAvailable(tile);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tile${available ? "" : " is-blocked"}`;
      button.dataset.tileId = tile.id;
      if (available) button.dataset.rank = type.id;
      button.style.left = `${tile.x / 10}%`;
      button.style.top = `${tile.y / 10}%`;
      // A selectable tile is logically on top. Giving it hit-test priority keeps
      // nearby covered tiles from stealing taps when mobile layout rounding makes
      // their rectangular boxes touch by a pixel or two.
      button.style.zIndex = String((available ? 1000 : tile.layer * 100) + index);
      button.setAttribute(
        "aria-label",
        available ? `${type.name}，可以选择` : "牌背，被上层扑克牌压住",
      );
      button.setAttribute("aria-disabled", available ? "false" : "true");
      button.innerHTML = available ? cardFaceMarkup(type, tile.id) : cardBackMarkup();
      if (SUPPORTS_POINTER_EVENTS) {
        button.addEventListener("pointerdown", (event) => {
          if (!event.isPrimary || event.button !== 0) return;
          lastPointerActivation = { tileId: tile.id, time: Date.now() };
          selectBoardTile(tile.id, button);
        });
      }
      button.addEventListener("click", () => {
        // Pointer input is handled on press, before a touch WebView can cancel
        // the click because of hover/active styling. Keep click for keyboards
        // and as a fallback in browsers without Pointer Events.
        const isDuplicatePointerClick =
          SUPPORTS_POINTER_EVENTS &&
          lastPointerActivation.tileId === tile.id &&
          Date.now() - lastPointerActivation.time < 600;
        if (!isDuplicatePointerClick) {
          selectBoardTile(tile.id, button);
        }
      });
      fragment.appendChild(button);
    });

    elements.board.appendChild(fragment);
    if (remaining.length === 0 && state.stash.length > 0) {
      elements.statusText.textContent = "牌面清空了，把临时篮放回来吧";
    } else if (availableCount <= 3 && remaining.length > 3) {
      elements.statusText.textContent = `现在有 ${availableCount} 张牌可以选择`;
    } else {
      elements.statusText.textContent = "选两张同点数的牌即可升级";
    }
  }

  function renderTray(matchingType = "") {
    elements.tray.innerHTML = "";
    elements.tray.classList.toggle("is-danger", state.tray.length >= 6);

    for (let index = 0; index < TRAY_LIMIT; index += 1) {
      const slot = document.createElement("div");
      slot.className = "tray-slot";
      const item = state.tray[index];
      if (item) {
        const type = getType(item.type);
        const tile = document.createElement("div");
        tile.className = `tray-tile${matchingType === item.type ? " is-matching" : ""}`;
        tile.setAttribute("aria-label", type.name);
        tile.innerHTML = cardFaceMarkup(type, item.id);
        slot.appendChild(tile);
      }
      elements.tray.appendChild(slot);
    }
  }

  function renderStash() {
    elements.stashPanel.classList.toggle("has-items", state.stash.length > 0);
    elements.stashSlots.innerHTML = "";

    state.stash.forEach((item) => {
      const type = getType(item.type);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mini-tile";
      button.innerHTML = cardFaceMarkup(type, item.id);
      button.setAttribute("aria-label", `把${type.name}放回收集槽`);
      button.addEventListener("click", () => returnStashedTile(item.id));
      elements.stashSlots.appendChild(button);
    });
  }

  function renderHud() {
    const level = LEVELS[state.levelIndex];
    const total = state.tiles.length;
    const progress = total ? (state.cleared / total) * 100 : 0;
    elements.levelNumber.textContent = `第 ${state.levelIndex + 1} 关 · ${level.subtitle}`;
    elements.levelTitle.textContent = level.title;
    elements.score.textContent = state.score.toLocaleString("zh-CN");
    elements.movesCount.textContent = String(state.moves);
    elements.progressFill.style.width = `${progress}%`;
    elements.progressText.textContent = `${state.cleared} / ${total}`;
  }

  function renderTools() {
    elements.undoCount.textContent = String(state.tools.undo);
    elements.stashCount.textContent = String(state.tools.stash);
    elements.shuffleCount.textContent = String(state.tools.shuffle);
    elements.undoButton.disabled =
      state.tools.undo <= 0 || state.history.length === 0 || state.resolving || state.status !== "playing";
    elements.stashButton.disabled =
      state.tools.stash <= 0 ||
      state.tray.length === 0 ||
      state.stash.length > 0 ||
      state.resolving ||
      state.status !== "playing";
    elements.shuffleButton.disabled =
      state.tools.shuffle <= 0 ||
      state.tiles.every((tile) => tile.removed) ||
      state.resolving ||
      state.status !== "playing";
  }

  function snapshot() {
    return {
      tiles: state.tiles.map((tile) => ({ ...tile })),
      tray: state.tray.map((item) => ({ ...item })),
      stash: state.stash.map((item) => ({ ...item })),
      score: state.score,
      moves: state.moves,
      cleared: state.cleared,
      combo: state.combo,
    };
  }

  function pushHistory() {
    state.history.push(snapshot());
    if (state.history.length > 16) state.history.shift();
  }

  function restoreSnapshot(previous) {
    state.tiles = previous.tiles.map((tile) => ({ ...tile }));
    state.tray = previous.tray.map((item) => ({ ...item }));
    state.stash = previous.stash.map((item) => ({ ...item }));
    state.score = previous.score;
    state.moves = previous.moves;
    state.cleared = previous.cleared;
    state.combo = previous.combo;
  }

  function selectBoardTile(tileId, button) {
    if (state.resolving || state.status !== "playing") return;
    const tile = state.tiles.find((item) => item.id === tileId);
    if (!tile || tile.removed) return;

    clearTimeout(hintTimer);
    if (!tileIsAvailable(tile)) {
      button.classList.remove("is-shaking");
      void button.offsetWidth;
      button.classList.add("is-shaking");
      playBlockedSound();
      showToast("这张牌还没翻开，先拿走上层扑克牌");
      scheduleHint(3800);
      return;
    }

    state.resolving = true;
    pushHistory();
    state.moves += 1;
    state.score += 10;
    button.classList.add("is-removing");
    playSelectSound();
    vibrate(12);

    window.setTimeout(() => {
      tile.removed = true;
      state.cleared += 1;
      state.combo = 0;
      insertTrayItem({ id: tile.id, type: tile.type });
      resolveTray();
    }, 160);
  }

  function insertTrayItem(item) {
    state.tray.push(item);
    state.tray.sort((left, right) => compareRankIds(left.type, right.type));
  }

  function findMergeablePair() {
    for (let rankIndex = 0; rankIndex < CARD_RANKS.length; rankIndex += 1) {
      const rank = CARD_RANKS[rankIndex];
      const matchingItems = state.tray.filter((item) => item.type === rank.id);
      if (matchingItems.length >= 2) {
        return {
          rank,
          nextRank: getNextRank(rank.id),
          itemIds: [matchingItems[0].id, matchingItems[1].id],
        };
      }
    }
    return null;
  }

  function resolveTray() {
    const pair = findMergeablePair();
    renderBoard();
    renderTray(pair?.rank.id || "");
    renderStash();
    renderHud();
    renderTools();

    if (!pair) {
      state.resolving = false;
      renderTools();
      checkEndState();
      scheduleHint();
      return;
    }

    state.combo += 1;
    playMatchSound(state.combo);
    vibrate([18, 24, 18]);

    window.setTimeout(() => {
      const mergedIds = new Set(pair.itemIds);
      state.tray = state.tray.filter((item) => !mergedIds.has(item.id));

      if (pair.nextRank) {
        insertTrayItem({
          id: `merge-${Date.now()}-${state.combo}`,
          type: pair.nextRank.id,
          merged: true,
        });
      } else {
        elements.liveRegion.textContent = "两张大王已消除";
      }

      state.score +=
        100 + pair.rank.value * 35 + state.combo * 90 + (pair.nextRank ? 0 : 800);
      if (state.combo >= 2) showCombo(state.combo);
      renderAll();
      resolveTray();
    }, 360);
  }

  function checkEndState() {
    if (state.status !== "playing") return;

    const boardEmpty = state.tiles.every((tile) => tile.removed);
    if (state.tray.length >= TRAY_LIMIT) {
      state.status = "lost";
      clearTimeout(hintTimer);
      playLoseSound();
      vibrate([80, 50, 100]);
      window.setTimeout(showLoseModal, 280);
      return;
    }

    if (boardEmpty && state.stash.length === 0) {
      state.status = "won";
      clearTimeout(hintTimer);
      state.score += Math.max(0, 1200 - state.moves * 10);
      saveHighScore();
      renderHud();
      window.setTimeout(showWinModal, 500);
      return;
    }
  }

  function undo() {
    if (
      state.resolving ||
      state.status !== "playing" ||
      state.tools.undo <= 0 ||
      state.history.length === 0
    ) {
      showToast("现在没有可以撤回的步骤");
      return;
    }

    const previous = state.history.pop();
    restoreSnapshot(previous);
    state.tools.undo -= 1;
    state.combo = 0;
    playToolSound(420);
    showToast("已回到上一步");
    renderAll();
    scheduleHint();
  }

  function useStash({ rescue = false } = {}) {
    if (
      state.resolving ||
      state.tools.stash <= 0 ||
      state.tray.length === 0 ||
      state.stash.length > 0
    ) {
      showToast("临时篮现在还不能使用");
      return;
    }

    if (!rescue) pushHistory();
    const count = Math.min(3, state.tray.length);
    state.stash = state.tray.splice(-count);
    state.tools.stash -= 1;
    state.combo = 0;
    state.status = "playing";
    closeModal();
    playToolSound(540);
    showToast(`已把 ${count} 张牌放进临时篮`);
    renderAll();
    scheduleHint();
  }

  function returnStashedTile(itemId) {
    if (state.resolving || state.status !== "playing") return;
    if (state.tray.length >= TRAY_LIMIT) {
      showToast("收集槽没有空位了");
      return;
    }

    const itemIndex = state.stash.findIndex((item) => item.id === itemId);
    if (itemIndex < 0) return;
    pushHistory();
    const [item] = state.stash.splice(itemIndex, 1);
    insertTrayItem(item);
    state.moves += 1;
    state.combo = 0;
    state.resolving = true;
    playSelectSound();
    resolveTray();
  }

  function shuffleBoard() {
    if (
      state.resolving ||
      state.status !== "playing" ||
      state.tools.shuffle <= 0
    ) {
      showToast("现在不能洗牌");
      return;
    }

    const remaining = state.tiles.filter((tile) => !tile.removed);
    if (remaining.length === 0) return;
    pushHistory();
    const shuffledTypes = shuffle(remaining.map((tile) => tile.type));
    remaining.forEach((tile, index) => {
      tile.type = shuffledTypes[index];
    });

    improveShuffleForTray(remaining);
    state.tools.shuffle -= 1;
    state.combo = 0;
    playToolSound(660);
    showToast("剩余牌的点数已重新排列");
    renderAll();
    scheduleHint();
  }

  function improveShuffleForTray(remaining) {
    const available = remaining.filter((tile) => tileIsAvailable(tile));
    const trayCounts = {};
    state.tray.forEach((item) => {
      trayCounts[item.type] = (trayCounts[item.type] || 0) + 1;
    });
    const wanted = Object.entries(trayCounts)
      .sort((a, b) => b[1] - a[1])
      .find(([type]) => remaining.some((tile) => tile.type === type));
    if (!wanted || available.some((tile) => tile.type === wanted[0])) return;

    const source = remaining.find((tile) => tile.type === wanted[0]);
    const target = available[0];
    if (source && target) [source.type, target.type] = [target.type, source.type];
  }

  function getHintTile() {
    const available = state.tiles.filter((tile) => tileIsAvailable(tile));
    if (available.length === 0) return null;
    const trayCounts = {};
    state.tray.forEach((item) => {
      trayCounts[item.type] = (trayCounts[item.type] || 0) + 1;
    });

    return (
      available
        .filter((tile) => trayCounts[tile.type] === 1)
        .sort((a, b) => a.safeRank - b.safeRank)[0] ||
      [...available].sort((a, b) => a.safeRank - b.safeRank)[0]
    );
  }

  function scheduleHint(delay = 7000) {
    clearTimeout(hintTimer);
    if (state.status !== "playing" || state.resolving) return;
    hintTimer = window.setTimeout(() => {
      const tile = getHintTile();
      if (!tile) return;
      const button = elements.board.querySelector(`[data-tile-id="${tile.id}"]`);
      if (button) {
        button.classList.add("is-hinting");
        elements.statusText.textContent = "闪动的扑克牌是个不错的选择";
      }
    }, delay);
  }

  function showCombo(combo) {
    elements.comboNumber.textContent = String(combo);
    elements.comboBadge.classList.remove("is-showing");
    void elements.comboBadge.offsetWidth;
    elements.comboBadge.classList.add("is-showing");
    elements.liveRegion.textContent = `${combo} 次连续合并`;
  }

  function showIntroModal() {
    setModal({
      kicker: "欢迎来到",
      title: "王牌叠叠合",
      description: "点击翻开的扑克牌，牌背表示仍被压住。相同点数不分花色，可在收集槽中连续进位。",
      illustration: ["2", "2", "3"],
      rules: [
        ["1", "只选最上层"],
        ["2", "同点数升级"],
        ["7", "槽满则失败"],
      ],
      primaryText: "开始叠叠合",
      primary: () => {
        closeModal();
        state.status = "playing";
        renderTools();
        playToolSound(580);
        scheduleHint();
      },
      closable: false,
    });
  }

  function showHelpModal() {
    setModal({
      kicker: "玩法说明",
      title: "同点数，向上合",
      description:
        "牌背暂时不可选；翻开后按 2、3、4、5、6、7、8、9、10、J、Q、K、A、小王、大王升级。花色不影响合并，两张大王会消除。",
      illustration: ["K", "A", "王"],
      rules: [
        ["2+2", "合成 3"],
        ["K+K", "合成 A"],
        ["大王×2", "直接消除"],
      ],
      primaryText: "知道了",
      primary: closeModal,
      closable: true,
    });
  }

  function showWinModal() {
    launchConfetti();
    playWinSound();
    const isLast = state.levelIndex === LEVELS.length - 1;
    const highScore = Number(localStorage.getItem(`${STORAGE_PREFIX}high-score`) || "0");
    const trayResult =
      state.tray.map((item) => getType(item.type).label).join(" · ") || "全部消除";
    setModal({
      kicker: isLast ? "王牌合成师" : "关卡完成",
      title: isLast ? "大牌之路完成！" : "牌面清空啦！",
      description: isLast
        ? `你走完了全部三关。最终槽位：${trayResult}。最高分 ${highScore.toLocaleString("zh-CN")}。`
        : `用了 ${state.moves} 步，得到 ${state.score.toLocaleString("zh-CN")} 分。最终槽位：${trayResult}。`,
      illustration: ["2", "→", "A"],
      rules: [
        [String(state.moves), "本关步数"],
        [String(state.cleared), "收集牌数"],
        [String(state.score), "累计得分"],
      ],
      primaryText: isLast ? "再玩一轮" : "进入下一关",
      primary: () => {
        closeModal();
        const nextLevel = isLast ? 0 : state.levelIndex + 1;
        startLevel(nextLevel, { keepScore: !isLast });
      },
      secondaryText: "重玩本关",
      secondary: () => {
        closeModal();
        startLevel(state.levelIndex);
      },
      closable: false,
    });
  }

  function showLoseModal() {
    const canRescue = state.tools.stash > 0 && state.stash.length === 0;
    setModal({
      kicker: "差一点点",
      title: "收集槽装满啦",
      description: canRescue
        ? "别急，临时篮还能移出三张牌，给收集槽腾出位置。"
        : "留意槽内已有点数，优先拿走能立刻合并或触发连续进位的牌。",
      illustration: ["7", "格", "满"],
      rules: [
        [String(state.moves), "本局步数"],
        [String(state.cleared), "已经收集"],
        [String(TRAY_LIMIT), "槽位上限"],
      ],
      primaryText: canRescue ? "使用临时篮继续" : "再试一次",
      primary: canRescue
        ? () => useStash({ rescue: true })
        : () => {
            closeModal();
            startLevel(state.levelIndex);
          },
      secondaryText: canRescue ? "重新挑战本关" : "",
      secondary: canRescue
        ? () => {
            closeModal();
            startLevel(state.levelIndex);
          }
        : null,
      closable: false,
    });
  }

  function showRestartModal() {
    setModal({
      kicker: "重新开始",
      title: "要重置本关吗？",
      description: "当前牌面和本关得分会重置，道具数量也会恢复。",
      illustration: ["2", "↺", "3"],
      rules: [
        ["↺", "重置牌面"],
        ["3", "恢复撤回"],
        ["2", "恢复洗牌"],
      ],
      primaryText: "重新开始",
      primary: () => {
        closeModal();
        startLevel(state.levelIndex);
      },
      secondaryText: "继续当前游戏",
      secondary: closeModal,
      closable: true,
    });
  }

  function setModal({
    kicker,
    title,
    description,
    illustration,
    rules,
    primaryText,
    primary,
    secondaryText = "",
    secondary = null,
    closable = true,
  }) {
    elements.modalKicker.textContent = kicker;
    elements.modalTitle.textContent = title;
    elements.modalDescription.textContent = description;
    elements.modalIllustration.innerHTML = illustration.map((item) => `<span>${item}</span>`).join("");
    elements.modalRules.innerHTML = rules
      .map(([value, label]) => `<div><b>${value}</b><span>${label}</span></div>`)
      .join("");
    elements.modalPrimary.textContent = primaryText;
    elements.modalSecondary.textContent = secondaryText;
    elements.modalSecondary.classList.toggle("is-visible", Boolean(secondary && secondaryText));
    elements.modalClose.style.display = closable ? "grid" : "none";
    primaryAction = primary;
    secondaryAction = secondary;
    elements.modal.classList.add("is-visible");
    requestAnimationFrame(() => elements.modalPrimary.focus());
  }

  function closeModal() {
    elements.modal.classList.remove("is-visible");
    primaryAction = null;
    secondaryAction = null;
    if (state.status === "playing") scheduleHint();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.remove("is-showing");
    void elements.toast.offsetWidth;
    elements.toast.classList.add("is-showing");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-showing"), 1950);
  }

  function saveHighScore() {
    const previous = Number(localStorage.getItem(`${STORAGE_PREFIX}high-score`) || "0");
    if (state.score > previous) {
      localStorage.setItem(`${STORAGE_PREFIX}high-score`, String(state.score));
    }
  }

  function toggleSound() {
    state.sound = !state.sound;
    localStorage.setItem(`${STORAGE_PREFIX}sound`, state.sound ? "on" : "off");
    updateSoundButton();
    if (state.sound) playToolSound(520);
  }

  function updateSoundButton() {
    elements.soundButton.classList.toggle("is-muted", !state.sound);
    elements.soundButton.querySelector("span").textContent = state.sound ? "♪" : "×";
    elements.soundButton.setAttribute("aria-label", state.sound ? "关闭声音" : "打开声音");
  }

  function getAudioContext() {
    if (!state.sound) return null;
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function playTone(frequency, duration = 0.08, type = "sine", delay = 0, volume = 0.045) {
    const context = getAudioContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  function playSelectSound() {
    playTone(520, 0.07, "sine", 0, 0.035);
    playTone(680, 0.06, "sine", 0.045, 0.025);
  }

  function playBlockedSound() {
    playTone(180, 0.09, "triangle", 0, 0.025);
  }

  function playToolSound(base) {
    playTone(base, 0.1, "triangle", 0, 0.035);
    playTone(base * 1.25, 0.11, "triangle", 0.08, 0.028);
  }

  function playMatchSound(combo) {
    const base = 620 + Math.min(combo, 4) * 50;
    playTone(base, 0.12, "sine", 0, 0.045);
    playTone(base * 1.25, 0.12, "sine", 0.08, 0.04);
    playTone(base * 1.5, 0.15, "sine", 0.16, 0.035);
  }

  function playLoseSound() {
    playTone(330, 0.2, "triangle", 0, 0.035);
    playTone(250, 0.25, "triangle", 0.16, 0.03);
  }

  function playWinSound() {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      playTone(frequency, 0.2, "sine", index * 0.09, 0.04);
    });
  }

  function vibrate(pattern) {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  }

  function launchConfetti() {
    elements.confettiLayer.innerHTML = "";
    const colors = ["#7baa60", "#f0a15e", "#e98577", "#f4cf65", "#8bb8c7"];
    for (let index = 0; index < 46; index += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[index % colors.length];
      piece.style.setProperty("--drift", `${Math.round(Math.random() * 180 - 90)}px`);
      piece.style.setProperty("--fall-time", `${2.2 + Math.random() * 1.6}s`);
      piece.style.animationDelay = `${Math.random() * 0.45}s`;
      elements.confettiLayer.appendChild(piece);
    }
    window.setTimeout(() => {
      elements.confettiLayer.innerHTML = "";
    }, 4500);
  }

  elements.undoButton.addEventListener("click", undo);
  elements.stashButton.addEventListener("click", () => useStash());
  elements.shuffleButton.addEventListener("click", shuffleBoard);
  elements.restartButton.addEventListener("click", showRestartModal);
  elements.soundButton.addEventListener("click", toggleSound);
  elements.helpButton.addEventListener("click", showHelpModal);
  elements.modalPrimary.addEventListener("click", () => {
    if (primaryAction) primaryAction();
  });
  elements.modalSecondary.addEventListener("click", () => {
    if (secondaryAction) secondaryAction();
  });
  elements.modalClose.addEventListener("click", closeModal);
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal && elements.modalClose.style.display !== "none") {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.modalClose.style.display !== "none") closeModal();
    if (elements.modal.classList.contains("is-visible")) return;
    if (event.key.toLowerCase() === "u") undo();
    if (event.key.toLowerCase() === "s") shuffleBoard();
    if (event.key.toLowerCase() === "b") useStash();
  });

  buildSolvableTiles(state.levelIndex);
  renderAll();
  updateSoundButton();
  showIntroModal();
})();
