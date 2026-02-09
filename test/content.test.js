const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  createClock,
  createChromeMock,
  createContext,
  createDom,
  loadScript,
  rootPath,
} = require("./test-helpers");

function loadContent({ dom, chrome, clock }) {
  const context = createContext({ dom, chrome, clock });
  loadScript(rootPath("content.js"), context);
  return { context, hooks: context.__IRHT_TEST_HOOKS__.content, chrome };
}

test("content activity tracking", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const clock = createClock(1000);
  const chrome = createChromeMock();
  const { hooks, context } = loadContent({ dom, chrome, clock });

  Object.defineProperty(context.document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  context.document.hasFocus = () => true;

  hooks.initContent();

  const messages = chrome._sentMessages;

  hooks.setLastSentAt(clock.now() - hooks.ACTIVITY_THROTTLE_MS - 1);
  hooks.sendActivity("mousemove");
  hooks.sendActivity("mousemove");
  hooks.sendActivity("mousemove");
  hooks.flushBatch();
  hooks.getLastSentAt();

  clock.advance(hooks.ACTIVITY_THROTTLE_MS + 1);
  hooks.sendActivity("keydown");
  hooks.flushBatch();

  Object.defineProperty(context.document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  context.document.dispatchEvent(new context.window.Event("visibilitychange"));

  Object.defineProperty(context.document, "visibilityState", {
    value: "hidden",
    configurable: true,
  });
  context.document.dispatchEvent(new context.window.Event("visibilitychange"));

  context.window.dispatchEvent(new context.window.Event("scroll"));
  hooks.flushBatch();

  const beforeHidden = hooks.getLastSentAt();
  Object.defineProperty(context.document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  context.document.hasFocus = () => false;
  hooks.sendActivity("mousemove");
  hooks.flushBatch();
  assert.equal(hooks.getLastSentAt(), beforeHidden);

  context.document.hasFocus = undefined;
  Object.defineProperty(context.document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  hooks.setLastSentAt(clock.now() - hooks.ACTIVITY_THROTTLE_MS - 1);
  hooks.sendActivity("mousemove");
  hooks.flushBatch();

  hooks.setLastSentAt(clock.now());
  hooks.sendActivity("keydown");
  hooks.sendActivity("keydown");
  hooks.flushBatch();
  hooks.setLastSentAt(clock.now());
  hooks.sendActivity();
  hooks.flushBatch();

  assert.ok(messages.length >= 2);
});

test("content sendActivity skips without runtime", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const clock = createClock(20000);
  const context = createContext({ dom, clock });
  loadScript(rootPath("content.js"), context);
  const hooks = context.__IRHT_TEST_HOOKS__.content;

  const baseline = clock.now() - hooks.ACTIVITY_THROTTLE_MS - 1;
  hooks.setLastSentAt(baseline);
  Object.defineProperty(context.document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  hooks.sendActivity("keydown");

  assert.equal(hooks.getLastSentAt(), baseline);
});

test("content sendActivity handles sendMessage errors", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const clock = createClock(20000);
  const chrome = createChromeMock({
    onSendMessage: () => {
      throw new Error("boom");
    },
  });
  const { hooks } = loadContent({ dom, chrome, clock });

  const baseline = clock.now() - hooks.ACTIVITY_THROTTLE_MS - 1;
  hooks.setLastSentAt(baseline);
  hooks.sendActivity("keydown");

  assert.equal(hooks.getLastSentAt(), baseline);
});

test("content auto init branch", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const chrome = createChromeMock();
  const context = createContext({
    dom,
    chrome,
    extraGlobals: { __IRHT_TEST__: false },
  });
  loadScript(rootPath("content.js"), context);
});

test("content test hooks init branch", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const chrome = createChromeMock();
  const context = createContext({
    dom,
    chrome,
    extraGlobals: { __IRHT_TEST_HOOKS__: undefined },
  });
  loadScript(rootPath("content.js"), context);
  assert.ok(context.__IRHT_TEST_HOOKS__.content);
});

test("content flushBatch uses pending timestamp fallback", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const clock = createClock(0);
  const chrome = createChromeMock();
  const { hooks, context } = loadContent({ dom, chrome, clock });

  Object.defineProperty(context.document, "visibilityState", {
    value: "visible",
    configurable: true,
  });

  hooks.setLastSentAt(clock.now());
  hooks.sendActivity("keydown");
  hooks.flushBatch();
});

test("content adaptive throttle branches", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const clock = createClock(10000);
  const chrome = createChromeMock();
  const { hooks, context } = loadContent({ dom, chrome, clock });

  Object.defineProperty(context.document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  context.document.hasFocus = () => true;

  hooks.setLastSentAt(clock.now() - hooks.ACTIVITY_THROTTLE_MS * 2);
  hooks.sendActivity();

  hooks.setLastSentAt(clock.now());
  hooks.sendActivity("keydown");
  hooks.sendActivity("scroll");
  hooks.sendActivity("visibility");

  hooks.sendActivity("mousedown");
  hooks.sendActivity("custom-event");

  hooks.setLastSentAt(clock.now() - hooks.ACTIVITY_THROTTLE_MS * 2);
  hooks.sendActivity("custom-event");

  hooks.setLastSentAt(clock.now());
  hooks.sendActivity("custom-event");
});

test("content high-frequency gated by focus and batch timer fires", () => {
  const dom = createDom("<!doctype html><html><body></body></html>");
  const clock = createClock(5000);
  const chrome = createChromeMock();
  const context = createContext({
    dom,
    chrome,
    clock,
    extraGlobals: {
      setTimeout: (cb) => {
        cb();
        return 1;
      },
      clearTimeout: () => {},
    },
  });
  loadScript(rootPath("content.js"), context);
  const hooks = context.__IRHT_TEST_HOOKS__.content;

  Object.defineProperty(context.document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  context.document.hasFocus = () => false;

  const before = hooks.getLastSentAt();
  hooks.sendActivity("scroll");
  hooks.flushBatch();
  assert.equal(hooks.getLastSentAt(), before);

  context.document.hasFocus = () => true;
  hooks.setLastSentAt(clock.now());
  hooks.sendActivity("scroll");
});
