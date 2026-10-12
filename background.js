import { hashPassword, verifyPassword, normalizeDomain, matchSite } from './shared.js';

const LOCK_RULE_ID = 1;
const UNLOCK_RULE_ID = 1;
const GUARD_ID = 'guard';
const DEFAULT_RELOCK_MINUTES = 30;
const DEFAULT_IDLE_MINUTES = 5;

// Wrong-password protection: after FREE_TRIES misses in a row, each further miss
// locks the password box for longer (5s, 10s, 20s ... up to 15m). Kept in local
// storage so restarting the browser doesn't reset it.
const FREE_TRIES = 5;
const BASE_COOLDOWN_MS = 5_000;
const MAX_COOLDOWN_MS = 15 * 60_000;

const EXT_ROOT = chrome.runtime.getURL('');
const lockPageUrl = () => chrome.runtime.getURL('lock.html');

async function getSettings() {
  const {
    sites = [], auth = null,
    relockMinutes = DEFAULT_RELOCK_MINUTES,
    idleMinutes = DEFAULT_IDLE_MINUTES
  } = await chrome.storage.local.get(['sites', 'auth', 'relockMinutes', 'idleMinutes']);
  return { sites, auth, relockMinutes, idleMinutes };
}

// Session storage clears when the browser closes, so every site re-locks on restart.
async function getUnlocked() {
  const { unlocked = {} } = await chrome.storage.session.get('unlocked');
  return unlocked;
}

const isOpen = (until) => until !== undefined && (until === 0 || until > Date.now());

// ---------- Rules ----------

// Persistent rule: redirect any top-level visit to a locked site to lock.html#<original url>.
async function syncLockRule(sites) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [LOCK_RULE_ID],
    addRules: sites.length ? [{
      id: LOCK_RULE_ID,
      priority: 1,
      action: { type: 'redirect', redirect: { regexSubstitution: `${lockPageUrl()}#\\1` } },
      condition: { regexFilter: '^(.*)$', requestDomains: sites, resourceTypes: ['main_frame'] }
    }] : []
  });
}

// Session rule: higher priority "allow" for sites unlocked in this browser session.
async function syncUnlockRule(unlocked) {
  const domains = Object.keys(unlocked);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [UNLOCK_RULE_ID],
    addRules: domains.length ? [{
      id: UNLOCK_RULE_ID,
      priority: 2,
      action: { type: 'allow' },
      condition: { requestDomains: domains, resourceTypes: ['main_frame'] }
    }] : []
  });
}

// The network rule can't catch pages the browser shows without a new request,
// such as pressing Back (back/forward cache) or a tab left open. guard.js runs on
// locked sites before the page paints and sends the tab to the lock screen.
async function syncGuard(sites) {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [GUARD_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [GUARD_ID] });
  if (!sites.length) return;
  await chrome.scripting.registerContentScripts([{
    id: GUARD_ID,
    js: ['guard.js'],
    matches: sites.flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`]),
    runAt: 'document_start',
    allFrames: false,
    persistAcrossSessions: true
  }]);
}

async function syncAll() {
  const { sites, idleMinutes } = await getSettings();
  await syncLockRule(sites);
  await syncGuard(sites);
  await syncUnlockRule(await getUnlocked());
  applyIdleInterval(idleMinutes);
}

// ---------- Locking ----------

// Send open tabs of these domains to the lock page. location.replace() swaps the
// history entry, so pressing Back doesn't land on the private page.
async function lockOpenTabs(domains) {
  if (!domains.length) return;
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (!tab.url || !matchSite(tab.url, domains)) return;
    const url = `${lockPageUrl()}#${tab.url}`;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (u) => location.replace(u),
        args: [url]
      });
    } catch {
      chrome.tabs.update(tab.id, { url }); // discarded or not scriptable tab
    }
  }));
}

async function relock(domains) {
  const unlocked = await getUnlocked();
  for (const d of domains) {
    delete unlocked[d];
    chrome.alarms.clear(`relock:${d}`);
  }
  await chrome.storage.session.set({ unlocked });
  await syncUnlockRule(unlocked);
  await lockOpenTabs(domains);
}

async function lockAll() {
  const { sites } = await getSettings();
  await relock(sites);
}

// ---------- Password + lockout ----------

async function getLockout() {
  const { lockout = { fails: 0, until: 0 } } = await chrome.storage.local.get('lockout');
  return lockout;
}

const waitMessage = (until) => {
  const s = Math.ceil((until - Date.now()) / 1000);
  return s >= 60 ? `Too many tries. Wait ${Math.ceil(s / 60)} min.` : `Too many tries. Wait ${s}s.`;
};

// Returns { ok: true } or { error, retryAt? }.
async function checkPassword(password) {
  const lockout = await getLockout();
  if (lockout.until > Date.now()) return { error: waitMessage(lockout.until), retryAt: lockout.until };

  const { auth } = await getSettings();
  if (await verifyPassword(password || '', auth)) {
    if (lockout.fails) await chrome.storage.local.set({ lockout: { fails: 0, until: 0 } });
    return { ok: true };
  }

  const fails = lockout.fails + 1;
  const over = fails - FREE_TRIES;
  const until = over > 0 ? Date.now() + Math.min(BASE_COOLDOWN_MS * 2 ** (over - 1), MAX_COOLDOWN_MS) : 0;
  await chrome.storage.local.set({ lockout: { fails, until } });
  await new Promise((r) => setTimeout(r, 600)); // slow down guessing
  if (until) return { error: waitMessage(until), retryAt: until };
  const left = FREE_TRIES - fails;
  return { error: left <= 2 ? `Wrong password. ${left} ${left === 1 ? 'try' : 'tries'} left before a wait.` : 'Wrong password.' };
}

const validNewPassword = (pw) => typeof pw === 'string' && pw.length >= 4;

// ---------- Auto-lock when you walk away ----------

function applyIdleInterval(idleMinutes) {
  // "idle" fires after this many seconds without input. 15s is the API minimum.
  chrome.idle.setDetectionInterval(Math.max(15, (idleMinutes || 60) * 60));
}

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === 'locked') return lockAll(); // screen locked or laptop lid closed
  if (state === 'idle') {
    const { idleMinutes } = await getSettings();
    if (idleMinutes > 0) await lockAll();
  }
});

// ---------- Messages ----------

// Handlers only the extension's own pages (popup, lock screen) may call.
const handlers = {
  async getState() {
    const { sites, auth, relockMinutes, idleMinutes } = await getSettings();
    const all = await chrome.commands.getAll();
    const shortcut = all.find((c) => c.name === 'lock-all')?.shortcut || '';
    const lockout = await getLockout();
    return {
      hasPassword: !!auth, sites, relockMinutes, idleMinutes, shortcut,
      unlocked: await getUnlocked(),
      retryAt: lockout.until > Date.now() ? lockout.until : 0
    };
  },

  async setup({ password }) {
    const current = await getSettings();
    if (current.auth) return { error: 'A password is already set.' };
    if (!validNewPassword(password)) return { error: 'Use at least 4 characters.' };
    await chrome.storage.local.set({ auth: await hashPassword(password), lockout: { fails: 0, until: 0 } });
    await syncAll();
    return { ok: true };
  },

  async verify({ password }) {
    return checkPassword(password);
  },

  async unlock({ password, url }) {
    const { sites, relockMinutes } = await getSettings();
    const domain = matchSite(url, sites);
    if (!domain) return { ok: true }; // no longer locked
    const res = await checkPassword(password);
    if (!res.ok) return res;

    const unlocked = await getUnlocked();
    unlocked[domain] = relockMinutes > 0 ? Date.now() + relockMinutes * 60000 : 0;
    await chrome.storage.session.set({ unlocked });
    await syncUnlockRule(unlocked);
    if (relockMinutes > 0) chrome.alarms.create(`relock:${domain}`, { delayInMinutes: relockMinutes });
    return { ok: true };
  },

  // Adding a site only makes things stricter, so it doesn't need the password.
  async addSite({ domain }) {
    const d = normalizeDomain(domain);
    if (!d) return { error: 'That doesn\'t look like a website.' };
    const { sites, auth } = await getSettings();
    if (!auth) return { error: 'Set a password first.' };
    if (!sites.includes(d)) {
      const next = [...sites, d];
      await chrome.storage.local.set({ sites: next });
      await syncLockRule(next);
      await syncGuard(next);
    }
    await relock([d]);
    return { ok: true, domain: d };
  },

  async removeSite({ domain, password }) {
    const res = await checkPassword(password);
    if (!res.ok) return res;
    const { sites } = await getSettings();
    const next = sites.filter((s) => s !== domain);
    await chrome.storage.local.set({ sites: next });
    await syncLockRule(next);
    await syncGuard(next);
    const unlocked = await getUnlocked();
    delete unlocked[domain];
    chrome.alarms.clear(`relock:${domain}`);
    await chrome.storage.session.set({ unlocked });
    await syncUnlockRule(unlocked);
    return { ok: true };
  },

  async lockNow({ domain }) {
    if (domain) await relock([domain]); else await lockAll();
    return { ok: true };
  },

  async setRelock({ minutes, password }) {
    const res = await checkPassword(password);
    if (!res.ok) return res;
    await chrome.storage.local.set({ relockMinutes: Math.max(0, Number(minutes) || 0) });
    return { ok: true };
  },

  async setIdle({ minutes, password }) {
    const res = await checkPassword(password);
    if (!res.ok) return res;
    const idleMinutes = Math.max(0, Number(minutes) || 0);
    await chrome.storage.local.set({ idleMinutes });
    applyIdleInterval(idleMinutes);
    return { ok: true };
  },

  async changePassword({ password, newPassword }) {
    if (!validNewPassword(newPassword)) return { error: 'Use at least 4 characters.' };
    const res = await checkPassword(password);
    if (!res.ok) return { ...res, error: res.retryAt ? res.error : 'Current password is wrong.' };
    await chrome.storage.local.set({ auth: await hashPassword(newPassword) });
    return { ok: true };
  }
};

// The one thing a web page's guard script may ask: "should this tab be locked?"
// The URL comes from the browser (sender.url), never from the page.
async function guardCheck(sender) {
  const url = sender.url || '';
  const { sites } = await getSettings();
  const domain = matchSite(url, sites);
  if (!domain) return { locked: false };
  const unlocked = await getUnlocked();
  if (isOpen(unlocked[domain])) return { locked: false };
  return { locked: true, lockUrl: `${lockPageUrl()}#${url}` };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const fromExtensionPage = (sender.url || '').startsWith(EXT_ROOT) && !sender.tab?.url?.startsWith('http');
  let task;
  if (msg?.type === 'guardCheck') task = guardCheck(sender);
  else if (fromExtensionPage && handlers[msg?.type]) task = handlers[msg.type](msg);
  else return false;
  task.then(sendResponse).catch((e) => sendResponse({ error: String(e?.message || e) }));
  return true; // async response
});

// ---------- Events ----------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('relock:')) relock([alarm.name.slice('relock:'.length)]);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'lock-all') lockAll();
});

chrome.runtime.onInstalled.addListener(syncAll);
chrome.runtime.onStartup.addListener(syncAll);

// The service worker can restart at any time; keep the idle timer in step.
getSettings().then(({ idleMinutes }) => applyIdleInterval(idleMinutes));
