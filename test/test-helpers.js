const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const crypto = require("node:crypto");

function createClock(start = 1000000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
    set: (value) => {
      current = value;
    }
  };
}

function createEvent() {
  const listeners = [];
  return {
    addListener: (fn) => {
      listeners.push(fn);
    },
    emit: (...args) => {
      listeners.forEach((fn) => fn(...args));
    },
    get listeners() {
      return listeners;
    }
  };
}

function buildGetResult(store, key) {
  if (key === null || key === undefined) {
    return { ...store };
  }
  if (Array.isArray(key)) {
    const result = {};
    key.forEach((entry) => {
      result[entry] = store[entry];
    });
    return result;
  }
  if (typeof key === "string") {
    return { [key]: store[key] };
  }
  if (typeof key === "object") {
    const result = {};
    Object.keys(key).forEach((entry) => {
      result[entry] = store[entry] === undefined ? key[entry] : store[entry];
    });
    return result;
  }
  return {};
}

function createChromeMock(options = {}) {
  const storageData = {
    local: { ...(options.localData || {}) },
    sync: { ...(options.syncData || {}) }
  };
  const storageChanged = createEvent();
  const runtimeMessage = createEvent();
  const runtimeConnect = createEvent();
  const idleChanged = createEvent();
  const alarmEvent = createEvent();
  const tabsActivated = createEvent();
  const tabsUpdated = createEvent();
  const tabsRemoved = createEvent();
  const tabsCreated = createEvent();
  const windowFocusChanged = createEvent();
  const webNavCommitted = createEvent();
  const webNavHistory = createEvent();
  const webNavCreatedTarget = createEvent();
  const webNavFragment = createEvent();

  const tabsById = new Map();
  let activeTabId = options.activeTabId || null;
  let lastFocusedWindowId = options.lastFocusedWindowId ?? 1;
  let idleState = options.idleState || "active";
  let idleInterval = null;
  let lastAlarm = null;
  const sentMessages = [];

  function notifyStorage(area, payload) {
    const changes = {};
    Object.entries(payload).forEach(([key, value]) => {
      changes[key] = { oldValue: storageData[area][key], newValue: value };
    });
    storageChanged.emit(changes, area);
  }

  function setTabs(list) {
    tabsById.clear();
    list.forEach((tab) => {
      tabsById.set(tab.id, { ...tab });
    });
  }

  if (options.tabs) {
    setTabs(options.tabs);
  }

  return {
    _storage: storageData,
    _sentMessages: sentMessages,
    _events: {
      storageChanged,
      runtimeMessage,
      runtimeConnect,
      idleChanged,
      alarmEvent,
      tabsActivated,
      tabsUpdated,
      tabsRemoved,
      tabsCreated,
      windowFocusChanged,
      webNavCommitted,
      webNavHistory,
      webNavCreatedTarget,
      webNavFragment
    },
    setTabs,
    setActiveTabId: (id) => {
      activeTabId = id;
    },
    setLastFocusedWindowId: (id) => {
      lastFocusedWindowId = id;
    },
    setIdleState: (state) => {
      idleState = state;
    },
    storage: {
      local: {
        get: (key, cb) => cb(buildGetResult(storageData.local, key)),
        set: (payload, cb) => {
          notifyStorage("local", payload);
          Object.assign(storageData.local, payload);
          if (cb) {
            cb();
          }
        }
      },
      sync: {
        get: (key, cb) => cb(buildGetResult(storageData.sync, key)),
        set: (payload, cb) => {
          notifyStorage("sync", payload);
          Object.assign(storageData.sync, payload);
          if (cb) {
            cb();
          }
        }
      },
      onChanged: {
        addListener: (fn) => storageChanged.addListener(fn)
      }
    },
    tabs: {
      onActivated: { addListener: (fn) => tabsActivated.addListener(fn) },
      onUpdated: { addListener: (fn) => tabsUpdated.addListener(fn) },
      onRemoved: { addListener: (fn) => tabsRemoved.addListener(fn) },
      onCreated: { addListener: (fn) => tabsCreated.addListener(fn) },
      query: (queryInfo, cb) => {
        if (queryInfo && queryInfo.active && queryInfo.lastFocusedWindow) {
          const tab = activeTabId ? tabsById.get(activeTabId) : null;
          cb(tab ? [tab] : []);
          return;
        }
        cb(Array.from(tabsById.values()));
      },
      get: (tabId, cb) => cb(tabsById.get(tabId)),
      create: (payload) => {
        sentMessages.push({ type: "tab_create", payload });
      }
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: { addListener: (fn) => windowFocusChanged.addListener(fn) },
      getLastFocused: (cb) => cb({ id: lastFocusedWindowId })
    },
    idle: {
      onStateChanged: { addListener: (fn) => idleChanged.addListener(fn) },
      queryState: (interval, cb) => cb(idleState),
      setDetectionInterval: (interval) => {
        idleInterval = interval;
      },
      get _interval() {
        return idleInterval;
      }
    },
    alarms: {
      onAlarm: { addListener: (fn) => alarmEvent.addListener(fn) },
      create: (name, info) => {
        lastAlarm = { name, info };
      },
      get _lastAlarm() {
        return lastAlarm;
      }
    },
    webNavigation: {
      onCommitted: { addListener: (fn) => webNavCommitted.addListener(fn) },
      onHistoryStateUpdated: { addListener: (fn) => webNavHistory.addListener(fn) },
      onCreatedNavigationTarget: { addListener: (fn) => webNavCreatedTarget.addListener(fn) },
      onReferenceFragmentUpdated: { addListener: (fn) => webNavFragment.addListener(fn) }
    },
    runtime: {
      onMessage: { addListener: (fn) => runtimeMessage.addListener(fn) },
      onConnect: { addListener: (fn) => runtimeConnect.addListener(fn) },
      sendMessage: (message, cb) => {
        sentMessages.push(message);
        if (typeof options.onSendMessage === "function") {
          options.onSendMessage(message, cb);
          return;
        }
        if (cb) {
          cb();
        }
      },
      openOptionsPage: options.openOptionsPage,
      getURL: (pathValue) => `chrome-extension://test/${pathValue}`,
      lastError: null
    }
  };
}

function createDom(html) {
  return new JSDOM(html, { url: "https://example.com" });
}

function createCanvasStub(canvas) {
  canvas.getBoundingClientRect = () => ({
    width: 640,
    height: 480,
    left: 0,
    top: 0
  });
  canvas.getContext = () => ({
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    lineCap: "",
    strokeStyle: "",
    lineWidth: 0,
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fillStyle: "",
    arc: () => {},
    fill: () => {},
    font: "",
    fillText: () => {},
    setTransform: () => {},
    scale: () => {}
  });
  return canvas;
}

function createContext({ chrome, dom, clock, extraGlobals = {} } = {}) {
  const unrefTimer = (timer) => {
    if (timer && typeof timer.unref === "function") {
      timer.unref();
    }
    return timer;
  };
  const wrappedSetTimeout = (...args) => unrefTimer(setTimeout(...args));
  const wrappedSetInterval = (...args) => unrefTimer(setInterval(...args));
  const context = {
    console,
    setTimeout: wrappedSetTimeout,
    clearTimeout,
    setInterval: wrappedSetInterval,
    clearInterval,
    requestAnimationFrame: (cb) => wrappedSetTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    crypto,
    URL,
    Math,
    __IRHT_TEST__: true,
    __IRHT_TEST_HOOKS__: {},
    ...extraGlobals
  };

  if (clock) {
    class DateShim extends Date {}
    DateShim.now = () => clock.now();
    DateShim.parse = Date.parse;
    DateShim.UTC = Date.UTC;
    context.Date = DateShim;
  } else {
    context.Date = Date;
  }

  if (dom) {
    context.window = dom.window;
    context.document = dom.window.document;
    context.localStorage = dom.window.localStorage;
    context.navigator = dom.window.navigator;
    dom.window.requestAnimationFrame = context.requestAnimationFrame;
    dom.window.cancelAnimationFrame = context.cancelAnimationFrame;
    dom.window.devicePixelRatio = 1;
  }

  if (chrome) {
    context.chrome = chrome;
    if (context.window) {
      context.window.chrome = chrome;
    }
  }

  context.globalThis = context;
  return vm.createContext(context);
}

function loadScript(filePath, context) {
  const code = fs.readFileSync(filePath, "utf8");
  const script = new vm.Script(code, { filename: filePath });
  script.runInContext(context);
  return context;
}

function loadHtmlFixture(fixturePath) {
  return fs.readFileSync(fixturePath, "utf8");
}

function rootPath(...parts) {
  return path.join(__dirname, "..", ...parts);
}

module.exports = {
  createClock,
  createChromeMock,
  createContext,
  createDom,
  createCanvasStub,
  loadScript,
  loadHtmlFixture,
  rootPath
};
