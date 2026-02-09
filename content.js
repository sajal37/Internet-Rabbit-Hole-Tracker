const ACTIVITY_THROTTLE_MS = 10000;
const ACTIVITY_THROTTLE_FAST_MS = 2500;
const ACTIVITY_THROTTLE_MED_MS = 7000;
const ACTIVITY_THROTTLE_SLOW_MS = 14000;
const ACTIVITY_BATCH_MS = 250;
const HIGH_FREQUENCY_EVENTS = new Set([
  "scroll",
  "wheel",
  "pointerdown",
]);
const TYPING_EVENTS = new Set(["keydown", "mousedown", "pointerdown", "touchstart"]);
const READING_EVENTS = new Set(["scroll", "wheel"]);
const IS_TEST =
  typeof globalThis !== "undefined" && globalThis.__IRHT_TEST__ === true;

let lastSentAt = 0;
let batchTimer = null;
let pendingActivity = null;
let pendingTimestamp = 0;
let lastActivityType = null;

function canSendHighFrequency() {
  if (document.visibilityState !== "visible") {
    return false;
  }
  if (typeof document.hasFocus === "function" && !document.hasFocus()) {
    return false;
  }
  return true;
}

function flushBatch() {
  if (!pendingActivity) {
    return;
  }
  const type = pendingActivity;
  const timestamp = pendingTimestamp || Date.now();
  pendingActivity = null;
  pendingTimestamp = 0;
  sendActivityNow(type, timestamp);
}

function sendActivityNow(type, timestamp) {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.sendMessage) {
    return;
  }
  try {
    runtime.sendMessage({
      type: "user_activity",
      activityType: type,
      ts: timestamp,
    });
  } catch (error) {
    return;
  }
  lastSentAt = timestamp;
}

function getAdaptiveThrottleMs(type, timestamp) {
  if (!type) {
    return ACTIVITY_THROTTLE_MS;
  }
  if (TYPING_EVENTS.has(type)) {
    return ACTIVITY_THROTTLE_FAST_MS;
  }
  if (READING_EVENTS.has(type)) {
    return ACTIVITY_THROTTLE_SLOW_MS;
  }
  if (type === "visibility") {
    return ACTIVITY_THROTTLE_FAST_MS;
  }
  if (lastActivityType && lastActivityType !== type) {
    return ACTIVITY_THROTTLE_MED_MS;
  }
  if (timestamp - lastSentAt > ACTIVITY_THROTTLE_MS * 1.5) {
    return ACTIVITY_THROTTLE_MS;
  }
  return ACTIVITY_THROTTLE_MED_MS;
}

function sendActivity(type) {
  if (HIGH_FREQUENCY_EVENTS.has(type) && !canSendHighFrequency()) {
    return;
  }
  const timestamp = Date.now();
  const throttleMs = getAdaptiveThrottleMs(type, timestamp);
  if (timestamp - lastSentAt >= throttleMs) {
    sendActivityNow(type, timestamp);
    lastActivityType = type || null;
    return;
  }
  pendingActivity = "active";
  pendingTimestamp = timestamp;
  lastActivityType = type || null;
  if (batchTimer) {
    return;
  }
  batchTimer = setTimeout(() => {
    batchTimer = null;
    flushBatch();
  }, ACTIVITY_BATCH_MS);
}

function initContent() {
  [
    "mousedown",
    "keydown",
    "scroll",
    "touchstart",
    "pointerdown",
    "wheel",
  ].forEach((eventName) => {
    window.addEventListener(
      eventName,
      () => {
        sendActivity(eventName);
      },
      { passive: true, capture: true },
    );
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sendActivity("visibility");
    }
  });
}

if (!IS_TEST) {
  initContent();
} else {
  globalThis.__IRHT_TEST_HOOKS__ = globalThis.__IRHT_TEST_HOOKS__ || {};
  globalThis.__IRHT_TEST_HOOKS__.content = {
    ACTIVITY_THROTTLE_MS,
    ACTIVITY_BATCH_MS,
    initContent,
    sendActivity,
    getLastSentAt: () => lastSentAt,
    setLastSentAt: (value) => {
      lastSentAt = value;
    },
    flushBatch,
  };
}
