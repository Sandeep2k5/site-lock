import { matchSite, normalizeDomain } from './shared.js';

const $ = (id) => document.getElementById(id);
const send = (type, data = {}) => chrome.runtime.sendMessage({ type, ...data });

// Held in memory only while the popup is open, after the user enters it once.
let password = null;
let state = null;
let currentUrl = null;
let dismissed = false; // "Not now" on the lock prompt

function faviconFor(domain) {
  const img = document.createElement('img');
  img.className = 'favicon';
  img.alt = '';
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', `https://${domain}/`);
  u.searchParams.set('size', '32');
  img.src = u.href;
  return img;
}

function show(view) {
  for (const v of ['setup', 'main', 'manage']) $(`view-${v}`).classList.toggle('hidden', v !== view);
  $('back').classList.toggle('hidden', view !== 'manage');
}

const timeOf = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const isOpen = (until) => until !== undefined && (until === 0 || until > Date.now());
const isWeb = () => !!currentUrl && /^https?:/.test(currentUrl);

async function refresh() {
  state = await send('getState');
  if (!state.hasPassword) return renderSetup();
  if (password) renderManage(); else renderMain();
}

// ---------- Setup ----------
function renderSetup() {
  show('setup');
  $('setup-pw').focus();
}

$('setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('setup-pw').value !== $('setup-pw2').value) {
    $('setup-error').textContent = 'The two passwords don\'t match.';
    return;
  }
  const res = await send('setup', { password: $('setup-pw').value });
  if (res?.error) { $('setup-error').textContent = res.error; return; }
  $('setup-pw').value = $('setup-pw2').value = '';
  await refresh(); // lands on the main view, which asks about the current site
});

// ---------- Main ----------
function renderMain() {
  show('main');
  const domain = isWeb() ? matchSite(currentUrl, state.sites) : null;
  const host = isWeb() ? normalizeDomain(currentUrl) : '';

  // Not locked yet: ask whether to lock this site.
  const ask = isWeb() && !domain && host && !dismissed;
  $('ask').classList.toggle('hidden', !ask);
  if (ask) {
    $('ask-host').textContent = host;
    $('ask-icon').src = faviconFor(host).src;
    $('ask-yes').focus();
  }

  // Already on the list: show its status.
  $('current').classList.toggle('hidden', !domain);
  if (domain) {
    const btn = $('current-action');
    const status = $('current-status');
    $('current-host').textContent = domain;
    $('current-icon').src = faviconFor(domain).src;
    status.classList.remove('is-open');
    btn.className = '';
    btn.disabled = false;
    if (isOpen(state.unlocked[domain])) {
      const until = state.unlocked[domain];
      status.textContent = until ? `Unlocked until ${timeOf(until)}` : 'Unlocked until you close the browser';
      status.classList.add('is-open');
      btn.textContent = 'Lock now';
      btn.onclick = () => act(send('lockNow', { domain }), `Locked ${domain}.`);
    } else {
      status.textContent = 'Locked';
      btn.textContent = 'Locked';
      btn.className = 'quiet';
      btn.disabled = true;
    }
  }

  const openCount = state.sites.filter((d) => isOpen(state.unlocked[d])).length;
  const n = state.sites.length;
  $('summary').textContent = !n
    ? 'No sites locked yet. Open a site you want to protect, then click Site Lock.'
    : openCount
      ? `${openCount} of ${n} ${n === 1 ? 'site is' : 'sites are'} unlocked right now.`
      : n === 1 ? 'Your site is locked.' : `All ${n} sites are locked.`;
  $('summary').classList.toggle('hidden', !n && !$('ask').classList.contains('hidden'));
  $('lock-all').classList.toggle('hidden', !n);
  $('lock-all').disabled = !openCount;
  if (state.shortcut) {
    $('shortcut').textContent = state.shortcut;
    $('shortcut').classList.remove('hidden');
  }
}

async function act(promise, okMsg) {
  const res = await promise;
  $('main-msg').className = res?.ok ? 'ok' : 'error';
  $('main-msg').textContent = res?.ok ? okMsg : res?.error || 'Something went wrong.';
  await refresh();
}

$('ask-yes').addEventListener('click', () => {
  const host = normalizeDomain(currentUrl);
  act(send('addSite', { domain: currentUrl }), `Locked ${host}. You'll need your password to open it.`);
});
$('ask-no').addEventListener('click', () => { dismissed = true; renderMain(); });

$('lock-all').addEventListener('click', () => act(send('lockNow'), 'Everything is locked.'));

$('open-manage').addEventListener('click', () => {
  $('open-manage').classList.add('hidden');
  $('auth-form').classList.remove('hidden');
  $('main-msg').textContent = '';
  $('auth-pw').focus();
});

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('auth-pw').value;
  const res = await send('verify', { password: pw });
  $('auth-pw').value = '';
  if (!res?.ok) {
    $('main-msg').className = 'error';
    $('main-msg').textContent = res?.error || 'Wrong password.';
    return;
  }
  password = pw;
  $('auth-form').classList.add('hidden');
  $('open-manage').classList.remove('hidden');
  $('main-msg').textContent = '';
  await refresh();
});

// ---------- Manage ----------
function manageMsg(text, ok = false) {
  $('manage-msg').className = ok ? 'ok' : 'error';
  $('manage-msg').textContent = text;
}

function renderManage() {
  show('manage');
  const list = $('site-list');
  list.replaceChildren();
  if (!state.sites.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing is locked. Add a site below.';
    list.append(li);
  }
  for (const domain of state.sites) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = domain;
    name.title = domain;
    li.append(faviconFor(domain), name);
    if (isOpen(state.unlocked[domain])) {
      const tag = document.createElement('span');
      tag.className = 'open-tag';
      tag.textContent = 'Unlocked';
      li.append(tag);
    }
    const remove = document.createElement('button');
    remove.className = 'danger-link';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${domain}`);
    remove.onclick = async () => {
      const res = await send('removeSite', { domain, password });
      manageMsg(res?.error || '');
      await refresh();
    };
    li.append(remove);
    list.append(li);
  }
  $('relock').value = String(state.relockMinutes);
  $('idle').value = String(state.idleMinutes);
}

$('back').addEventListener('click', async () => {
  password = null;
  manageMsg('');
  await refresh();
});

$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await send('addSite', { domain: $('add-domain').value });
  manageMsg(res?.error || '');
  if (res?.ok) $('add-domain').value = '';
  await refresh();
});

$('relock').addEventListener('change', async () => {
  const res = await send('setRelock', { minutes: $('relock').value, password });
  manageMsg(res?.error || 'Saved.', !res?.error);
});

$('idle').addEventListener('change', async () => {
  const res = await send('setIdle', { minutes: $('idle').value, password });
  manageMsg(res?.error || 'Saved.', !res?.error);
});

$('pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPassword = $('new-pw').value;
  const res = await send('changePassword', { password, newPassword });
  if (res?.ok) {
    password = newPassword;
    $('new-pw').value = '';
    manageMsg('Password changed.', true);
  } else {
    manageMsg(res?.error || 'Something went wrong.');
  }
});

// ---------- Init ----------
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
currentUrl = tab?.url || null;
await refresh();
