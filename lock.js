// The original URL is everything after the first "#".
const target = location.hash.slice(1);
const isWebUrl = /^https?:\/\//i.test(target);
const $ = (id) => document.getElementById(id);

try {
  const host = new URL(target).hostname.replace(/^www\./, '');
  $('site').textContent = host;
  document.title = `${host} is locked`;
} catch {
  // Leave the generic heading.
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('submit').disabled = true;
  $('error').textContent = '';

  const res = await chrome.runtime.sendMessage({ type: 'unlock', password: $('password').value, url: target });

  if (res?.ok) {
    if (isWebUrl) location.replace(target);
    else $('error').textContent = 'Unlocked. Open the site again.';
  } else {
    $('error').textContent = res?.error || 'Something went wrong.';
    $('password').select();
    $('submit').disabled = false;
  }
});
