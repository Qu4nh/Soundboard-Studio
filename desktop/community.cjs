const API = 'https://api.voicemod.net/v1/content-hub/sounds/';
const HEADERS = { 'app-name': 'tuna', 'app-os': 'windows', 'app-version': '8.42.0', prefer: 'return=usage-data,return=seo' };
function safeURL(input) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || !(url.hostname === 'voicemod.net' || url.hostname.endsWith('.voicemod.net')) || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Chỉ hỗ trợ nội dung HTTPS từ Voicemod.');
  return url;
}
async function request(url, options = {}, fetcher = fetch) {
  let current = safeURL(url);
  for (let i = 0; i < 5; i++) {
    const response = await fetcher(current, { ...options, redirect: 'manual', signal: AbortSignal.timeout(25000) });
    if ([301,302,303,307,308].includes(response.status)) { current = safeURL(new URL(response.headers.get('location'), current)); continue; }
    if (!response.ok) throw new Error(`Thư viện trả về HTTP ${response.status}.`);
    return response;
  }
  throw new Error('Quá nhiều chuyển hướng.');
}
function normalize(item) {
  if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || !item.audio?.url || item.locked || (item.publicStatus && item.publicStatus !== 'published')) return null;
  try { safeURL(item.audio.url); if (item.icon?.url) safeURL(item.icon.url); } catch { return null; }
  const categories=(item.publicInfo?.categories||[]).filter(x=>typeof x==='string');
  return { id: item.id, name: String(item.name || 'Untitled').slice(0,200), author: String(item.publicInfo?.ownerName || 'Community'), image: item.icon?.url || '', audioUrl: item.audio.url, remoteHash: item.audio.hash || '', duration: (Number(item.duration) || 0) / 1000, tags: (item.publicInfo?.tags || []).filter(x=>typeof x==='string').slice(0,20), categories,category: categories[0] || 'other', plays: Number(item.vm_usage?.soundhits || item.vmUsage?.soundHits || 0), source: 'community', sourceUrl: `https://tuna.voicemod.net/sound/${item.id}` };
}
async function query({ text = '', sort = 'trending', tag = '', category = '', next = null, size = 40 } = {}, fetcher) {
  const url = new URL(API);
  url.search = new URLSearchParams({ 'audio-format':'mp3', custom:'true', published:'true', sort: '-' + (['trending','created'].includes(sort) ? sort : 'trending'), size: String(Math.min(100, Math.max(1, size))), ...(text ? {text: String(text).slice(0,200)} : {}), ...(tag ? {tag: String(tag).slice(0,80)} : {}), ...(category ? {category: String(category).slice(0,80)} : {}), ...(next ? {next: String(next).slice(0,2048)} : {}) });
  const data = await (await request(url, {headers:HEADERS}, fetcher)).json();
  if (!Array.isArray(data.items)) throw new Error('Định dạng thư viện đã thay đổi.');
  return { items: data.items.map(normalize).filter(Boolean), next: data.next || (typeof data.cursor==='string'?data.cursor:data.cursor?.next) || null };
}
async function detail(id) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('ID âm thanh không hợp lệ.');
  return normalize(await (await request(API + id + '?audio-format=mp3', {headers:HEADERS})).json());
}
module.exports = { query, normalize, request, safeURL, detail, API };
