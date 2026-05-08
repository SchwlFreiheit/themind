import QRCode from "qrcode";
import {
  ChevronLeft,
  Copy,
  Minus,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  Share2,
  Sparkles,
  Smartphone,
  Tablet,
  Undo2,
  createIcons,
} from "lucide";
import "./styles.css";

const ICONS = {
  ChevronLeft,
  Copy,
  Minus,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  Share2,
  Sparkles,
  Smartphone,
  Tablet,
  Undo2,
};

const app = document.querySelector("#app");
const CARD_MAX = 100;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const DEFAULT_PLAYERS = 4;
const DEFAULT_CARDS = 2;
const DEFAULT_THEME = "plain";
const SEED_LENGTH = 8;
const SEED_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PLAYER_COLOR_PALETTES = {
  plain: ["#d85c4a", "#2f8173", "#d7a93d", "#5b6fa8", "#ad5c85", "#557244"],
  mind: ["#5aa7ff", "#24d3b5", "#f1c85d", "#a889ff", "#ff7e9f", "#62e6ff"],
};
const BROWSER_THEME_COLORS = {
  plain: "#f7f2e8",
  mind: "#02040c",
};
const HOST_REVEAL_COOLDOWN_MS = 500;
const LOCAL_JOIN_ORIGIN_HINT = "http://192.168.0.17:5173/";
const THEMES = [
  { id: "plain", label: "プレーン" },
  { id: "mind", label: "マインド" },
];

let lastHostRevealAt = 0;

const state = {
  route: "home",
  role: null,
  host: {
    phase: "setup",
    players: DEFAULT_PLAYERS,
    cards: DEFAULT_CARDS,
    seed: randomSeed(),
    index: 0,
    joinOrigin: getDefaultJoinOrigin(),
    theme: DEFAULT_THEME,
  },
  player: {
    phase: "setup",
    players: DEFAULT_PLAYERS,
    cards: DEFAULT_CARDS,
    seed: "",
    playerNo: 1,
    played: 0,
    revealedCard: null,
    theme: DEFAULT_THEME,
  },
};

const stored = readStoredState();
if (stored) {
  Object.assign(state.host, stored.host || {});
  Object.assign(state.player, stored.player || {});
}
if (!state.host.joinOrigin) state.host.joinOrigin = getDefaultJoinOrigin();
if (!state.host.seed || normalizeSeed(state.host.seed).length < SEED_LENGTH) state.host.seed = randomSeed();
state.host.theme = normalizeTheme(state.host.theme);
state.player.theme = normalizeTheme(state.player.theme);

window.addEventListener("hashchange", applyRouteFromHash);
applyRouteFromHash();
registerServiceWorker();
preventDoubleTapZoom();

function applyRouteFromHash() {
  const { route, params } = parseHash();
  if (route === "host") {
    state.route = "host";
    state.role = "host";
    if (params.players) state.host.players = clamp(Number(params.players), MIN_PLAYERS, MAX_PLAYERS);
    if (params.cards) state.host.cards = clamp(Number(params.cards), 1, maxCardsFor(state.host.players));
    if (params.seed) state.host.seed = normalizeSeed(params.seed) || state.host.seed;
    if (params.origin) state.host.joinOrigin = params.origin;
    if (params.theme) state.host.theme = normalizeTheme(params.theme);
    if (["setup", "sync", "play", "success", "complete", "failed"].includes(params.phase)) state.host.phase = params.phase;
    if (params.index) state.host.index = clamp(Number(params.index), 0, state.host.players * state.host.cards);
    if (!state.host.phase) state.host.phase = "sync";
  } else if (route === "player") {
    state.route = "player";
    state.role = "player";
    if (params.players) state.player.players = clamp(Number(params.players), MIN_PLAYERS, MAX_PLAYERS);
    if (params.cards) state.player.cards = clamp(Number(params.cards), 1, maxCardsFor(state.player.players));
    if (params.seed) state.player.seed = normalizeSeed(params.seed);
    if (params.player) state.player.playerNo = clamp(Number(params.player), 1, state.player.players);
    if (params.theme) state.player.theme = normalizeTheme(params.theme);
    if (["setup", "play", "show", "complete"].includes(params.phase)) {
      state.player.phase = params.phase;
    } else if (state.player.seed) {
      state.player.phase = "setup";
    }
  } else {
    state.route = "home";
    state.role = null;
  }
  persistState();
  render();
}

function render() {
  app.innerHTML = "";
  setActiveTheme(getActiveTheme());
  if (state.route === "host") {
    renderHost();
  } else if (state.route === "player") {
    renderPlayer();
  } else {
    renderHome();
  }
  createIcons({ icons: ICONS });
  bindActions({
    home: () => navigate(""),
  });
}

function renderHome() {
  app.innerHTML = `
    <section class="home-shell">
      <div class="brand-lockup">
        <div class="mini-card">42</div>
        <div>
          <p class="eyebrow">Mind Hand</p>
          <h1>数字だけで遊ぶ</h1>
        </div>
      </div>
      <div class="role-grid">
        <button class="role-card" data-action="go-host">
          <i data-lucide="tablet"></i>
          <span>親機</span>
        </button>
        <button class="role-card" data-action="go-player">
          <i data-lucide="smartphone"></i>
          <span>子機</span>
        </button>
      </div>
    </section>
  `;
  bindActions({
    "go-host": () => navigate("host"),
    "go-player": () => navigate("player"),
  });
}

function renderHost() {
  if (state.host.phase === "play") {
    renderHostPlay();
  } else if (state.host.phase === "complete") {
    renderHostReview("成功", "complete");
  } else if (state.host.phase === "failed") {
    renderHostReview("失敗", "failed");
  } else if (state.host.phase === "success") {
    renderHostSuccess();
  } else if (state.host.phase === "sync") {
    renderHostSync();
  } else {
    renderHostSetup();
  }
}

function renderHostSetup() {
  state.host.cards = clamp(state.host.cards, 1, maxCardsFor(state.host.players));
  const checksum = makeChecksum(state.host);
  app.innerHTML = `
    <section class="setup-shell">
      ${topBar("親機", "home")}
      <div class="setup-panel">
        <label class="field-label">プレイヤー数</label>
        ${segmented("host-players", range(MIN_PLAYERS, MAX_PLAYERS), state.host.players)}
        <label class="field-label">手札枚数</label>
        ${stepper("host-cards", state.host.cards, 1, maxCardsFor(state.host.players))}
        <label class="field-label">デザイン</label>
        ${themeSelector("host-theme", state.host.theme)}
        <label class="field-label">合言葉</label>
        <div class="seed-row">
          <output class="seed-code">${formatSeed(state.host.seed)}</output>
          <button class="icon-button" data-action="host-random" aria-label="合言葉を作る">
            <i data-lucide="refresh-cw"></i>
          </button>
        </div>
        <div class="check-strip">
          <span>確認コード</span>
          <strong>${checksum}</strong>
        </div>
      </div>
      <div class="bottom-actions">
        <button class="primary-button" data-action="host-sync">
          <i data-lucide="qr-code"></i>
          <span>公開</span>
        </button>
      </div>
    </section>
  `;
  bindCommonHostSetup();
  bindActions({
    "host-random": () => {
      state.host.seed = randomSeed();
      persistState();
      render();
    },
    "host-sync": () => {
      state.host.phase = "sync";
      state.host.index = 0;
      persistState();
      render();
    },
  });
}

function renderHostSync() {
  const settings = currentHostSettings();
  const joinUrl = makePlayerUrl(settings);
  const joinOrigin = getJoinOrigin();
  app.innerHTML = `
    <section class="sync-shell">
      ${topBar("合言葉", "host-setup")}
      <div class="sync-layout">
        <div class="qr-card">
          <canvas id="join-qr" aria-label="子機用QR"></canvas>
        </div>
        <div class="sync-facts">
          <div>
            <span>人数</span>
            <strong>${settings.players}</strong>
          </div>
          <div>
            <span>枚数</span>
            <strong>${settings.cards}</strong>
          </div>
          <div>
            <span>確認コード</span>
            <strong>${makeChecksum(settings)}</strong>
          </div>
          <div>
            <span>デザイン</span>
            <strong class="theme-fact-value">${getThemeLabel(settings.theme)}</strong>
          </div>
        </div>
        <div class="sync-theme-row">
          ${themeSelector("host-theme-sync", state.host.theme)}
        </div>
        <details class="join-details">
          <summary>QRの接続先</summary>
          <label class="field-label origin-label" for="join-origin-input">URL</label>
          <input id="join-origin-input" class="origin-input" value="${escapeHtml(joinOrigin)}" inputmode="url" autocomplete="off" spellcheck="false" />
          <output id="join-url-output" class="join-url-output">${escapeHtml(joinUrl)}</output>
        </details>
        <output class="seed-code seed-code-large">${formatSeed(settings.seed)}</output>
        <div class="link-actions">
          <button class="secondary-button" data-action="copy-link">
            <i data-lucide="copy"></i>
            <span>コピー</span>
          </button>
          <button class="secondary-button" data-action="share-link">
            <i data-lucide="share-2"></i>
            <span>共有</span>
          </button>
        </div>
      </div>
      <div class="bottom-actions">
        <button class="primary-button" data-action="host-start">
          <i data-lucide="play"></i>
          <span>開始</span>
        </button>
      </div>
    </section>
  `;
  const canvas = document.querySelector("#join-qr");
  QRCode.toCanvas(canvas, joinUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 260,
    color: { dark: "#25211b", light: "#fffaf0" },
  });
  const originInput = document.querySelector("#join-origin-input");
  originInput.addEventListener("input", () => {
    state.host.joinOrigin = originInput.value.trim();
    persistState();
    updateJoinArtifacts(settings);
  });
  originInput.addEventListener("change", () => {
    state.host.joinOrigin = normalizeOriginInput(originInput.value);
    originInput.value = getJoinOrigin();
    persistState();
    updateJoinArtifacts(settings);
  });
  document.querySelectorAll("[data-segment='host-theme-sync']").forEach((button) => {
    button.addEventListener("click", () => {
      state.host.theme = normalizeTheme(button.dataset.value);
      persistState();
      render();
    });
  });
  bindActions({
    "host-setup": () => {
      state.host.phase = "setup";
      persistState();
      render();
    },
    "host-start": () => {
      state.host.phase = "play";
      state.host.index = 0;
      lastHostRevealAt = 0;
      persistState();
      render();
    },
    "copy-link": async () => copyText(makePlayerUrl(currentHostSettings())),
    "share-link": async () => shareText(makePlayerUrl(currentHostSettings())),
  });
}

function renderHostPlay() {
  const settings = currentHostSettings();
  const { sequence } = deal(settings);
  const current = sequence[state.host.index - 1];
  const remainingCounts = getRemainingCounts(sequence, state.host.index, settings.players, settings.cards);
  const isDone = state.host.index >= sequence.length;
  if (isDone) {
    state.host.phase = "success";
    persistState();
    render();
    return;
  }
  app.innerHTML = `
    <section class="host-play-shell">
      <header class="play-top">
        <button class="icon-button" data-action="host-sync-view" aria-label="合言葉">
          <i data-lucide="qr-code"></i>
        </button>
        <div class="play-meter">
          <span>${state.host.index}</span>
          <div class="meter-track">
            <div style="width:${(state.host.index / sequence.length) * 100}%"></div>
          </div>
          <span>${sequence.length}</span>
        </div>
        <button class="danger-button" data-action="host-fail">失敗</button>
      </header>
      <button class="reveal-stage ${current ? "has-card" : ""}" data-action="host-reveal">
        ${
          current
            ? `<span class="owner-pill" style="--player-color:${getPlayerColor(current.player)}">P${current.player}</span><strong>${current.value}</strong>`
            : `<span class="focus-word">MIND</span>`
        }
      </button>
      <div class="pile-strip">
        ${sequence
          .slice(Math.max(0, state.host.index - 9), state.host.index)
          .map((card) => `<span style="--player-color:${getPlayerColor(card.player)}">${card.value}</span>`)
          .join("")}
      </div>
      <div class="remaining-grid">
        ${remainingCounts
          .map(
            (count, index) => `
              <div style="--player-color:${getPlayerColor(index + 1)}">
                <span>P${index + 1}</span>
                <strong>${count}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
  bindActions({
    "host-reveal": () => {
      revealHostCard();
    },
    "host-fail": () => {
      state.host.phase = "failed";
      persistState();
      render();
    },
    "host-sync-view": () => {
      state.host.phase = "sync";
      persistState();
      render();
    },
  });
}

function renderHostSuccess() {
  const settings = currentHostSettings();
  const { sequence } = deal(settings);
  const lastCard = sequence[Math.max(0, Math.min(state.host.index, sequence.length) - 1)];
  const isMindTheme = normalizeTheme(settings.theme) === "mind";
  app.innerHTML = `
    <section class="success-shell">
      ${
        isMindTheme
          ? `<div class="success-aura" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
            </div>
            <div class="success-cipher" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>`
          : ""
      }
      <div class="success-card" style="--player-color:${getPlayerColor(lastCard?.player || 1, settings.theme)}">
        <span>P${lastCard?.player || "-"}</span>
        <strong>${lastCard?.value || "-"}</strong>
      </div>
      ${
        isMindTheme
          ? `<div class="success-message mind-success-mark"><p>THE MIND</p></div>`
          : `<div class="success-message plain-success-mark"><h1>成功</h1></div>`
      }
      <div class="bottom-actions">
        <button class="primary-button" data-action="host-review">
          <i data-lucide="sparkles"></i>
          <span>振り返りへ</span>
        </button>
      </div>
    </section>
  `;
  bindActions({
    "host-review": () => {
      state.host.phase = "complete";
      persistState();
      render();
    },
  });
}

function renderHostReview(title, tone) {
  const settings = currentHostSettings();
  const { sequence } = deal(settings);
  const shownCards = sequence.slice(0, state.host.index);
  app.innerHTML = `
    <section class="review-shell ${tone}">
      <header class="review-top">
        <h1>${title}</h1>
        <span>${shownCards.length}/${sequence.length}</span>
      </header>
      <div class="review-sequence">
        ${
          shownCards.length
            ? shownCards
                .map(
                  (card, index) => `
                    <article class="review-card" style="--player-color:${getPlayerColor(card.player)}">
                      <span>${index + 1}</span>
                      <strong>${card.value}</strong>
                      <em>P${card.player}</em>
                    </article>
                  `
                )
                .join("")
            : `<div class="empty-review">まだカードなし</div>`
        }
      </div>
      <div class="bottom-actions">
        <button class="primary-button" data-action="host-next">
          <i data-lucide="refresh-cw"></i>
          <span>次のゲーム</span>
        </button>
      </div>
    </section>
  `;
  bindActions({
    "host-next": () => {
      advanceHostGame();
      render();
    },
  });
}

function renderPlayer() {
  if (state.player.phase === "play") {
    renderPlayerPlay();
  } else if (state.player.phase === "show") {
    renderPlayerShow();
  } else if (state.player.phase === "complete") {
    renderPlayerComplete();
  } else {
    renderPlayerSetup();
  }
}

function renderPlayerSetup() {
  state.player.cards = clamp(state.player.cards, 1, maxCardsFor(state.player.players));
  state.player.playerNo = clamp(state.player.playerNo, 1, state.player.players);
  const seed = state.player.seed;
  const checksum = seed ? makeChecksum(currentPlayerSettings()) : "--";
  app.innerHTML = `
    <section class="setup-shell player-setup">
      ${topBar("子機", "home")}
      <div class="setup-panel">
        <label class="field-label">プレイヤー</label>
        ${segmented("player-no", range(1, state.player.players), state.player.playerNo, "P")}
        <label class="field-label">プレイヤー数</label>
        ${segmented("player-players", range(MIN_PLAYERS, MAX_PLAYERS), state.player.players)}
        <label class="field-label">手札枚数</label>
        ${stepper("player-cards", state.player.cards, 1, maxCardsFor(state.player.players))}
        <label class="field-label">デザイン</label>
        ${themeSelector("player-theme", state.player.theme)}
        <label class="field-label" for="seed-input">合言葉</label>
        <input id="seed-input" class="seed-input" value="${escapeHtml(formatSeed(seed))}" inputmode="latin" autocomplete="off" spellcheck="false" />
        <div class="check-strip">
          <span>確認コード</span>
          <strong id="player-checksum">${checksum}</strong>
        </div>
      </div>
      <div class="bottom-actions">
        <button id="player-start-button" class="primary-button" data-action="player-start" ${seed ? "" : "disabled"}>
          <i data-lucide="play"></i>
          <span>開始</span>
        </button>
      </div>
    </section>
  `;
  bindPlayerSetup();
}

function renderPlayerPlay() {
  const settings = currentPlayerSettings();
  const { hands } = deal(settings);
  const hand = hands[state.player.playerNo - 1] || [];
  const remaining = hand.slice(state.player.played);
  const nextCard = remaining[0];

  if (!nextCard) {
    state.player.phase = "complete";
    persistState();
    render();
    return;
  }

  app.innerHTML = `
    <section class="player-play-shell" style="--player-color:${getPlayerColor(state.player.playerNo)}">
      <header class="player-top">
        <button class="icon-button" data-action="player-setup-back" aria-label="設定">
          <i data-lucide="settings"></i>
        </button>
        <strong>P${state.player.playerNo}</strong>
        <span>${state.player.played}/${hand.length}</span>
      </header>
      <button class="next-card" data-action="player-show">
        <span>次</span>
        <strong>${nextCard}</strong>
      </button>
      <div class="hand-row">
        ${remaining.map((card, index) => `<span class="${index === 0 ? "ready" : ""}">${card}</span>`).join("")}
      </div>
    </section>
  `;
  bindActions({
    "player-show": () => {
      state.player.revealedCard = nextCard;
      state.player.played += 1;
      state.player.phase = "show";
      persistState();
      render();
    },
    "player-setup-back": () => {
      state.player.phase = "setup";
      persistState();
      render();
    },
  });
}

function renderPlayerShow() {
  app.innerHTML = `
    <section class="show-shell" style="--player-color:${getPlayerColor(state.player.playerNo)}">
      <button class="show-card" data-action="player-return">
        <span>P${state.player.playerNo}</span>
        <strong>${state.player.revealedCard}</strong>
      </button>
      <button class="undo-button" data-action="player-undo">
        <i data-lucide="undo-2"></i>
        <span>戻す</span>
      </button>
    </section>
  `;
  bindActions({
    "player-return": () => {
      state.player.phase = "play";
      state.player.revealedCard = null;
      persistState();
      render();
    },
    "player-undo": () => {
      state.player.played = Math.max(0, state.player.played - 1);
      state.player.revealedCard = null;
      state.player.phase = "play";
      persistState();
      render();
    },
  });
}

function renderPlayerComplete() {
  app.innerHTML = `
    <section class="end-shell complete">
      <h1>出し切り</h1>
      <div class="bottom-actions">
        <button class="primary-button" data-action="player-next">
          <i data-lucide="refresh-cw"></i>
          <span>次のゲーム</span>
        </button>
      </div>
    </section>
  `;
  bindActions({
    "player-next": () => {
      advancePlayerGame();
      render();
    },
  });
}

function bindCommonHostSetup() {
  document.querySelectorAll("[data-segment='host-players']").forEach((button) => {
    button.addEventListener("click", () => {
      state.host.players = Number(button.dataset.value);
      state.host.cards = clamp(state.host.cards, 1, maxCardsFor(state.host.players));
      persistState();
      render();
    });
  });
  bindStepper("host-cards", (value) => {
    state.host.cards = value;
    persistState();
    render();
  });
  document.querySelectorAll("[data-segment='host-theme']").forEach((button) => {
    button.addEventListener("click", () => {
      state.host.theme = normalizeTheme(button.dataset.value);
      persistState();
      render();
    });
  });
}

function bindPlayerSetup() {
  document.querySelectorAll("[data-segment='player-no']").forEach((button) => {
    button.addEventListener("click", () => {
      state.player.playerNo = Number(button.dataset.value);
      persistState();
      render();
    });
  });
  document.querySelectorAll("[data-segment='player-players']").forEach((button) => {
    button.addEventListener("click", () => {
      state.player.players = Number(button.dataset.value);
      state.player.playerNo = clamp(state.player.playerNo, 1, state.player.players);
      state.player.cards = clamp(state.player.cards, 1, maxCardsFor(state.player.players));
      persistState();
      render();
    });
  });
  bindStepper("player-cards", (value) => {
    state.player.cards = value;
    persistState();
    render();
  });
  document.querySelectorAll("[data-segment='player-theme']").forEach((button) => {
    button.addEventListener("click", () => {
      state.player.theme = normalizeTheme(button.dataset.value);
      persistState();
      render();
    });
  });
  const seedInput = document.querySelector("#seed-input");
  seedInput.addEventListener("input", () => {
    const cleanSeed = normalizeSeed(seedInput.value);
    state.player.seed = cleanSeed;
    seedInput.value = formatSeed(cleanSeed);
    document.querySelector("#player-checksum").textContent = cleanSeed ? makeChecksum(currentPlayerSettings()) : "--";
    document.querySelector("#player-start-button").disabled = !cleanSeed;
    persistState();
  });
  bindActions({
    "player-start": () => {
      state.player.played = 0;
      state.player.revealedCard = null;
      state.player.phase = "play";
      persistState();
      render();
    },
  });
}

function bindActions(map) {
  Object.entries(map).forEach(([action, handler]) => {
    document.querySelectorAll(`[data-action="${action}"]`).forEach((element) => {
      element.addEventListener("click", handler);
    });
  });
}

function bindStepper(name, onChange) {
  document.querySelectorAll(`[data-stepper="${name}"]`).forEach((button) => {
    button.addEventListener("click", () => {
      const next = Number(button.dataset.next);
      onChange(next);
    });
  });
}

function currentHostSettings() {
  return {
    players: state.host.players,
    cards: state.host.cards,
    seed: state.host.seed,
    theme: normalizeTheme(state.host.theme),
  };
}

function currentPlayerSettings() {
  return {
    players: state.player.players,
    cards: state.player.cards,
    seed: state.player.seed,
    theme: normalizeTheme(state.player.theme),
  };
}

function advanceHostGame() {
  state.host.seed = randomSeed();
  state.host.index = 0;
  state.host.phase = "sync";
  lastHostRevealAt = 0;
  persistState();
}

function advancePlayerGame() {
  state.player.seed = "";
  state.player.played = 0;
  state.player.revealedCard = null;
  state.player.phase = "setup";
  persistState();
}

function deal(settings) {
  const deck = Array.from({ length: CARD_MAX }, (_, index) => index + 1);
  const rng = createRng(`${settings.seed}|${settings.players}|${settings.cards}|deal`);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  const hands = Array.from({ length: settings.players }, () => []);
  for (let cardIndex = 0; cardIndex < settings.cards * settings.players; cardIndex += 1) {
    hands[cardIndex % settings.players].push(deck[cardIndex]);
  }

  hands.forEach((hand) => hand.sort((a, b) => a - b));
  const sequence = hands
    .flatMap((hand, playerIndex) => hand.map((value) => ({ value, player: playerIndex + 1 })))
    .sort((a, b) => a.value - b.value);

  return { hands, sequence };
}

function getRemainingCounts(sequence, revealedCount, players, cardsPerPlayer) {
  const counts = Array.from({ length: players }, () => cardsPerPlayer);
  sequence.slice(0, revealedCount).forEach((card) => {
    counts[card.player - 1] = Math.max(0, counts[card.player - 1] - 1);
  });
  return counts;
}

function parseHash() {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return { route: "home", params: {} };
  const [route, query = ""] = raw.split("?");
  const params = Object.fromEntries(new URLSearchParams(query));
  return { route, params };
}

function navigate(route) {
  if (!route) {
    window.location.hash = "";
    applyRouteFromHash();
    return;
  }
  window.location.hash = route;
}

function getActiveTheme() {
  if (state.route === "player") return normalizeTheme(state.player.theme);
  if (state.route === "host") return normalizeTheme(state.host.theme);
  return normalizeTheme(state.host.theme);
}

function setActiveTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
  app.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", BROWSER_THEME_COLORS[theme] || BROWSER_THEME_COLORS.plain);
}

function normalizeTheme(theme) {
  return THEMES.some((item) => item.id === theme) ? theme : DEFAULT_THEME;
}

function getThemeLabel(theme) {
  return THEMES.find((item) => item.id === normalizeTheme(theme))?.label || THEMES[0].label;
}

function getPlayerColor(playerNo, theme = getActiveTheme()) {
  const palette = PLAYER_COLOR_PALETTES[normalizeTheme(theme)] || PLAYER_COLOR_PALETTES.plain;
  return palette[(Math.max(1, playerNo) - 1) % palette.length];
}

function makePlayerUrl(settings) {
  const url = new URL(getJoinOrigin());
  url.hash = `player?players=${settings.players}&cards=${settings.cards}&seed=${encodeURIComponent(settings.seed)}&theme=${encodeURIComponent(normalizeTheme(settings.theme))}`;
  return url.toString();
}

function getJoinOrigin() {
  return normalizeOriginInput(state.host.joinOrigin || getDefaultJoinOrigin());
}

function getDefaultJoinOrigin() {
  if (isLoopbackHost(window.location.hostname)) return LOCAL_JOIN_ORIGIN_HINT;
  return getCurrentAppBaseUrl();
}

function normalizeOriginInput(value = "") {
  const raw = String(value).trim();
  const fallback = isLoopbackHost(window.location.hostname) ? LOCAL_JOIN_ORIGIN_HINT : getCurrentAppBaseUrl();
  if (!raw) return fallback;

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withProtocol);
    url.hash = "";
    url.search = "";
    url.pathname = normalizeBasePath(url.pathname);
    return url.toString();
  } catch {
    return fallback;
  }
}

function getCurrentAppBaseUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.pathname = normalizeBasePath(url.pathname);
  return url.toString();
}

function normalizeBasePath(pathname) {
  if (pathname.endsWith("/")) return pathname;
  if (/\.[^/]+$/.test(pathname)) return pathname.replace(/[^/]+$/, "");
  return `${pathname}/`;
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function updateJoinArtifacts(settings) {
  const joinUrl = makePlayerUrl(settings);
  const output = document.querySelector("#join-url-output");
  const canvas = document.querySelector("#join-qr");
  if (output) output.textContent = joinUrl;
  if (canvas) {
    QRCode.toCanvas(canvas, joinUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 260,
      color: { dark: "#25211b", light: "#fffaf0" },
    });
  }
}

function revealHostCard() {
  const now = performance.now();
  if (now - lastHostRevealAt < HOST_REVEAL_COOLDOWN_MS) return;
  lastHostRevealAt = now;
  state.host.index += 1;
  persistState();
  render();
}

function topBar(title, backAction) {
  return `
    <header class="top-bar">
      <button class="icon-button" data-action="${backAction}" aria-label="戻る">
        <i data-lucide="chevron-left"></i>
      </button>
      <strong>${title}</strong>
      <span></span>
    </header>
  `;
}

function segmented(name, values, current, prefix = "") {
  return `
    <div class="segmented">
      ${values
        .map(
          (value) => `
            <button data-segment="${name}" data-value="${value}" class="${value === current ? "active" : ""}">
              ${prefix}${value}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function themeSelector(name, current) {
  return `
    <div class="segmented theme-segmented">
      ${THEMES.map(
        (theme) => `
          <button data-segment="${name}" data-value="${theme.id}" class="${theme.id === normalizeTheme(current) ? "active" : ""}">
            ${theme.label}
          </button>
        `
      ).join("")}
    </div>
  `;
}

function stepper(name, value, min, max) {
  return `
    <div class="stepper">
      <button data-stepper="${name}" data-next="${Math.max(min, value - 1)}" ${value <= min ? "disabled" : ""} aria-label="減らす">
        <i data-lucide="minus"></i>
      </button>
      <output>${value}</output>
      <button data-stepper="${name}" data-next="${Math.min(max, value + 1)}" ${value >= max ? "disabled" : ""} aria-label="増やす">
        <i data-lucide="plus"></i>
      </button>
    </div>
  `;
}

function randomSeed() {
  const bytes = new Uint8Array(SEED_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => SEED_CHARS[byte % SEED_CHARS.length]).join("");
}

function normalizeSeed(value = "") {
  return value
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .replace(/[IO01]/g, "")
    .slice(0, SEED_LENGTH);
}

function formatSeed(seed = "") {
  const clean = normalizeSeed(seed);
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

function makeChecksum(settings) {
  const hash = hashString(`${settings.seed}|${settings.players}|${settings.cards}|check`);
  const first = SEED_CHARS[hash % SEED_CHARS.length];
  const second = SEED_CHARS[Math.floor(hash / SEED_CHARS.length) % SEED_CHARS.length];
  return `${first}${second}`;
}

function createRng(input) {
  return sfc32(...hash128(input));
}

function hash128(input) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function sfc32(a, b, c, d) {
  return function rng() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t / 4294967296;
  };
}

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function rng() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function maxCardsFor(players) {
  return Math.floor(CARD_MAX / players);
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

async function shareText(text) {
  if (navigator.share) {
    await navigator.share({ title: "Mind Hand", text, url: text });
  } else {
    await copyText(text);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function persistState() {
  localStorage.setItem(
    "mind-hand-state",
    JSON.stringify({
      host: state.host,
      player: state.player,
    })
  );
}

function readStoredState() {
  try {
    return JSON.parse(localStorage.getItem("mind-hand-state") || "null");
  } catch {
    return null;
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      const swUrl = new URL("sw.js", window.location.href);
      navigator.serviceWorker.register(swUrl, { scope: "./" }).catch(() => {});
    });
  }
}

function preventDoubleTapZoom() {
  let lastTouchEndAt = 0;
  document.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();
      if (now - lastTouchEndAt < 350) {
        event.preventDefault();
      }
      lastTouchEndAt = now;
    },
    { passive: false }
  );
}
