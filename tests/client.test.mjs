import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const CLIENT_JS_PATH = path.resolve(import.meta.dirname, "..", "lib", "client.js");
const CLIENT_SRC = fs.readFileSync(CLIENT_JS_PATH, "utf8");

// --- 轻量级高保真 Mock DOM 沙箱（零外部依赖，可精确验证 DOM/事件/Observer/定时器零残留） ---

function splitTopLevel(str, sepChar) {
  const parts = [];
  let depthParen = 0;
  let depthBracket = 0;
  let quote = null;
  let cur = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      cur += ch;
      if (ch === quote && str[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(") depthParen++;
    else if (ch === ")") depthParen--;
    else if (ch === "[") depthBracket++;
    else if (ch === "]") depthBracket--;
    if (ch === sepChar && depthParen === 0 && depthBracket === 0) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function matchSimpleSelector(el, sel, scopeEl) {
  if (!el || el.nodeType !== 1) return false;
  let s = sel.trim();
  if (!s || s === "*") return true;
  if (s === ":scope") return el === scopeEl;

  // 提取 :not(...)
  const notGroups = [];
  s = s.replace(/:not\(([^()]+)\)/g, (_, inner) => {
    notGroups.push(inner.trim());
    return "";
  });

  // 提取伪类 :hover / :focus-visible / :disabled
  const pseudos = [];
  s = s.replace(/:(hover|focus-visible|disabled)\b/g, (_, p) => {
    pseudos.push(p);
    return "";
  });

  // 提取属性选择器 [attr...]
  const attrs = [];
  s = s.replace(/\[([^\]]+)\]/g, (_, inner) => {
    attrs.push(inner.trim());
    return "";
  });

  // 提取 #id 和 .class 以及标签名
  let idMatch = null;
  s = s.replace(/#([A-Za-z0-9_-]+)/g, (_, id) => {
    idMatch = id;
    return "";
  });
  const classes = [];
  s = s.replace(/\.([A-Za-z0-9_-]+)/g, (_, cls) => {
    classes.push(cls);
    return "";
  });
  const tag = s.trim();

  if (tag && tag !== "*" && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  if (idMatch !== null && el.id !== idMatch) return false;
  for (const c of classes) {
    if (!el.classList.contains(c)) return false;
  }

  for (const a of attrs) {
    const m = /^([A-Za-z0-9_:-]+)(?:\s*([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))(?:\s+([iI]))?)?$/.exec(a);
    if (!m) return false;
    const [, name, op, dq, sq, bare, flag] = m;
    if (!el.hasAttribute(name)) return false;
    if (op) {
      let actual = el.getAttribute(name) ?? "";
      let expected = dq ?? sq ?? bare ?? "";
      if (flag && flag.toLowerCase() === "i") {
        actual = actual.toLowerCase();
        expected = expected.toLowerCase();
      }
      if (op === "=" && actual !== expected) return false;
      if (op === "*=" && !actual.includes(expected)) return false;
      if (op === "^=" && !actual.startsWith(expected)) return false;
      if (op === "$=" && !actual.endsWith(expected)) return false;
      if (op === "~=" && !actual.split(/\s+/).includes(expected)) return false;
    }
  }

  for (const p of pseudos) {
    if (p === "hover" && !el.__hover) return false;
    if (p === "focus-visible" && !el.__focusVisible) return false;
    if (p === "disabled" && !el.disabled) return false;
  }

  for (const ng of notGroups) {
    if (matchSelectorList(el, ng, scopeEl)) return false;
  }
  return true;
}

function tokenizeComplex(sel) {
  const tokens = [];
  let cur = "";
  let depthParen = 0;
  let depthBracket = 0;
  let quote = null;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (quote) {
      cur += ch;
      if (ch === quote && sel[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(") depthParen++;
    else if (ch === ")") depthParen--;
    else if (ch === "[") depthBracket++;
    else if (ch === "]") depthBracket--;

    if (depthParen === 0 && depthBracket === 0 && (ch === ">" || /\s/.test(ch))) {
      if (cur.trim()) {
        tokens.push({ type: "sel", value: cur.trim() });
        cur = "";
      }
      if (ch === ">") {
        if (tokens.length && tokens[tokens.length - 1].type === "comb") {
          tokens[tokens.length - 1].value = ">";
        } else {
          tokens.push({ type: "comb", value: ">" });
        }
      } else if (tokens.length && tokens[tokens.length - 1].type !== "comb") {
        tokens.push({ type: "comb", value: " " });
      }
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) tokens.push({ type: "sel", value: cur.trim() });
  while (tokens.length && tokens[tokens.length - 1].type === "comb") tokens.pop();
  return tokens;
}

function matchComplex(el, tokens, idx, scopeEl) {
  const tok = tokens[idx];
  if (!tok || tok.type !== "sel") return false;
  if (!matchSimpleSelector(el, tok.value, scopeEl)) return false;
  if (idx === 0) return true;
  const comb = tokens[idx - 1];
  if (!comb || comb.type !== "comb") return false;
  if (comb.value === ">") {
    return Boolean(el.parentElement && matchComplex(el.parentElement, tokens, idx - 2, scopeEl));
  }
  let p = el.parentElement;
  while (p) {
    if (matchComplex(p, tokens, idx - 2, scopeEl)) return true;
    p = p.parentElement;
  }
  return false;
}

function matchSelectorList(el, selector, scopeEl = null) {
  const parts = splitTopLevel(selector, ",");
  for (const part of parts) {
    const tokens = tokenizeComplex(part);
    if (tokens.length && matchComplex(el, tokens, tokens.length - 1, scopeEl)) return true;
  }
  return false;
}

class MockStyle {
  constructor() {
    this._map = new Map();
    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === "cssText") return target._toCssText();
        const k = String(prop).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
        return target._map.get(k)?.value ?? "";
      },
      set(target, prop, value) {
        if (prop === "cssText") {
          target._map.clear();
          String(value || "").split(";").forEach((decl) => {
            const idx = decl.indexOf(":");
            if (idx > 0) {
              const k = decl.slice(0, idx).trim();
              const v = decl.slice(idx + 1).trim();
              target._map.set(k, { value: v, priority: "" });
            }
          });
          return true;
        }
        const k = String(prop).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
        if (value === "" || value === null || value === undefined) target._map.delete(k);
        else target._map.set(k, { value: String(value), priority: "" });
        return true;
      }
    });
  }
  setProperty(name, value, priority = "") {
    this._map.set(name, { value: String(value), priority });
  }
  getPropertyValue(name) {
    return this._map.get(name)?.value ?? "";
  }
  getPropertyPriority(name) {
    return this._map.get(name)?.priority ?? "";
  }
  removeProperty(name) {
    const prev = this._map.get(name)?.value ?? "";
    this._map.delete(name);
    return prev;
  }
  _toCssText() {
    return Array.from(this._map.entries())
      .map(([k, v]) => `${k}:${v.value}${v.priority ? " !" + v.priority : ""}`)
      .join(";");
  }
}

class MockNode {
  constructor(ownerDocument, nodeType) {
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
    this.parentElement = null;
    this.childNodes = [];
  }
  get isConnected() {
    let cur = this;
    while (cur) {
      if (cur === this.ownerDocument.documentElement) return true;
      cur = cur.parentElement;
    }
    return false;
  }
  remove() {
    if (!this.parentElement) return;
    const p = this.parentElement;
    const idx = p.childNodes.indexOf(this);
    if (idx >= 0) p.childNodes.splice(idx, 1);
    this.parentElement = null;
    this.ownerDocument._notifyMutation({ type: "childList", target: p, addedNodes: [], removedNodes: [this] });
  }
}

class MockText extends MockNode {
  constructor(doc, value) {
    super(doc, 3);
    this.nodeValue = String(value);
  }
  get textContent() { return this.nodeValue; }
  set textContent(v) { this.nodeValue = String(v); }
}

class MockElement extends MockNode {
  constructor(doc, tagName) {
    super(doc, 1);
    this.tagName = String(tagName).toUpperCase();
    this._attrs = new Map();
    this.style = new MockStyle();
    this._listeners = [];
    this.disabled = false;
    this.__hover = false;
    this.__focusVisible = false;
    this._rect = { left: 6, top: 100, right: 42, bottom: 136, width: 36, height: 36 };
    this.scrollTop = 0;
    this.scrollHeight = 100;
    this.clientHeight = 100;
    this.offsetWidth = 80;
    this.offsetHeight = 24;
    this.offsetLeft = 0;
    this.classList = {
      add: (...cls) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        let changed = false;
        for (const c of cls) if (c && !set.has(c)) { set.add(c); changed = true; }
        if (changed) this.className = Array.from(set).join(" ");
      },
      remove: (...cls) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        let changed = false;
        for (const c of cls) if (set.delete(c)) changed = true;
        if (changed) this.className = Array.from(set).join(" ");
      },
      contains: (c) => this.className.split(/\s+/).filter(Boolean).includes(c),
      toggle: (c, force) => {
        const has = this.classList.contains(c);
        const next = force !== undefined ? Boolean(force) : !has;
        if (next) this.classList.add(c);
        else this.classList.remove(c);
        return next;
      },
      [Symbol.iterator]: () => this.className.split(/\s+/).filter(Boolean)[Symbol.iterator]()
    };
  }
  get id() { return this._attrs.get("id") ?? ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this._attrs.get("class") ?? ""; }
  set className(v) { this.setAttribute("class", v); }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get src() { return this._attrs.get("src") ?? ""; }
  set src(v) { this.setAttribute("src", v); }

  get textContent() {
    return this.childNodes.map((n) => n.textContent).join("");
  }
  set textContent(v) {
    this.childNodes.forEach((n) => { n.parentElement = null; });
    this.childNodes = [];
    if (v !== "" && v !== null && v !== undefined) {
      const t = new MockText(this.ownerDocument, v);
      t.parentElement = this;
      this.childNodes.push(t);
    }
  }
  get innerHTML() {
    return this.childNodes.map((n) => (n.nodeType === 3 ? n.nodeValue : n.outerHTML)).join("");
  }
  set innerHTML(html) {
    this.childNodes.forEach((n) => { n.parentElement = null; });
    this.childNodes = [];
    const raw = String(html || "");
    if (!raw) return;
    // 简易 HTML/SVG 解析器，足以还原 icon SVG、badge span 等结构
    const stack = [this];
    const tokenRe = /<(\/)?([A-Za-z0-9_-]+)([^>]*)>|([^<]+)/g;
    let m;
    while ((m = tokenRe.exec(raw))) {
      const [, isClose, tag, attrStr, text] = m;
      const top = stack[stack.length - 1];
      if (text) {
        const tn = new MockText(this.ownerDocument, text);
        tn.parentElement = top;
        top.childNodes.push(tn);
      } else if (isClose) {
        if (stack.length > 1) stack.pop();
      } else {
        const selfClose = attrStr.trim().endsWith("/");
        const el = this.ownerDocument.createElement(tag);
        const attrRe = /([A-Za-z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
        let am;
        while ((am = attrRe.exec(attrStr))) {
          if (am[1] === "/") continue;
          el._attrs.set(am[1], am[2] ?? am[3] ?? "");
        }
        el.parentElement = top;
        top.childNodes.push(el);
        if (!selfClose && !["img", "input", "br", "hr"].includes(tag.toLowerCase())) {
          stack.push(el);
        }
      }
    }
  }
  get outerHTML() {
    const tag = this.tagName.toLowerCase();
    const attrs = Array.from(this._attrs.entries()).map(([k, v]) => ` ${k}="${v}"`).join("");
    return `<${tag}${attrs}>${this.innerHTML}</${tag}>`;
  }

  getAttribute(name) { return this._attrs.has(name) ? this._attrs.get(name) : null; }
  hasAttribute(name) { return this._attrs.has(name); }
  setAttribute(name, val) {
    const prev = this._attrs.get(name);
    const next = String(val);
    this._attrs.set(name, next);
    if (prev !== next) {
      this.ownerDocument._notifyMutation({ type: "attributes", target: this, attributeName: name });
    }
  }
  removeAttribute(name) {
    if (this._attrs.has(name)) {
      this._attrs.delete(name);
      this.ownerDocument._notifyMutation({ type: "attributes", target: this, attributeName: name });
    }
  }
  toggleAttribute(name, force) {
    const next = force !== undefined ? Boolean(force) : !this.hasAttribute(name);
    if (next) this.setAttribute(name, "");
    else this.removeAttribute(name);
    return next;
  }

  appendChild(node) {
    if (node.parentElement) node.remove();
    node.parentElement = this;
    this.childNodes.push(node);
    this.ownerDocument._notifyMutation({ type: "childList", target: this, addedNodes: [node], removedNodes: [] });
    return node;
  }
  insertBefore(node, refNode) {
    if (!refNode) return this.appendChild(node);
    if (node.parentElement) node.remove();
    const idx = this.childNodes.indexOf(refNode);
    node.parentElement = this;
    if (idx >= 0) this.childNodes.splice(idx, 0, node);
    else this.childNodes.push(node);
    this.ownerDocument._notifyMutation({ type: "childList", target: this, addedNodes: [node], removedNodes: [] });
    return node;
  }
  contains(other) {
    let cur = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }
  matches(sel) {
    return matchSelectorList(this, sel, this);
  }
  closest(sel) {
    let cur = this;
    while (cur) {
      if (cur.nodeType === 1 && cur.matches(sel)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  querySelectorAll(sel) {
    const res = [];
    const walk = (n) => {
      for (const c of n.children) {
        if (matchSelectorList(c, sel, this)) res.push(c);
        walk(c);
      }
    };
    walk(this);
    return res;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  getBoundingClientRect() {
    return { ...this._rect };
  }
  scrollIntoView() {}
  scrollTo() {}
  focus() {
    this.ownerDocument.activeElement = this;
    this.dispatchEvent({ type: "focusin", bubbles: true, target: this });
  }
  addEventListener(type, fn, opts) {
    const capture = typeof opts === "boolean" ? opts : Boolean(opts?.capture);
    this._listeners.push({ type, fn, capture });
  }
  removeEventListener(type, fn, opts) {
    const capture = typeof opts === "boolean" ? opts : Boolean(opts?.capture);
    this._listeners = this._listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === capture));
  }
  dispatchEvent(ev) {
    const event = {
      type: ev.type,
      target: ev.target || this,
      relatedTarget: ev.relatedTarget ?? null,
      pointerType: ev.pointerType ?? "mouse",
      pointerId: ev.pointerId ?? 1,
      clientX: ev.clientX ?? 0,
      clientY: ev.clientY ?? 0,
      button: ev.button ?? 0,
      buttons: ev.buttons ?? 0,
      key: ev.key ?? "",
      altKey: Boolean(ev.altKey),
      ctrlKey: Boolean(ev.ctrlKey),
      metaKey: Boolean(ev.metaKey),
      shiftKey: Boolean(ev.shiftKey),
      isComposing: Boolean(ev.isComposing),
      repeat: Boolean(ev.repeat),
      defaultPrevented: false,
      _stopped: false,
      _immediateStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this._stopped = true; },
      stopImmediatePropagation() { this._stopped = true; this._immediateStopped = true; }
    };
    const pathNodes = [];
    let cur = this;
    while (cur) {
      pathNodes.push(cur);
      cur = cur.parentElement;
    }
    pathNodes.push(this.ownerDocument);
    pathNodes.push(this.ownerDocument.defaultView);
    const reversed = [...pathNodes].reverse();

    // Capture phase
    for (const node of reversed) {
      if (event._stopped) break;
      const list = [...(node._listeners || [])];
      for (const l of list) {
        if (event._immediateStopped) break;
        if (l.type === event.type && l.capture) {
          l.fn.call(node, event);
        }
      }
    }
    // Bubble phase
    const bubbleChain = ev.bubbles === false ? [this] : pathNodes;
    for (const node of bubbleChain) {
      if (event._stopped) break;
      const list = [...(node._listeners || [])];
      for (const l of list) {
        if (event._immediateStopped) break;
        if (l.type === event.type && !l.capture) {
          l.fn.call(node, event);
        }
      }
    }
    return !event.defaultPrevented;
  }
  click() {
    this.dispatchEvent({ type: "click", bubbles: true });
  }
}

function createTestEnv(options = {}) {
  const activeTimeouts = new Map();
  const activeIntervals = new Map();
  const activeMutationObservers = new Set();
  const activeResizeObservers = new Set();
  let nextTimerId = 1;
  let nowMs = 10000;

  const scheduleFake = (map, fn, delay, isInterval) => {
    const id = nextTimerId++;
    map.set(id, { fn, runAt: nowMs + Math.max(0, Number(delay) || 0), delay: Math.max(1, Number(delay) || 1), isInterval });
    return id;
  };

  const advanceTime = (ms) => {
    const target = nowMs + ms;
    let guard = 0;
    while (guard++ < 500) {
      let earliestId = null;
      let earliestMap = null;
      let earliestTime = Infinity;
      for (const [id, rec] of activeTimeouts) {
        if (rec.runAt <= target && rec.runAt < earliestTime) {
          earliestTime = rec.runAt; earliestId = id; earliestMap = activeTimeouts;
        }
      }
      for (const [id, rec] of activeIntervals) {
        if (rec.runAt <= target && rec.runAt < earliestTime) {
          earliestTime = rec.runAt; earliestId = id; earliestMap = activeIntervals;
        }
      }
      if (earliestId === null) break;
      nowMs = earliestTime;
      const rec = earliestMap.get(earliestId);
      if (!rec) continue;
      if (rec.isInterval) {
        rec.runAt = nowMs + rec.delay;
      } else {
        earliestMap.delete(earliestId);
      }
      rec.fn();
    }
    nowMs = target;
  };

  const doc = {
    hidden: false,
    activeElement: null,
    _listeners: [],
    createElement(tag) { return new MockElement(doc, tag); },
    addEventListener(type, fn, opts) {
      const capture = typeof opts === "boolean" ? opts : Boolean(opts?.capture);
      this._listeners.push({ type, fn, capture });
    },
    removeEventListener(type, fn, opts) {
      const capture = typeof opts === "boolean" ? opts : Boolean(opts?.capture);
      this._listeners = this._listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === capture));
    },
    getElementById(id) { return doc.documentElement.querySelector(`#${id}`); },
    querySelector(sel) { return doc.documentElement.querySelector(sel); },
    querySelectorAll(sel) { return doc.documentElement.querySelectorAll(sel); },
    _notifyMutation(rec) {
      for (const obs of Array.from(activeMutationObservers)) {
        obs._consider(rec);
      }
    }
  };

  doc.documentElement = new MockElement(doc, "html");
  if (options.windowsTitlebar !== false) doc.documentElement.setAttribute("data-windows-titlebar", "");
  if (options.platform) doc.documentElement.setAttribute("data-platform", options.platform);
  doc.head = new MockElement(doc, "head");
  doc.body = new MockElement(doc, "body");
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const root = doc.createElement("div");
  root.id = "root";
  doc.body.appendChild(root);

  const SB = options.sbPrefix || "wtg9ga";
  const AF = options.afPrefix || "mP3x-q";

  const frame = doc.createElement("div");
  frame.className = `${AF}_frame`;
  frame._rect = { left: 48, top: 40, right: 1280, bottom: 800, width: 1232, height: 760 };
  root.appendChild(frame);

  const sidebarCol = doc.createElement("div");
  sidebarCol.className = `${AF}_sidebarCol`;
  sidebarCol._rect = { left: 48, top: 40, right: 312, bottom: 800, width: 264, height: 760 };
  frame.appendChild(sidebarCol);

  const centerCol = doc.createElement("div");
  centerCol.className = `${AF}_centerCol`;
  centerCol.offsetLeft = 0;
  frame.appendChild(centerCol);

  const sidebarRoot = doc.createElement("div");
  sidebarRoot.className = `${SB}_root`;
  sidebarRoot.style.width = "264px";
  sidebarCol.appendChild(sidebarRoot);

  const panelList = doc.createElement("nav");
  panelList.className = `${SB}_panelList`;
  sidebarRoot.appendChild(panelList);

  const regionArea = doc.createElement("div");
  regionArea.className = `${SB}_regionArea`;
  sidebarRoot.appendChild(regionArea);

  const footArea = doc.createElement("div");
  footArea.className = `${SB}_footArea`;
  sidebarRoot.appendChild(footArea);

  const settingsArea = doc.createElement("div");
  settingsArea.className = `${SB}_settingsArea`;
  const settingsBtn = doc.createElement("button");
  settingsBtn.setAttribute("aria-label", "账号与设置");
  settingsArea.appendChild(settingsBtn);
  footArea.appendChild(settingsArea);

  class MockMutationObserver {
    constructor(cb) {
      this._cb = cb;
      this._target = null;
      this._opts = null;
      this._queue = [];
      this._flushing = false;
    }
    observe(target, opts) {
      this._target = target;
      this._opts = opts || {};
      activeMutationObservers.add(this);
    }
    disconnect() {
      activeMutationObservers.delete(this);
      this._queue = [];
    }
    _consider(rec) {
      if (!this._target || !this._opts) return;
      if (this._opts.subtree) {
        if (!this._target.contains(rec.target)) return;
      } else if (rec.target !== this._target) {
        return;
      }
      if (rec.type === "attributes") {
        if (!this._opts.attributes) return;
        if (this._opts.attributeFilter && !this._opts.attributeFilter.includes(rec.attributeName)) return;
      } else if (rec.type === "childList") {
        if (!this._opts.childList) return;
      }
      this._queue.push(rec);
      if (!this._flushing) {
        this._flushing = true;
        // 同步或微任务队列在测试中由 flushMutations 驱动或立即派发
        Promise.resolve().then(() => {
          this._flushing = false;
          if (!activeMutationObservers.has(this) || this._queue.length === 0) return;
          const batch = this._queue.splice(0);
          this._cb(batch, this);
        });
      }
    }
  }

  class MockResizeObserver {
    constructor(cb) { this._cb = cb; this._targets = new Set(); }
    observe(el) { this._targets.add(el); activeResizeObservers.add(this); }
    unobserve(el) { this._targets.delete(el); if (this._targets.size === 0) activeResizeObservers.delete(this); }
    disconnect() { this._targets.clear(); activeResizeObservers.delete(this); }
    trigger() { this._cb([], this); }
  }

  const loadedModules = new Map();
  const win = {
    innerWidth: 1280,
    innerHeight: 800,
    _listeners: [],
    document: doc,
    CSS: { escape: (s) => String(s).replace(/([^A-Za-z0-9_-])/g, "\\$1") },
    localStorage: { _store: new Map(), getItem(k) { return this._store.get(k) ?? null; }, setItem(k, v) { this._store.set(k, String(v)); } },
    matchMedia: () => ({ matches: Boolean(options.reducedMotion) }),
    getComputedStyle: () => ({ display: "inline-flex" }),
    addEventListener(type, fn, opts) {
      const capture = typeof opts === "boolean" ? opts : Boolean(opts?.capture);
      this._listeners.push({ type, fn, capture });
    },
    removeEventListener(type, fn, opts) {
      const capture = typeof opts === "boolean" ? opts : Boolean(opts?.capture);
      this._listeners = this._listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === capture));
    },
    dispatchEvent(ev) {
      const list = [...this._listeners];
      for (const l of list) {
        if (l.type === ev.type) l.fn.call(win, ev);
      }
    },
    setTimeout: (fn, d) => scheduleFake(activeTimeouts, fn, d, false),
    clearTimeout: (id) => activeTimeouts.delete(id),
    setInterval: (fn, d) => scheduleFake(activeIntervals, fn, d, true),
    clearInterval: (id) => activeIntervals.delete(id),
    requestAnimationFrame: (fn) => scheduleFake(activeTimeouts, fn, 16, false),
    cancelAnimationFrame: (id) => activeTimeouts.delete(id),
    MutationObserver: MockMutationObserver,
    ResizeObserver: MockResizeObserver,
    __ModuleLoader__: {
      load({ id, factory }) {
        loadedModules.set(id, factory);
      }
    }
  };
  doc.defaultView = win;

  // 创建可控宿主 layout 与 uiWorkspace 服务
  let activePanelId = null;
  const panelListeners = new Set();
  let currentSessionId = "s-init";
  const sessionListeners = new Set();
  const openedSessions = [];
  let toggleCount = 0;
  let lastSetSidebarWidth = null;

  const layout = {
    panelInfo: {
      getSnapshot: () => ({ activePanelId }),
      subscribe: (fn) => {
        panelListeners.add(fn);
        return () => panelListeners.delete(fn);
      }
    },
    selectPanel(id) {
      activePanelId = id;
      panelListeners.forEach((fn) => fn({ activePanelId }));
    },
    setSidebar(px) {
      lastSetSidebarWidth = px;
      sidebarRoot.style.width = `${px}px`;
    },
    toggleSidebar() {
      toggleCount++;
      if (frame.hasAttribute("data-sidebar-collapsed")) {
        frame.removeAttribute("data-sidebar-collapsed");
        sidebarRoot.classList.remove(`${SB}_collapsed`);
      } else {
        frame.setAttribute("data-sidebar-collapsed", "true");
        sidebarRoot.classList.add(`${SB}_collapsed`);
      }
    }
  };

  const uiWorkspace = {
    selection: {
      getSnapshot: () => ({ sessionId: currentSessionId }),
      subscribe: (fn) => {
        sessionListeners.add(fn);
        return () => sessionListeners.delete(fn);
      }
    },
    openSession(sid) {
      openedSessions.push(sid);
      currentSessionId = sid;
      sessionListeners.forEach((fn) => fn({ sessionId: sid }));
    },
    startSession() {
      const sid = `s-new-${openedSessions.length + 1}`;
      currentSessionId = sid;
      sessionListeners.forEach((fn) => fn({ sessionId: sid }));
    }
  };

  const ctx = {
    layout,
    get(name) {
      if (name === "layout") return layout;
      if (name === "uiWorkspace") return uiWorkspace;
      return null;
    }
  };

  const sandbox = {
    window: win,
    document: doc,
    CSS: win.CSS,
    MutationObserver: MockMutationObserver,
    ResizeObserver: MockResizeObserver,
    setTimeout: win.setTimeout,
    clearTimeout: win.clearTimeout,
    setInterval: win.setInterval,
    clearInterval: win.clearInterval,
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
    queueMicrotask,
    Date: Object.assign(function (...a) { return new Date(...a); }, { now: () => nowMs }),
    console: { log() {}, warn() {}, error() {} }
  };

  vm.runInNewContext(CLIENT_SRC, sandbox, { filename: "lib/client.js" });

  const createPanelRow = (id, label, { withSvgTitle = false, active = false } = {}) => {
    const entry = doc.createElement("div");
    entry.className = `${SB}_panelEntry${active ? ` ${SB}_panelEntryActive` : ""}`;
    const btn = doc.createElement("button");
    btn.className = `${SB}_panelRow`;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("data-panel-id", id);
    if (active) btn.setAttribute("aria-current", "page");
    btn.innerHTML = `<span class="${SB}_panelGlyph"><svg viewBox="0 0 16 16">${withSvgTitle ? "<title>svg-internal-icon</title>" : ""}<circle cx="8" cy="8" r="6"/></svg></span><span class="${SB}_panelTitle">${label}</span>`;
    entry.appendChild(btn);
    panelList.appendChild(entry);
    return { entry, btn };
  };

  const createMoreMenu = (label = "更多") => {
    const anchor = doc.createElement("span");
    anchor.className = `_root_70kcw_1 ${SB}_moreAnchor`;
    anchor.style.setProperty("anchor-name", "--dsh-menu-trigger-test");
    const btn = doc.createElement("button");
    btn.className = `${SB}_panelRow`;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<span class="${SB}_panelGlyph"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2"/></svg></span><span class="${SB}_panelTitle">${label}</span>`;
    anchor.appendChild(btn);
    panelList.appendChild(anchor);
    return { anchor, btn };
  };

  const applyPlugin = () => {
    const factory = loadedModules.get("dsh-codex-rail");
    assert.ok(factory, "dsh-codex-rail 模块应已注册");
    assert.ok(loadedModules.get("dsh-codex-sidebar"), "兼容别名 dsh-codex-sidebar 应已注册");
    const mod = factory(() => ({}));
    const cleanup = mod.apply(ctx);
    advanceTime(120);
    return cleanup;
  };

  return {
    win, doc, root, frame, sidebarCol, centerCol, sidebarRoot, panelList, regionArea, footArea, settingsArea,
    layout, uiWorkspace, ctx, openedSessions,
    getToggleCount: () => toggleCount,
    getLastSidebarWidth: () => lastSetSidebarWidth,
    setSession: (sid) => { currentSessionId = sid; sessionListeners.forEach((fn) => fn({ sessionId: sid })); },
    createPanelRow, createMoreMenu, applyPlugin, advanceTime,
    flushMicrotasks: () => new Promise((r) => setTimeout(r, 0)),
    stats: () => ({
      timeouts: activeTimeouts.size,
      intervals: activeIntervals.size,
      mutationObservers: activeMutationObservers.size,
      resizeObservers: activeResizeObservers.size,
      winListeners: win._listeners.length,
      docListeners: doc._listeners.length,
      panelListeners: panelListeners.size,
      sessionListeners: sessionListeners.size
    })
  };
}

// --- 测试用例 ---

test("前缀自动探测与动态 CSS 注入（适配 DSH CSS Module 哈希变更）", () => {
  const env = createTestEnv({ sbPrefix: "hHd-Xa", afPrefix: "z9K2-p" });
  const cleanup = env.applyPlugin();
  const styleEl = env.doc.getElementById("dsh-codex-sidebar-style");
  assert.ok(styleEl, "应注入样式表");
  assert.ok(styleEl.textContent.includes(".hHd-Xa_panelList"), "CSS 应自动替换为检测到的 SB 前缀");
  assert.ok(styleEl.textContent.includes(".z9K2-p_frame"), "CSS 应自动替换为检测到的 AF 前缀");
  assert.ok(!styleEl.textContent.includes(".wtg9ga_panelList"), "不应残留旧前缀 wtg9ga_");
  cleanup();
});

test("P0-1: React 重渲染替换 sourceEl 后克隆按钮点击依然命中最新节点，且保持面板与“更多”顺序", async () => {
  const env = createTestEnv();
  const first = env.createPanelRow("plugins", "插件");
  const more = env.createMoreMenu("更多");
  let oldClicks = 0;
  let newClicks = 0;
  first.btn.addEventListener("click", () => oldClicks++);

  const cleanup = env.applyPlugin();

  const toolsBox = env.doc.getElementById("dsh-codex-sidebar-tools");
  assert.equal(toolsBox.children.length, 2);
  assert.equal(toolsBox.children[0].getAttribute("data-key"), "plugins");
  assert.equal(toolsBox.children[1].getAttribute("data-key"), "dsh-panel-more", "“更多”菜单应始终位于末尾");

  const railPluginsBtn = toolsBox.children[0];
  railPluginsBtn.click();
  assert.equal(oldClicks, 1);

  // 模拟 React 重渲染：卸载旧节点并挂载同名新按钮
  first.entry.remove();
  const second = env.createPanelRow("plugins", "插件");
  second.btn.addEventListener("click", () => newClicks++);
  // 新建在 more 后面后再把 more 移到末尾模拟 React 重新固定顺序
  env.panelList.appendChild(more.anchor);

  await env.flushMicrotasks();
  env.advanceTime(120);

  // 复用了同一个 railPluginsBtn，但点击必须触发新挂载的 second.btn
  assert.equal(toolsBox.children[0], railPluginsBtn, "应复用原按钮实例不重建");
  assert.equal(toolsBox.children[1].getAttribute("data-key"), "dsh-panel-more", "“更多”仍保持在末尾");
  railPluginsBtn.click();
  assert.equal(oldClicks, 1, "不应再调用已脱离 DOM 的旧节点");
  assert.equal(newClicks, 1, "应准确命中最新挂载的 sourceEl");

  cleanup();
});

test("P0-2: 窄屏抽屉模式（[data-sidebar-drawer]）进出时完整归还并重新接管设置区、面板列表与锚点样式", async () => {
  const env = createTestEnv();
  const row = env.createPanelRow("plugins", "插件");
  const more = env.createMoreMenu("更多");
  const cleanup = env.applyPlugin();

  const settingsSlot = env.doc.getElementById("dsh-codex-settings-slot");
  assert.equal(settingsSlot.contains(env.settingsArea), true, "桌面态设置区应迁入活动栏底部插槽");
  assert.equal(row.btn.classList.contains("dsh-codex-hide-source"), true);

  // 点击一次“更多”产生锚点内联定位样式
  const toolsBox = env.doc.getElementById("dsh-codex-sidebar-tools");
  const moreRailBtn = toolsBox.querySelector('[data-key="dsh-panel-more"]');
  moreRailBtn.click();
  assert.equal(more.anchor.getAttribute("data-dsh-codex-anchored"), "1");

  // 进入窄屏抽屉模式
  env.frame.setAttribute("data-sidebar-drawer", "true");
  await env.flushMicrotasks();
  env.advanceTime(120);

  assert.equal(env.footArea.contains(env.settingsArea), true, "抽屉模式必须将 settingsArea 归还回原生 footArea");
  assert.equal(row.btn.classList.contains("dsh-codex-hide-source"), false, "抽屉模式必须移除隐藏类");
  assert.equal(more.anchor.hasAttribute("data-dsh-codex-anchored"), false, "抽屉模式必须清理临时 fixed 锚点样式");
  assert.equal(more.anchor.style.getPropertyValue("position"), "");

  // 退出抽屉模式回到宽屏桌面态
  env.frame.removeAttribute("data-sidebar-drawer");
  await env.flushMicrotasks();
  env.advanceTime(120);

  assert.equal(settingsSlot.contains(env.settingsArea), true, "退出抽屉后应自动重新接管 settingsArea");
  assert.equal(row.btn.classList.contains("dsh-codex-hide-source"), true, "退出抽屉后应重新接管面板入口");

  cleanup();
});

test("P0-3: 原生 DSH 0.2.2+ “更多”菜单同步定位 .moreAnchor 与触发器，支持缩放归一化并防二次点击误重开", () => {
  const env = createTestEnv();
  const more = env.createMoreMenu("更多");
  let menuOpen = false;
  let toggleClicks = 0;

  // 模拟 Primitives.Menu 的 document pointerdown 自动关闭与按钮点击切换
  env.doc.addEventListener("pointerdown", (e) => {
    if (menuOpen && !more.anchor.contains(e.target)) {
      menuOpen = false;
      more.btn.setAttribute("aria-expanded", "false");
    }
  });
  more.btn.addEventListener("click", () => {
    toggleClicks++;
    menuOpen = !menuOpen;
    more.btn.setAttribute("aria-expanded", menuOpen ? "true" : "false");
  });

  // 模拟 dsh-claude-style 125% 页面缩放
  env.doc.body.setAttribute("data-dsh-claude-page-zoom", "1.25");
  const cleanup = env.applyPlugin();

  const moreRailBtn = env.doc.getElementById("dsh-codex-sidebar-tools").querySelector('[data-key="dsh-panel-more"]');
  moreRailBtn._rect = { left: 7.5, top: 250, right: 52.5, bottom: 295, width: 45, height: 45 };

  // 首次点击打开菜单
  moreRailBtn.dispatchEvent({ type: "pointerdown", bubbles: true });
  moreRailBtn.click();

  assert.equal(menuOpen, true, "首次点击应打开菜单");
  assert.equal(toggleClicks, 1);
  assert.equal(more.anchor.style.getPropertyValue("position"), "fixed", "外层 .moreAnchor 必须同步 fixed 定位以锚定 CSS anchor-name");
  assert.equal(more.anchor.style.getPropertyValue("left"), "6px", "坐标需除以 1.25 缩放因子归一化");
  assert.equal(more.anchor.style.getPropertyValue("top"), "200px");
  assert.equal(more.btn.style.getPropertyValue("left"), "6px", "内部按钮同步定位以兼容 dsh-claude-style Px(e)");
  assert.equal(more.btn.style.getPropertyValue("top"), "200px");

  // 再次点击已打开的“更多”按钮：pointerdown 已由 Primitives.Menu 关闭，click 不应再次将其误打开
  moreRailBtn.dispatchEvent({ type: "pointerdown", bubbles: true });
  moreRailBtn.click();

  assert.equal(menuOpen, false, "二次点击应干净关闭菜单，不能闪开复现");
  assert.equal(toggleClicks, 1, "已被 pointerdown 关闭时不应再二次触发 sourceEl.click()");

  cleanup();
});

test("P1-4: 折叠/展开切换时卸载 .panelTitle 且 SVG 含 <title> 时 data-key 与按钮实例保持零抖动", async () => {
  const env = createTestEnv();
  const row = env.createPanelRow("tasks", "任务看板", { withSvgTitle: true });
  const cleanup = env.applyPlugin();

  const toolsBox = env.doc.getElementById("dsh-codex-sidebar-tools");
  const originalBtn = toolsBox.children[0];
  assert.equal(originalBtn.getAttribute("data-tooltip"), "任务看板");

  // 模拟折叠态：React 卸载 .panelTitle，仅留含 <svg><title>svg-internal-icon</title></svg> 的图标与 aria-label
  row.btn.removeAttribute("data-panel-id");
  const titleSpan = row.btn.querySelector(".wtg9ga_panelTitle");
  titleSpan.remove();
  env.frame.setAttribute("data-sidebar-collapsed", "true");

  await env.flushMicrotasks();
  env.advanceTime(120);

  assert.equal(toolsBox.children[0].getAttribute("data-tooltip"), "任务看板", "必须优先使用稳定 aria-label 而非 SVG <title>");
  assert.equal(toolsBox.children[0].getAttribute("data-key"), "item-任务看板");

  cleanup();
});

test("P1-5: Tooltip 延迟/预热秒切/滚动/失焦/Esc 收起、快捷键徽标、历史栈 50 条上限与全局面板后退", () => {
  const env = createTestEnv();
  env.createPanelRow("plugins", "插件");
  const cleanup = env.applyPlugin();

  // 1) Tooltip 450ms 延迟与滚动自动隐藏
  const toolsBox = env.doc.getElementById("dsh-codex-sidebar-tools");
  const btn = toolsBox.children[0];
  const homeBtn = env.doc.getElementById("dsh-codex-btn-home");
  btn.__hover = true;
  btn.dispatchEvent({ type: "pointerover", bubbles: true, pointerType: "mouse" });
  env.advanceTime(300);
  assert.equal(env.doc.getElementById("dsh-codex-floating-tooltip")?.classList.contains("visible") || false, false, "300ms 时不应过早显示");
  env.advanceTime(200);
  assert.equal(env.doc.getElementById("dsh-codex-floating-tooltip").classList.contains("visible"), true, "450ms 后应显示提示");

  // 离开按钮进入相邻按钮：预热期 300ms 内应立即秒切
  btn.dispatchEvent({ type: "pointerout", bubbles: true, relatedTarget: homeBtn });
  assert.equal(env.doc.getElementById("dsh-codex-floating-tooltip").classList.contains("visible"), false);
  homeBtn.__hover = true;
  homeBtn.dispatchEvent({ type: "pointerover", bubbles: true, pointerType: "mouse" });
  assert.equal(env.doc.getElementById("dsh-codex-floating-tooltip").classList.contains("visible"), true, "预热期内切换相邻按钮应秒切显示");

  // 滚轮滚动工具区应立刻隐藏气泡
  toolsBox.dispatchEvent({ type: "scroll", bubbles: false });
  assert.equal(env.doc.getElementById("dsh-codex-floating-tooltip").classList.contains("visible"), false, "工具区滚动后应立即隐藏气泡");

  // 顶栏收展按钮 Tooltip 应渲染独立快捷键徽标，并在 Esc 与 window.blur 时收起
  const titleToggle = env.doc.getElementById("dsh-codex-btn-title-toggle");
  titleToggle.__hover = true;
  titleToggle.dispatchEvent({ type: "pointerover", bubbles: true, pointerType: "mouse" });
  env.advanceTime(460);
  const tip = env.doc.getElementById("dsh-codex-floating-tooltip");
  assert.equal(tip.classList.contains("visible"), true);
  assert.equal(tip.querySelector(".dsh-codex-tip-kbd")?.textContent, "Ctrl + B", "应渲染独立快捷键徽标");
  env.win.dispatchEvent({ type: "keydown", key: "Escape" });
  assert.equal(tip.classList.contains("visible"), false, "按 Esc 应隐藏气泡");

  titleToggle.dispatchEvent({ type: "pointerover", bubbles: true, pointerType: "mouse" });
  env.advanceTime(460);
  assert.equal(tip.classList.contains("visible"), true);
  env.win.dispatchEvent({ type: "blur" });
  assert.equal(tip.classList.contains("visible"), false, "窗口失焦应立即隐藏气泡");

  // 2) 会话历史栈上限 50 条与前进后退
  for (let i = 1; i <= 60; i++) {
    env.setSession(`s-${i}`);
  }
  const backBtn = env.doc.getElementById("dsh-codex-btn-back");
  const fwdBtn = env.doc.getElementById("dsh-codex-btn-forward");
  assert.equal(backBtn.disabled, false);
  assert.equal(fwdBtn.disabled, true);

  let backSteps = 0;
  while (!backBtn.disabled && backSteps < 100) {
    backBtn.click();
    env.advanceTime(250);
    backSteps++;
  }
  assert.equal(backSteps, 49, "历史栈上限 50 条最多可连续后退 49 步");
  assert.equal(fwdBtn.disabled, false);

  // 3) 停留在全局面板时点击后退应先返回当前对话，不破坏会话堆栈
  const prevOpenedLen = env.openedSessions.length;
  env.layout.selectPanel("plugins");
  assert.equal(backBtn.disabled, false, "打开全局面板后后退按钮应立即可用");
  backBtn.click();
  assert.equal(env.layout.panelInfo.getSnapshot().activePanelId, null, "后退应关闭全局面板返回对话");
  assert.equal(env.openedSessions.length, prevOpenedLen, "返回对话不应额外跳到上一条历史会话");

  // 4) 输入框内不抢占 Alt+←
  const input = env.doc.createElement("input");
  env.doc.body.appendChild(input);
  let prevented = false;
  env.win.dispatchEvent({
    type: "keydown",
    key: "ArrowRight",
    altKey: true,
    target: input,
    preventDefault() { prevented = true; }
  });
  assert.equal(prevented, false, "输入框内不应抢占 Alt+方向键");

  cleanup();
});

test("P1-6: 订阅 layout.panelInfo.subscribe 实现主页高亮与后退按钮零延迟更新", () => {
  const env = createTestEnv();
  env.createPanelRow("plugins", "插件");
  const cleanup = env.applyPlugin();

  const homeBtn = env.doc.getElementById("dsh-codex-btn-home");
  assert.equal(homeBtn.classList.contains("active"), true, "初始会话态主页按钮应高亮");

  // 不推进任何防抖定时器，直接触发 panelInfo 切换
  env.layout.selectPanel("plugins");
  assert.equal(homeBtn.classList.contains("active"), false, "切至面板后主页按钮应零延迟取消高亮");

  env.layout.selectPanel(null);
  assert.equal(homeBtn.classList.contains("active"), true, "切回会话后主页按钮应零延迟恢复高亮");

  cleanup();
});

test("P2-7: 工具区按需边缘渐隐（无溢出无遮罩，仅在对应方向存在溢出时开启）", () => {
  const env = createTestEnv();
  env.createPanelRow("plugins", "插件");
  const cleanup = env.applyPlugin();

  const toolsBox = env.doc.getElementById("dsh-codex-sidebar-tools");
  // 无溢出
  toolsBox.scrollHeight = 120;
  toolsBox.clientHeight = 200;
  toolsBox.scrollTop = 0;
  toolsBox.dispatchEvent({ type: "scroll", bubbles: false });
  assert.equal(toolsBox.hasAttribute("data-fade-top"), false);
  assert.equal(toolsBox.hasAttribute("data-fade-bottom"), false);

  // 顶部位置且底部溢出
  toolsBox.scrollHeight = 400;
  toolsBox.clientHeight = 200;
  toolsBox.scrollTop = 0;
  toolsBox.dispatchEvent({ type: "scroll", bubbles: false });
  assert.equal(toolsBox.hasAttribute("data-fade-top"), false);
  assert.equal(toolsBox.hasAttribute("data-fade-bottom"), true);

  // 滚动至中间：上下双渐隐
  toolsBox.scrollTop = 100;
  toolsBox.dispatchEvent({ type: "scroll", bubbles: false });
  assert.equal(toolsBox.hasAttribute("data-fade-top"), true);
  assert.equal(toolsBox.hasAttribute("data-fade-bottom"), true);

  // 滚动到底部：仅顶部渐隐
  toolsBox.scrollTop = 200;
  toolsBox.dispatchEvent({ type: "scroll", bubbles: false });
  assert.equal(toolsBox.hasAttribute("data-fade-top"), true);
  assert.equal(toolsBox.hasAttribute("data-fade-bottom"), false);

  cleanup();
});

test("P2-8: 折叠态悬停预览（Hover Peek）展开、点击固定、离开收起及与 dsh-claude-style 协同", async () => {
  const env = createTestEnv({ reducedMotion: true });
  env.frame.setAttribute("data-sidebar-collapsed", "true");
  env.frame.setAttribute("data-rightbar-collapsed", "true");
  env.sidebarRoot.classList.add("wtg9ga_collapsed");
  const cleanup = env.applyPlugin();

  const titleToggle = env.doc.getElementById("dsh-codex-btn-title-toggle");
  titleToggle._rect = { left: 70, top: 6, right: 98, bottom: 34, width: 28, height: 28 };

  // 1) 若 dsh-claude-style 已处于 peek 状态，绝不双触发
  env.frame.setAttribute("data-dsh-claude-sidebar-peek", "open");
  titleToggle.dispatchEvent({ type: "pointerover", bubbles: true, pointerType: "mouse" });
  env.advanceTime(300);
  assert.equal(env.frame.hasAttribute("data-codex-sidebar-peek"), false, "与 dsh-claude-style peek 互斥防冲突");
  env.frame.removeAttribute("data-dsh-claude-sidebar-peek");

  // 2) 正常折叠态悬停触发 Hover Peek
  titleToggle.dispatchEvent({ type: "pointerover", bubbles: true, pointerType: "mouse" });
  env.advanceTime(250);
  await env.flushMicrotasks();
  assert.equal(env.frame.getAttribute("data-codex-sidebar-peek"), "open");
  assert.equal(env.frame.hasAttribute("data-sidebar-collapsed"), false, "Peek 期间宿主工作区临时展开");

  // 3) 鼠标离开至主对话区后自动收起
  env.doc.documentElement.dispatchEvent({ type: "pointermove", bubbles: true, clientX: 600, clientY: 400, buttons: 0 });
  env.advanceTime(360);
  await env.flushMicrotasks();
  assert.equal(env.frame.hasAttribute("data-codex-sidebar-peek"), false, "离开后应清理 peek 属性");
  assert.equal(env.frame.hasAttribute("data-sidebar-collapsed"), true, "离开后应自动还原为折叠态");

  // 4) 再次 Hover Peek 后点击收展按钮应直接“固定展开”，而非再次收起
  titleToggle.dispatchEvent({ type: "pointerover", bubbles: true, pointerType: "mouse" });
  env.advanceTime(250);
  await env.flushMicrotasks();
  assert.equal(env.frame.getAttribute("data-codex-sidebar-peek"), "open");
  const togglesBeforePin = env.getToggleCount();
  titleToggle.click();
  assert.equal(env.frame.hasAttribute("data-codex-sidebar-peek"), false, "点击后应移除 peek 浮层态");
  assert.equal(env.frame.hasAttribute("data-sidebar-collapsed"), false, "点击固定后工作区保持展开");
  assert.equal(env.getToggleCount(), togglesBeforePin, "固定展开不应多调用一次 toggleSidebar()");

  cleanup();
});

test("P2-9: macOS (darwin) 交通灯避让、快捷键格式与全屏态 CSS 规则校验", () => {
  const env = createTestEnv({ windowsTitlebar: false, platform: "darwin" });
  const cleanup = env.applyPlugin();

  const styleText = env.doc.getElementById("dsh-codex-sidebar-style").textContent;
  assert.ok(styleText.includes('html[data-platform="darwin"]:not([data-fullscreen]) #dsh-codex-sidebar-rail'), "应包含 macOS 交通灯避让规则");
  assert.ok(styleText.includes("padding-top: var(--dsh-frame-top-clearance, 48px)"), "应使用 48px 顶部避让");
  assert.ok(styleText.includes('html[data-platform="darwin"][data-fullscreen] #dsh-codex-sidebar-rail'), "应包含 macOS 全屏紧凑间距规则");
  assert.ok(styleText.includes('html[data-windows-titlebar]:not([data-codex-drawer]) #root .wtg9ga_toggle'), "Windows 全屏下也必须隐藏原生 toggle 防碰撞");

  const railToggle = env.doc.getElementById("dsh-codex-btn-rail-toggle");
  assert.equal(railToggle.getAttribute("data-tooltip-shortcut"), "⌘ B", "macOS 快捷键应显示 ⌘ B");
  const railNew = env.doc.getElementById("dsh-codex-btn-rail-new");
  assert.equal(railNew.getAttribute("data-tooltip-shortcut"), "⌘ ⇧ O", "macOS 新会话快捷键应显示 ⌘ ⇧ O");

  cleanup();
});

test("P2-10: 热重载与卸载清理零残留（DOM、样式、定时器、Observer、全局事件与设置区完整还原）", async () => {
  const env = createTestEnv();
  env.createPanelRow("plugins", "插件");
  const more = env.createMoreMenu("更多");

  const cleanup = env.applyPlugin();
  const moreRailBtn = env.doc.getElementById("dsh-codex-sidebar-tools").querySelector('[data-key="dsh-panel-more"]');
  moreRailBtn.click();

  // 触发一个尚未到期的 Tooltip 定时器
  moreRailBtn.__hover = true;
  moreRailBtn.dispatchEvent({ type: "pointerover", bubbles: true, pointerType: "mouse" });

  // 幂等执行两次清理
  cleanup();
  cleanup();

  assert.equal(env.doc.getElementById("dsh-codex-sidebar-rail"), null);
  assert.equal(env.doc.getElementById("dsh-codex-titlebar-nav"), null);
  assert.equal(env.doc.getElementById("dsh-codex-floating-tooltip"), null);
  assert.equal(env.doc.getElementById("dsh-codex-overlay-root"), null);
  assert.equal(env.doc.getElementById("dsh-codex-sidebar-style"), null);
  assert.equal(env.doc.querySelectorAll(".dsh-codex-hide-source").length, 0);
  assert.equal(env.doc.querySelectorAll("[data-dsh-codex-anchored]").length, 0);
  assert.equal(env.doc.querySelectorAll("[data-codex-sidebar-peek]").length, 0);
  assert.equal(env.footArea.contains(env.settingsArea), true, "卸载后原生 settingsArea 必须回到 footArea");
  assert.equal(more.anchor.style.getPropertyValue("position"), "", "卸载后锚点样式必须还原");

  const st = env.stats();
  assert.equal(st.timeouts, 0, "所有 setTimeout 必须已清理");
  assert.equal(st.intervals, 0, "所有 setInterval 必须已清理");
  assert.equal(st.mutationObservers, 0, "所有 MutationObserver 必须已断开");
  assert.equal(st.resizeObservers, 0, "所有 ResizeObserver 必须已断开");
  assert.equal(st.winListeners, 0, "所有 window 监听必须已注销");
  assert.equal(st.docListeners, 0, "所有 document 监听必须已注销");
  assert.equal(st.panelListeners, 0, "layout.panelInfo 订阅必须已退订");
  assert.equal(st.sessionListeners, 0, "uiWorkspace.selection 订阅必须已退订");
});

test("进阶体验：活动栏键盘上下导航、Hover Peek 选会话自动收起及热重载自动清场", async () => {
  const env = createTestEnv({ reducedMotion: true });
  env.createPanelRow("plugins", "插件");
  env.createPanelRow("skills", "技能");
  const sessionRow = env.doc.createElement("div");
  sessionRow.setAttribute("data-row-key", "session:s-42");
  env.regionArea.appendChild(sessionRow);

  // 1) 连续挂载两次模拟热重载，不应产生重复 DOM 或泄漏监听
  env.applyPlugin();
  const cleanup = env.applyPlugin();
  assert.equal(env.doc.querySelectorAll("#dsh-codex-sidebar-rail").length, 1);
  assert.equal(env.doc.querySelectorAll("#dsh-codex-titlebar-nav").length, 1);

  // 2) 活动栏键盘 ArrowDown / ArrowUp / End / Home 焦点移动
  const homeBtn = env.doc.getElementById("dsh-codex-btn-home");
  const toolsBox = env.doc.getElementById("dsh-codex-sidebar-tools");
  homeBtn.focus();
  assert.equal(env.doc.activeElement, homeBtn);
  homeBtn.dispatchEvent({ type: "keydown", key: "ArrowDown", bubbles: true });
  assert.notEqual(env.doc.activeElement, homeBtn, "按 ArrowDown 应移至下一个可见按钮");

  // 3) 折叠态 Hover Peek 中点击会话行应自动收起预览并保持干净状态
  env.frame.setAttribute("data-sidebar-collapsed", "true");
  env.frame.setAttribute("data-rightbar-collapsed", "true");
  env.sidebarRoot.classList.add("wtg9ga_collapsed");

  const titleToggle = env.doc.getElementById("dsh-codex-btn-title-toggle");
  titleToggle.dispatchEvent({ type: "pointerover", bubbles: true, pointerType: "mouse" });
  env.advanceTime(250);
  await env.flushMicrotasks();
  assert.equal(env.frame.getAttribute("data-codex-sidebar-peek"), "open");

  sessionRow.click();
  env.advanceTime(300);
  await env.flushMicrotasks();
  assert.equal(env.frame.hasAttribute("data-codex-sidebar-peek"), false, "在浮层中点选会话后应自动收起预览");
  assert.equal(env.frame.hasAttribute("data-sidebar-collapsed"), true, "收起后工作区恢复折叠态");

  // 4) Peek 打开状态下直接触发卸载清理，必须还原工作区折叠态
  titleToggle.dispatchEvent({ type: "pointerover", bubbles: true, pointerType: "mouse" });
  env.advanceTime(250);
  await env.flushMicrotasks();
  assert.equal(env.frame.getAttribute("data-codex-sidebar-peek"), "open");
  cleanup();
  assert.equal(env.frame.hasAttribute("data-codex-sidebar-peek"), false);
  assert.equal(env.frame.hasAttribute("data-sidebar-collapsed"), true, "Peek 期间卸载插件必须还原宿主折叠状态");
  assert.equal(env.stats().timeouts, 0);
  assert.equal(env.stats().winListeners, 0);
  assert.equal(env.stats().docListeners, 0);
});

test("回归防线：任务看板与技能中心主面板/右侧栏 [data-dsh-plugin] 绝不被隐藏或误克隆，且支持 data-dsh-panel-entry 零延迟高亮", async () => {
  const env = createTestEnv();

  // 1) 在 panelList 中挂载不带 data-panel-id、仅靠 <svg data-dsh-panel-entry> 标识的原生行（还原 DSH 0.2.2 + @linxin666 真实 DOM）
  const createRealPanelEntry = (panelId, label) => {
    const entry = env.doc.createElement("div");
    entry.className = "wtg9ga_panelEntry";
    const btn = env.doc.createElement("button");
    btn.className = "wtg9ga_panelRow";
    btn.setAttribute("aria-label", label);
    btn.innerHTML = `<span class="wtg9ga_panelGlyph"><svg data-dsh-panel-entry="${panelId}" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12"/></svg></span><span class="wtg9ga_panelTitle">${label}</span>`;
    entry.appendChild(btn);
    env.panelList.appendChild(entry);
    return { entry, btn };
  };

  createRealPanelEntry("task-board", "任务看板");
  createRealPanelEntry("skill-explorer", "技能中心");

  // 2) 在 centerCol 中挂载两层嵌套的主页面 [data-dsh-plugin] 容器，并在 rightbarCol 挂载右侧栏容器
  const mainPanel = env.doc.createElement("div");
  mainPanel.className = "mP3x-q_mainPanel";
  mainPanel.setAttribute("data-global-panel", "true");
  env.centerCol.appendChild(mainPanel);

  const tbView = env.doc.createElement("div");
  tbView.setAttribute("data-dsh-taskboard-view", "");
  tbView.setAttribute("data-dsh-plugin", "task-board");
  const tbBoard = env.doc.createElement("div");
  tbBoard.setAttribute("data-dsh-taskboard-board", "");
  tbBoard.setAttribute("data-dsh-plugin", "task-board");
  tbBoard.innerHTML = '<header><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4"/></svg><span>任务看板全量正文内容不应出现在 Tooltip</span></header>';
  // 模拟曾被旧版误标残留的隐藏类，验证 syncAll() 能自愈清理
  tbView.classList.add("dsh-codex-hide-source");
  tbView.appendChild(tbBoard);
  mainPanel.appendChild(tbView);

  const seView = env.doc.createElement("div");
  seView.setAttribute("data-dsh-skill-explorer-view", "");
  seView.setAttribute("data-dsh-plugin", "skill-explorer");
  const sePanel = env.doc.createElement("div");
  sePanel.setAttribute("data-dsh-plugin", "skill-explorer");
  sePanel.innerHTML = '<div><svg viewBox="0 0 16 16"><path d="M2 2h12"/></svg><h2>技能中心列表正文</h2></div>';
  seView.appendChild(sePanel);
  mainPanel.appendChild(seView);

  const rightbarCol = env.doc.createElement("div");
  rightbarCol.className = "mP3x-q_rightbarCol";
  rightbarCol.setAttribute("data-rightbar-col", "");
  const gitGraphPanel = env.doc.createElement("div");
  gitGraphPanel.setAttribute("data-dsh-plugin", "git-graph");
  gitGraphPanel.innerHTML = '<svg viewBox="0 0 16 16"><circle cx="4" cy="4" r="2"/></svg><span>Git Graph</span>';
  rightbarCol.appendChild(gitGraphPanel);
  env.frame.appendChild(rightbarCol);

  // 3) 侧栏内非交互装饰容器不应被采集
  const decorativeWrap = env.doc.createElement("div");
  decorativeWrap.setAttribute("data-dsh-plugin", "wrapper");
  decorativeWrap.innerHTML = "<span>装饰容器</span>";
  env.sidebarRoot.appendChild(decorativeWrap);

  const cleanup = env.applyPlugin();

  const toolsBox = env.doc.getElementById("dsh-codex-sidebar-tools");
  const keys = Array.from(toolsBox.children).map((b) => b.getAttribute("data-key"));
  assert.deepEqual(keys, ["task-board", "skill-explorer"], "活动栏仅应有任务看板与技能中心 2 个按钮，绝不出现幽灵按钮");

  // 主面板与右侧栏绝不被隐藏（且预先残留的隐藏类必须已被自愈清除）
  for (const el of [tbView, tbBoard, seView, sePanel, gitGraphPanel, decorativeWrap]) {
    assert.equal(el.classList.contains("dsh-codex-hide-source"), false, "非侧栏或非交互节点绝不能被添加 dsh-codex-hide-source");
  }

  // 4) 通过 layout.selectPanel 切换面板时支持 data-dsh-panel-entry 瞬时高亮
  const homeBtn = env.doc.getElementById("dsh-codex-btn-home");
  const tbBtn = toolsBox.children[0];
  const seBtn = toolsBox.children[1];

  env.layout.selectPanel("task-board");
  assert.equal(tbBtn.classList.contains("active"), true, "打开任务看板应瞬时高亮任务看板按钮");
  assert.equal(seBtn.classList.contains("active"), false);
  assert.equal(homeBtn.classList.contains("active"), false);

  env.layout.selectPanel("skill-explorer");
  assert.equal(tbBtn.classList.contains("active"), false);
  assert.equal(seBtn.classList.contains("active"), true, "打开技能中心应瞬时高亮技能中心按钮");
  assert.equal(homeBtn.classList.contains("active"), false);

  env.layout.selectPanel(null);
  assert.equal(tbBtn.classList.contains("active"), false);
  assert.equal(seBtn.classList.contains("active"), false);
  assert.equal(homeBtn.classList.contains("active"), true, "返回对话后应瞬时恢复主页按钮高亮");

  // 5) 侧栏内的合法第三方交互插件按钮（如 dsh-agy-automation）仍可正常采集进入活动栏
  const agyBtn = env.doc.createElement("button");
  agyBtn.type = "button";
  agyBtn.setAttribute("data-dsh-agy-automation-entry", "");
  agyBtn.setAttribute("data-dsh-plugin", "dsh-agy-automation");
  agyBtn.textContent = "AGY 自动化";
  env.sidebarRoot.appendChild(agyBtn);

  await env.flushMicrotasks();
  env.advanceTime(120);

  const keysAfterAgy = Array.from(toolsBox.children).map((b) => b.getAttribute("data-key"));
  assert.deepEqual(keysAfterAgy, ["task-board", "skill-explorer", "dsh-agy-automation"], "合法第三方插件按钮应正常进入活动栏");
  assert.equal(agyBtn.classList.contains("dsh-codex-hide-source"), true);

  // 6) 卸载清理零残留
  cleanup();
  assert.equal(env.doc.querySelectorAll(".dsh-codex-hide-source").length, 0);
  assert.equal(env.stats().timeouts, 0);
  assert.equal(env.stats().intervals, 0);
  assert.equal(env.stats().mutationObservers, 0);
  assert.equal(env.stats().resizeObservers, 0);
  assert.equal(env.stats().winListeners, 0);
  assert.equal(env.stats().docListeners, 0);
  assert.equal(env.stats().panelListeners, 0);
  assert.equal(env.stats().sessionListeners, 0);
});

test("性能优化：零根级 :has()、零通配符拖拽 CSS、GPU 幽灵分割线拦截逐帧重排、Esc 取消与双击还原宽度", async () => {
  const env = createTestEnv();
  env.createPanelRow("plugins", "插件");

  const handle = env.doc.createElement("div");
  handle.className = "mP3x-q_handle";
  handle.setAttribute("data-side", "sidebar");
  handle._rect = { left: 308, top: 40, right: 316, bottom: 800, width: 8, height: 760 };
  env.frame.appendChild(handle);

  const rightHandle = env.doc.createElement("div");
  rightHandle.className = "mP3x-q_handle";
  rightHandle.setAttribute("data-side", "rightbar");
  rightHandle._rect = { left: 826, top: 40, right: 834, bottom: 800, width: 8, height: 760 };
  env.frame.appendChild(rightHandle);

  const rightbarCol = env.doc.createElement("div");
  rightbarCol.className = "mP3x-q_rightbarCol";
  rightbarCol._rect = { left: 830, top: 40, right: 1280, bottom: 800, width: 450, height: 760 };
  env.frame.appendChild(rightbarCol);

  // 模拟宿主 React DragHandle 监听器，统计 pointerdown / pointermove / pointerup / pointercancel 触达次数
  const hostStats = { down: 0, move: 0, up: 0, cancel: 0, lastUpX: null };
  handle.addEventListener("pointerdown", () => { hostStats.down++; });
  handle.addEventListener("pointermove", () => { hostStats.move++; });
  handle.addEventListener("pointerup", (e) => { hostStats.up++; hostStats.lastUpX = e.clientX; });
  handle.addEventListener("pointercancel", () => { hostStats.cancel++; });

  const cleanup = env.applyPlugin();
  const styleText = env.doc.getElementById("dsh-codex-sidebar-style").textContent;
  const html = env.doc.documentElement;

  // 1) 零根级 :has() 与零通配符 * 拖拽样式验证
  const hasLines = styleText.split("\n").filter((line) => line.includes(":has("));
  assert.equal(hasLines.length, 2, "全样式表仅允许保留 #dsh-codex-settings-slot 内部 2 条局部 :has()");
  assert.equal(hasLines.every((line) => line.includes("#dsh-codex-settings-slot")), true);
  assert.equal(/(?:html|body|#root|footArea)[^\s{,]*:(?:not\()?:has\(/.test(styleText), false, "根级或 footer 选择器不得再使用 :has()");
  assert.equal(/data-codex-dragging[^\n{]*\*/.test(styleText), false, "拖拽 CSS 不得包含 * 通配符避免起止帧万级 DOM 重算");
  assert.ok(styleText.includes("contain: layout style"), "应启用 contain 隔离主列重排");
  assert.ok(styleText.includes("#dsh-codex-drag-sash"), "应注入 GPU 幽灵分割线样式");
  assert.ok(styleText.includes("will-change: transform"), "幽灵分割线应开启 GPU 合成层");

  // 2) 惰性 pointermove：非 Peek 且非拖拽状态下不得常驻 document / window pointermove 监听
  const hasPointerMoveDoc = () => env.doc._listeners.some((l) => l.type === "pointermove");
  const hasPointerMoveWin = () => env.win._listeners.some((l) => l.type === "pointermove");
  assert.equal(hasPointerMoveDoc(), false, "非 Peek 状态不得常驻 document pointermove");
  assert.equal(hasPointerMoveWin(), false, "非拖拽状态不得常驻 window pointermove");

  // 3) 按下侧栏手柄：放行 pointerdown 到宿主，同步进入拖拽态并隐藏 Tooltip
  const toolsBox = env.doc.getElementById("dsh-codex-sidebar-tools");
  const pluginBtn = toolsBox.children[0];
  pluginBtn.__hover = true;
  pluginBtn.dispatchEvent({ type: "pointerover", bubbles: true, pointerType: "mouse" });
  env.advanceTime(460);
  const tip = env.doc.getElementById("dsh-codex-floating-tooltip");
  assert.equal(tip.classList.contains("visible"), true);

  handle.dispatchEvent({ type: "pointerdown", button: 0, pointerId: 1, clientX: 312, clientY: 200, bubbles: true });
  assert.equal(hostStats.down, 1, "pointerdown 必须完整放行给宿主 DragHandle");
  assert.equal(html.getAttribute("data-codex-dragging"), "col", "按下横向手柄应立即进入 col 极速拖拽态");
  assert.equal(tip.classList.contains("visible"), false, "拖拽开始应立即收起气泡");
  assert.equal(hasPointerMoveWin(), true, "拖拽期间临时挂载 window 捕获 pointermove");

  // 4) 拖拽移动期间：拦截全部 pointermove 避免宿主逐帧重排，改由纯 translate3d 幽灵分割线预览
  handle.dispatchEvent({ type: "pointermove", pointerId: 1, clientX: 328, clientY: 220, bubbles: true });
  env.advanceTime(20);
  const sash = env.doc.getElementById("dsh-codex-drag-sash");
  const pill = env.doc.getElementById("dsh-codex-drag-sash-pill");
  assert.equal(hostStats.move, 0, "拖拽中 pointermove 必须被拦截，宿主零逐帧重排");
  assert.equal(sash.classList.contains("visible"), true, "幽灵分割线应显现");
  assert.equal(sash.style.transform, "translate3d(328px, 0, 0)");
  assert.equal(pill.textContent, "280 px · 默认", "精确到达 280px 默认宽时应显示默认提示");
  assert.equal(pill.getAttribute("data-at-default"), "1");

  // 超出最大宽度 420px 时幽灵分割线钳位在 420px
  handle.dispatchEvent({ type: "pointermove", pointerId: 1, clientX: 600, clientY: 260, bubbles: true });
  env.advanceTime(20);
  assert.equal(hostStats.move, 0);
  assert.equal(sash.style.transform, "translate3d(468px, 0, 0)");
  assert.equal(pill.textContent, "420 px");
  assert.equal(pill.hasAttribute("data-at-default"), false);

  // 拖拽期间新增工作区插件按钮，syncAll 应被延迟而不打断拖拽帧
  const lateEntry = env.doc.createElement("button");
  lateEntry.type = "button";
  lateEntry.setAttribute("data-dsh-plugin", "late-plugin");
  lateEntry.textContent = "延迟插件";
  env.sidebarRoot.appendChild(lateEntry);

  await env.flushMicrotasks();
  env.advanceTime(200);
  assert.equal(toolsBox.querySelector('[data-key="late-plugin"]'), null, "拖拽期间应冻结 syncAll 避免主线程卡顿");

  // 5) 松开鼠标：放行 pointerup 直达宿主一次性提交最终宽度，清理幽灵分割线并卸载临时监听
  handle.dispatchEvent({ type: "pointerup", button: 0, pointerId: 1, clientX: 360, clientY: 260, bubbles: true });
  assert.equal(hostStats.up, 1, "pointerup 必须放行给宿主一次性提交最终宽度");
  assert.equal(hostStats.lastUpX, 360);
  assert.equal(sash.classList.contains("visible"), false, "松开鼠标后幽灵分割线应隐藏");
  assert.equal(hasPointerMoveWin(), false, "松开鼠标后立即卸载 window pointermove");
  assert.equal(html.hasAttribute("data-codex-dragging"), false, "松开鼠标应立即退出拖拽态");
  env.advanceTime(120);
  assert.ok(toolsBox.querySelector('[data-key="late-plugin"]'), "拖拽结束后应自动补刷挂起的活动栏同步");

  // 6) 右侧栏手柄向左拖拽（clientX 减小，宽度反向增大）与 Esc 取消拦截防提交
  rightHandle.dispatchEvent({ type: "pointerdown", button: 0, pointerId: 2, clientX: 830, clientY: 240, bubbles: true });
  rightHandle.dispatchEvent({ type: "pointermove", pointerId: 2, clientX: 730, clientY: 240, bubbles: true });
  env.advanceTime(20);
  assert.equal(sash.getAttribute("data-side"), "rightbar");
  assert.equal(sash.style.transform, "translate3d(730px, 0, 0)");
  assert.equal(pill.textContent, "550 px", "右侧栏左移 100px 应实时预览 550 px");

  let cancelHit = 0;
  let upAfterCancelHit = 0;
  rightHandle.addEventListener("pointercancel", () => { cancelHit++; });
  rightHandle.addEventListener("pointerup", () => { upAfterCancelHit++; });
  rightHandle.dispatchEvent({ type: "keydown", key: "Escape", bubbles: true });
  assert.equal(cancelHit, 1, "按 Escape 应向手柄派发 pointercancel 通知宿主中止拖拽");
  assert.equal(sash.classList.contains("visible"), false);
  assert.equal(html.hasAttribute("data-codex-dragging"), false);
  rightHandle.dispatchEvent({ type: "pointerup", button: 0, pointerId: 2, clientX: 730, bubbles: true });
  assert.equal(upAfterCancelHit, 0, "Esc 取消后紧随松手的 pointerup 应被拦截以防止误改宽度");

  // 7) 宿主动效驱动的 data-dragging 属性变化也应联动进入/退出极速拖拽态
  env.frame.setAttribute("data-dragging", "true");
  await env.flushMicrotasks();
  assert.equal(html.getAttribute("data-codex-dragging"), "col");
  env.frame.removeAttribute("data-dragging");
  await env.flushMicrotasks();
  assert.equal(html.hasAttribute("data-codex-dragging"), false);

  // 8) 双击侧栏手柄还原默认宽度 280px
  handle.dispatchEvent({ type: "dblclick", bubbles: true });
  assert.equal(env.getLastSidebarWidth(), 280, "双击侧栏拖拽手柄应还原默认宽度 280px");

  // 9) 卸载清理零残留（包括幽灵分割线 DOM 与 html 上的 data-codex-* 属性）
  cleanup();
  assert.equal(env.doc.getElementById("dsh-codex-drag-sash"), null, "卸载后应彻底移除幽灵分割线节点");
  for (const attr of ["data-codex-drawer", "data-codex-collapsed", "data-codex-wallpaper", "data-codex-dragging"]) {
    assert.equal(html.hasAttribute(attr), false, `卸载后 html 不得残留 ${attr}`);
  }
  assert.equal(env.stats().timeouts, 0);
  assert.equal(env.stats().intervals, 0);
  assert.equal(env.stats().mutationObservers, 0);
  assert.equal(env.stats().resizeObservers, 0);
  assert.equal(env.stats().winListeners, 0);
  assert.equal(env.stats().docListeners, 0);
});

test("桌面端润色：折叠态后台运行会话呼吸点、历史导航目标标题与鼠标侧键、再次点击已激活面板返回对话", async () => {
  const env = createTestEnv();

  // 挂载不带 data-panel-id、靠 <svg data-dsh-panel-entry> 标识的面板按钮
  const entry = env.doc.createElement("div");
  entry.className = "wtg9ga_panelEntry";
  const panelBtn = env.doc.createElement("button");
  panelBtn.className = "wtg9ga_panelRow";
  panelBtn.setAttribute("aria-label", "任务看板");
  panelBtn.innerHTML = `<span class="wtg9ga_panelGlyph"><svg data-dsh-panel-entry="task-board" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12"/></svg></span><span class="wtg9ga_panelTitle">任务看板</span>`;
  entry.appendChild(panelBtn);
  env.panelList.appendChild(entry);

  // 挂载带标题与运行状态的会话行
  const row1 = env.doc.createElement("div");
  row1.setAttribute("data-row-key", "session:s-1");
  row1.innerHTML = '<span class="rowTitle">修复拖拽卡顿问题</span>';
  env.regionArea.appendChild(row1);

  const row2 = env.doc.createElement("div");
  row2.setAttribute("data-row-key", "session:s-2");
  row2.innerHTML = '<span class="rowTitle">重构侧边栏微交互细节</span><span data-state="ongoing"></span>';
  env.regionArea.appendChild(row2);

  env.setSession("s-1");
  const cleanup = env.applyPlugin();

  const homeBtn = env.doc.getElementById("dsh-codex-btn-home");
  const toolsBox = env.doc.getElementById("dsh-codex-sidebar-tools");
  const tbBtn = toolsBox.querySelector('[data-key="task-board"]');
  const backBtn = env.doc.getElementById("dsh-codex-btn-back");
  const fwdBtn = env.doc.getElementById("dsh-codex-btn-forward");

  // 1) 折叠后主页按钮显示后台运行会话数量与提示
  assert.equal(homeBtn.getAttribute("data-codex-running-count"), "1");
  env.frame.setAttribute("data-sidebar-collapsed", "true");
  env.sidebarRoot.classList.add("wtg9ga_collapsed");
  await env.flushMicrotasks();
  env.advanceTime(120);
  assert.equal(env.doc.documentElement.getAttribute("data-codex-collapsed"), "1");
  assert.equal(homeBtn.getAttribute("data-tooltip"), "主页与工作区 · 1 个会话运行中");

  // 2) 会话切换后，后退/前进 Tooltip 展示目标会话标题，并支持鼠标侧键 (button=3/4)
  env.setSession("s-2");
  assert.equal(backBtn.getAttribute("data-tooltip"), "后退 · 修复拖拽卡顿问题");
  env.win.dispatchEvent({ type: "mouseup", button: 3, preventDefault() {} });
  env.advanceTime(250);
  assert.equal(env.uiWorkspace.selection.getSnapshot().sessionId, "s-1", "鼠标侧键后退应回到 s-1");
  assert.equal(fwdBtn.getAttribute("data-tooltip"), "前进 · 重构侧边栏微交互细节");
  env.win.dispatchEvent({ type: "mouseup", button: 4, preventDefault() {} });
  env.advanceTime(250);
  assert.equal(env.uiWorkspace.selection.getSnapshot().sessionId, "s-2", "鼠标侧键前进应回到 s-2");

  // 3) 再次点击已激活面板图标直接返回当前对话
  env.layout.selectPanel("task-board");
  assert.equal(backBtn.getAttribute("data-tooltip"), "后退 · 返回对话");
  assert.equal(tbBtn.classList.contains("active"), true);
  tbBtn.click();
  assert.equal(env.layout.panelInfo.getSnapshot().activePanelId, null, "再次点击已激活面板应返回对话");
  assert.equal(tbBtn.classList.contains("active"), false);

  cleanup();
  assert.equal(env.stats().winListeners, 0);
  assert.equal(env.stats().docListeners, 0);
});

test("DSH 0.2.3-alpha 兼容：新 CSS Module 前缀、panelTrailing 角标提取（过滤 visuallyHidden）及 settings.notice 隔离", async () => {
  const env = createTestEnv({ sbPrefix: "hHd-Xa", afPrefix: "pI_x6G" });

  // 1) 构造 0.2.3-alpha 代码审阅面板行，含 sidebar.panel.trailing (navCount + visuallyHidden)
  const reviewEntry = env.doc.createElement("div");
  reviewEntry.className = "hHd-Xa_panelEntry";
  const reviewBtn = env.doc.createElement("button");
  reviewBtn.className = "hHd-Xa_panelRow";
  reviewBtn.setAttribute("aria-label", "代码审阅");
  reviewBtn.innerHTML =
    `<span class="hHd-Xa_panelGlyph"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5"/></svg></span>` +
    `<span class="hHd-Xa_panelTitle">代码审阅</span>` +
    `<span class="hHd-Xa_panelTrailing"><span class="uA1_navCount"><span aria-hidden="true">12</span><span class="uA1_visuallyHidden">12 个待你审阅的变更请求</span></span></span>`;
  reviewEntry.appendChild(reviewBtn);
  env.panelList.appendChild(reviewEntry);

  // 2) 构造 0.2.3-alpha SettingsRoot (noticeRow + triggerRow + AccountNotices + AccountNotifications)
  env.settingsArea.innerHTML = "";
  const noticeRow = env.doc.createElement("div");
  noticeRow.className = "VOzbGW_noticeRow";
  const noticeBox = env.doc.createElement("div");
  noticeBox.className = "VOzbGW_notice";
  const noticesRoot = env.doc.createElement("div");
  noticesRoot.className = "pEg49a_root";
  const stack = env.doc.createElement("div");
  stack.className = "JZqiVa_stack";
  const card = env.doc.createElement("aside");
  card.className = "JZqiVa_card";
  const ctaBtn = env.doc.createElement("button");
  ctaBtn.type = "button";
  ctaBtn.className = "JZqiVa_action";
  ctaBtn.textContent = "立即查看";
  card.appendChild(ctaBtn);
  stack.appendChild(card);
  noticesRoot.appendChild(stack);
  noticeBox.appendChild(noticesRoot);
  noticeRow.appendChild(noticeBox);

  const triggerRow = env.doc.createElement("div");
  triggerRow.className = "VOzbGW_triggerRow";
  const accRoot = env.doc.createElement("div");
  accRoot.className = "yHnPSG_root";
  const accAnchor = env.doc.createElement("span");
  accAnchor.className = "yHnPSG_anchor";
  const accTrigger = env.doc.createElement("button");
  accTrigger.type = "button";
  accTrigger.className = "yHnPSG_trigger";
  accTrigger.innerHTML = '<span class="yHnPSG_avatar">A</span><span class="yHnPSG_label">账号</span>';
  accAnchor.appendChild(accTrigger);
  accRoot.appendChild(accAnchor);
  triggerRow.appendChild(accRoot);

  env.settingsArea.appendChild(noticeRow);
  env.settingsArea.appendChild(triggerRow);

  const cleanup = env.applyPlugin();
  const styleText = env.doc.getElementById("dsh-codex-sidebar-style").textContent;
  assert.ok(styleText.includes(".pI_x6G_frame"), "应正确探测含下划线的 AF 前缀 pI_x6G");
  assert.ok(styleText.includes(".hHd-Xa_panelList"), "应正确探测含连字符的 SB 前缀 hHd-Xa");
  assert.ok(styleText.includes("#dsh-codex-settings-slot [class*=\"_noticeRow\"] > [class*=\"_notice\"]"), "应包含新账号通知容器外展规则");
  assert.equal(styleText.includes("#dsh-codex-settings-slot button {"), false, "不得用宽泛的 #dsh-codex-settings-slot button 压扁账号通知卡片内按钮");

  const toolsBox = env.doc.getElementById("dsh-codex-sidebar-tools");
  const railReviewBtn = toolsBox.querySelector('[data-key="item-代码审阅"]');
  assert.ok(railReviewBtn, "应克隆代码审阅入口按钮");
  assert.equal(railReviewBtn.getAttribute("data-tooltip"), "代码审阅 (12)", "应只提取可见计数并忽略 visuallyHidden 文案");
  assert.equal(railReviewBtn.querySelector(".dsh-codex-badge")?.textContent, "12");

  cleanup();
  assert.equal(env.stats().winListeners, 0);
  assert.equal(env.stats().docListeners, 0);
});
