// Run in a YouTube, TikTok, Instagram or Twitch profile tab. Returns the follower count as a number, or null.
await new Promise(r => setTimeout(r, 3000));
const t = document.body.innerText; let n = null;
try { const s = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__'); if (s) n = JSON.parse(s.textContent).__DEFAULT_SCOPE__['webapp.user-detail'].userInfo.stats.followerCount; } catch (e) {}
if (n == null) {
  const m = t.match(/([\d.,]+)\s*([KkMm])?\s*(followers|subscribers)/i) || (document.querySelector('meta[name="description"]')?.content || '').match(/([\d.,]+)\s*([KkMm])?\s*followers/i);
  if (m) n = Math.round(parseFloat(m[1].replace(/,/g, '')) * (/k/i.test(m[2] || '') ? 1e3 : /m/i.test(m[2] || '') ? 1e6 : 1));
}
n
