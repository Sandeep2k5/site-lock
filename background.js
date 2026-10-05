import { hashPassword, verifyPassword, normalizeDomain, matchSite } from './shared.js';

const LOCK_RULE_ID = 1;
const UNLOCK_RULE_ID = 1;
const DEFAULT_RELOCK_MINUTES = 30;
const lockPageUrl = () => chrome.runtime.getURL('lock.html');

async function getSettings() {
  const { sites = [], auth = null, relockMinutes = DEFAULT_RELOCK_MINUTES } =
    await chrome.storage.local.get(['sites', 'auth', 'relockMinutes']);
  return { sites, auth, relockMinutes };
}

// Session storage clears when the browser closes, so every site re-locks on restart.
async function getUnlocked() {
  const { unlocked = {} } = await chrome.storage.session.get('unlocked');
  return unlocked;
}

// Persistent rule: redirect any top-level visit to a locked site to lock.html#<original url>.
async function syncLockRule() {
  const { sites } = await getSettings();
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

// Send already-open tabs of these domains to the lock page.
async function lockOpenTabs(domains) {
  if (!domains.length) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && matchSite(tab.url, domains)) {
      chrome.tabs.update(tab.id, { url: `${lockPageUrl()}#${tab.url}` });
    }
  }
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

async function checkPassword(password) {
  const { auth } = await getSettings();
  const ok = await verifyPassword(password || '', auth);
  if (!ok) await new Promise((r) => setTimeout(r, 800)); // slow down guessing
  return ok;
}

const handlers = {
  async getState() {
    const { sites, auth, relockMinutes } = await getSettings();
    return { hasPassword: !!auth, sites, relockMinutes, unlocked: await getUnlocked() };
  },

  async setup({ password }) {
    const { auth } = await getSettings();
    if (auth) return { error: 'A password is already set.' };
    if (!password || password.length < 4) return { error: 'Use at least 4 characters.' };
    await chrome.storage.local.set({ auth: await hashPassword(password) });
    return { ok: true };
  },

  async verify({ password }) {
    return (await checkPassword(password)) ? { ok: true } : { error: 'Wrong password.' };
  },

  async unlock({ password, url }) {
    const { sites, relockMinutes } = await getSettings();
    const domain = matchSite(url, sites);
    if (!domain) return { ok: true }; // no longer locked
    if (!(await checkPassword(password))) return { error: 'Wrong password.' };

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
    if (!d) return { error: 'Not a valid site.' };
    const { sites, auth } = await getSettings();
    if (!auth) return { error: 'Set a password first.' };
    if (!sites.includes(d)) {
      await chrome.storage.local.set({ sites: [...sites, d] });
      await syncLockRule();
    }
    await relock([d]);
    return { ok: true, domain: d };
  },

  async removeSite({ domain, password }) {
    if (!(await checkPassword(password))) return { error: 'Wrong password.' };
    const { sites } = await getSettings();
    await chrome.storage.local.set({ sites: sites.filter((s) => s !== domain) });
    await syncLockRule();
    const unlocked = await getUnlocked();
    delete unlocked[domain];
    chrome.alarms.clear(`relock:${domain}`);
    await chrome.storage.session.set({ unlocked });
    await syncUnlockRule(unlocked);
    return { ok: true };
  },

  async lockNow({ domain }) {
    const unlocked = await getUnlocked();
    await relock(domain ? [domain] : Object.keys(unlocked));
    return { ok: true };
  },

  async setRelock({ minutes, password }) {
    if (!(await checkPassword(password))) return { error: 'Wrong password.' };
    await chrome.storage.local.set({ relockMinutes: Math.max(0, Number(minutes) || 0) });
    return { ok: true };
  },

  async changePassword({ password, newPassword }) {
    if (!newPassword || newPassword.length < 4) return { error: 'Use at least 4 characters.' };
    if (!(await checkPassword(password))) return { error: 'Current password is wrong.' };
    await chrome.storage.local.set({ auth: await hashPassword(newPassword) });
    return { ok: true };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from this extension's own pages.
  if (sender.id !== chrome.runtime.id || !handlers[msg?.type]) return false;
  handlers[msg.type](msg)
    .then(sendResponse)
    .catch((e) => sendResponse({ error: String(e?.message || e) }));
  return true; // async response
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('relock:')) relock([alarm.name.slice('relock:'.length)]);
});

chrome.runtime.onInstalled.addListener(async () => {
  await syncLockRule();
  await syncUnlockRule(await getUnlocked());
});

chrome.runtime.onStartup.addListener(syncLockRule);
