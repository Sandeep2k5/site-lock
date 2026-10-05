import { matchSite, normalizeDomain } from './shared.js';

const $ = (id) => document.getElementById(id);
const send = (type, data = {}) => chrome.runtime.sendMessage({ type, ...data });

// Held in memory only while the popup is open, after the user enters it once.
let password = null;
let state = null;
let currentUrl = null;

function show(view) {
  for (const v of ['setup', 'main', 'manage']) $(`view-${v}`).classList.toggle('hidden', v !== view);
}

async function refresh() {
  state = await send('getState');
  if (!state.hasPassword) return show('setup');
  if (password) renderManage(); else renderMain();
}

function renderMain() {
  show('main');
  const isWeb = currentUrl && /^https?:/.test(currentUrl);
  $('current').classList.toggle('hidden', !isWeb);
  if (!isWeb) return;

  const domain = matchSite(currentUrl, state.sites);
  const btn = $('current-action');
  btn.className = '';
  btn.disabled = false;
  if (!domain) {
    $('current-host').textContent = normalizeDomain(currentUrl);
    $('current-status').textContent = 'Not locked';
    btn.textContent = 'Lock this site';
    btn.onclick = () => act(send('addSite', { domain: currentUrl }), 'Site locked.');
  } else if (state.unlocked[domain] !== undefined) {
    $('current-host').textContent = domain;
    const until = state.unlocked[domain];
    $('current-status').textContent = until
      ? `Unlocked until ${new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : 'Unlocked until the browser closes';
    btn.textContent = 'Lock it again now';
    btn.onclick = () => act(send('lockNow', { domain }), 'Locked.');
  } else {
    $('current-host').textContent = domain;
    $('current-status').textContent = 'Locked';
    btn.textContent = 'Locked';
    btn.className = 'secondary';
    btn.disabled = true;
  }
}

async function act(promise, okMsg) {
  const res = await promise;
  $('main-msg').className = res?.ok ? 'ok' : 'error';
  $('main-msg').textContent = res?.ok ? okMsg : res?.error || 'Something went wrong.';
  await refresh();
}

function manageMsg(text, ok = false) {
  $('manage-msg').className = ok ? 'ok' : 'error';
  $('manage-msg').textContent = text;
}

function renderManage() {
  show('manage');
  const list = $('site-list');
  list.replaceChildren();
  if (!state.sites.length) {
    list.innerHTML = '<li class="empty">No sites yet. Add one above.</li>';
  }
  for (const domain of state.sites) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = domain;
    const remove = document.createElement('button');
    remove.className = 'danger';
    remove.textContent = 'Remove';
    remove.onclick = async () => {
      const res = await send('removeSite', { domain, password });
      manageMsg(res?.error || '');
      await refresh();
    };
    li.append(name, remove);
    list.append(li);
  }
  $('relock').value = String(state.relockMinutes);
}

// --- Setup ---
$('setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('setup-pw').value !== $('setup-pw2').value) {
    $('setup-error').textContent = 'Passwords do not match.';
    return;
  }
  const res = await send('setup', { password: $('setup-pw').value });
  if (res?.error) { $('setup-error').textContent = res.error; return; }
  await refresh();
});

// --- Main ---
$('lock-all').addEventListener('click', () => act(send('lockNow'), 'All sites locked.'));

$('open-manage').addEventListener('click', () => {
  $('auth-form').classList.remove('hidden');
  $('auth-pw').focus();
});

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('auth-pw').value;
  const res = await send('verify', { password: pw });
  if (!res?.ok) { $('auth-error').textContent = res?.error || 'Wrong password.'; return; }
  password = pw;
  $('auth-pw').value = '';
  $('auth-form').classList.add('hidden');
  await refresh();
});

// --- Manage ---
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
  manageMsg(res?.error || '');
});

$('pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPassword = $('new-pw').value;
  const res = await send('changePassword', { password, newPassword });
  if (res?.ok) {
    password = newPassword;
    $('new-pw').value = '';
    manageMsg('Password updated.', true);
  } else {
    manageMsg(res?.error || 'Something went wrong.');
  }
});

// --- Init ---
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
currentUrl = tab?.url || null;
await refresh();
