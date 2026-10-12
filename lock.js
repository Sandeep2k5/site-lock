// Never work inside a frame: a page could try to overlay or click-jack the lock screen.
if (window.top !== window) {
  document.documentElement.textContent = '';
  throw new Error('Site Lock refuses to run in a frame.');
}

// The original URL is everything after the first "#".
const target = location.hash.slice(1);
const isWebUrl = /^https?:\/\//i.test(target);
const $ = (id) => document.getElementById(id);
const send = (type, data = {}) => chrome.runtime.sendMessage({ type, ...data });

// ----- Site name + icon -----
let host = '';
try { host = new URL(target).hostname.replace(/^www\./, ''); } catch { /* generic heading */ }
if (host) {
  const name = host;
  $('site').textContent = `${name} is locked`;
  document.title = `${name} is locked`;
  const icon = new URL(chrome.runtime.getURL('/_favicon/'));
  icon.searchParams.set('pageUrl', target);
  icon.searchParams.set('size', '64');
  $('favicon').src = icon.href;
} else {
  $('favicon').remove();
}

// ----- Clock -----
const fmt = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });
const tick = () => { $('clock').textContent = fmt.format(new Date()).replace(/\s?[AP]M$/i, ''); };
tick();
setInterval(tick, 10_000);

// ----- Too-many-tries countdown -----
let countdown = null;
function holdUntil(retryAt) {
  clearInterval(countdown);
  const input = $('password');
  const btn = $('submit');
  const update = () => {
    const s = Math.ceil((retryAt - Date.now()) / 1000);
    if (s <= 0) {
      clearInterval(countdown);
      input.disabled = btn.disabled = false;
      input.placeholder = 'Password';
      $('error').textContent = '';
      input.focus();
      return;
    }
    input.disabled = btn.disabled = true;
    input.value = '';
    input.placeholder = s >= 60 ? `Try again in ${Math.ceil(s / 60)} min` : `Try again in ${s}s`;
  };
  update();
  countdown = setInterval(update, 1000);
}

// ----- Unlock -----
function fail(message) {
  const form = $('form');
  $('error').textContent = message;
  form.classList.remove('shake');
  void form.offsetWidth; // restart the animation
  form.classList.add('shake');
  $('password').select();
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('password');
  $('submit').disabled = true;
  $('error').textContent = '';

  const res = await send('unlock', { password: input.value, url: target });
  input.value = '';

  if (res?.ok) {
    if (isWebUrl) location.replace(target);
    else $('error').textContent = 'Unlocked. Open the site again.';
    return;
  }
  $('submit').disabled = false;
  fail(res?.error || 'Something went wrong. Try again.');
  if (res?.retryAt) holdUntil(res.retryAt);
});

// Already in a cooldown when the page opens?
send('getState').then((state) => {
  if (state?.retryAt) holdUntil(state.retryAt);
  if (!state?.hasPassword) $('hint').textContent = 'Open Site Lock from the toolbar to set a password.';
});
