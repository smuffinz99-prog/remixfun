'use strict';
// Remix.fun front end. Loaded as a same-origin file so the Content-Security-Policy can forbid all inline script.

// Refuse to run inside someone else's frame (clickjacking).
if (window.top !== window.self) {
  document.body.textContent = 'Remix.fun can only be used directly at https://smuffinz99-prog.github.io/remixfun/';
  throw new Error('framed');
}

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short = a => a.slice(0,4)+'…'+a.slice(-4);
const NET = new URLSearchParams(location.search).has('devnet') ? 'devnet' : 'mainnet';
// Fixed RPC endpoints only: a URL parameter that swaps the RPC would let a phishing link feed the page fake data.
const RPC = NET === 'devnet' ? 'https://api.devnet.solana.com' : 'https://solana-rpc.publicnode.com';
const W = solanaWeb3, conn = new W.Connection(RPC, 'confirmed'), L = RemixCore.makeLauncher(W), clean = RemixCore.clean;
const CL = NET === 'devnet' ? '?cluster=devnet' : '';
const LAUNCH_SOL = 0.017;
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const safeImg = u => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '';
const safeDex = u => typeof u === 'string' && /^https:\/\/dexscreener\.com\/[\w\-/]+$/.test(u) ? u : '';

const ROOTS = [
  {id:'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', name:'Bonk', t:'BONK', e:'🐕'},
  {id:'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', name:'dogwifhat', t:'WIF', e:'🧢'},
  {id:'7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', name:'Popcat', t:'POPCAT', e:'🐱'},
  {id:'2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv', name:'Pudgy Penguins', t:'PENGU', e:'🐧'},
  {id:'9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', name:'Fartcoin', t:'FARTCOIN', e:'💨'},
  {id:'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', name:'cat in a dogs world', t:'MEW', e:'😼'},
];
const OG = {id:'__og', name:'New families', t:'NEW OGs', e:'🌱', virtual:true};
const EXAMPLE = [
  {id:'x-vinny',name:'Vinny',t:'VINNY',e:'🐸',p:null,mc:48.2e6,ch:12.4},
  {id:'x-vjr',name:'Vinny Jr',t:'VJR',e:'🐣',p:'x-vinny',mc:12.1e6,ch:44.2},
  {id:'x-evil',name:'Evil Vinny',t:'EVINNY',e:'😈',p:'x-vinny',mc:21.7e6,ch:88.1},
  {id:'x-vgf',name:"Vinny's GF",t:'VGF',e:'💅',p:'x-vinny',mc:3.4e6,ch:-11.2},
  {id:'x-vjj',name:'Vinny Jr Jr',t:'VJJ',e:'🍼',p:'x-vjr',mc:1.2e6,ch:210.5},
  {id:'x-bvj',name:'Buff Vinny Jr',t:'BVJ',e:'💪',p:'x-vjr',mc:840e3,ch:-4.3},
  {id:'x-egod',name:'Evil Vinny God',t:'EGOD',e:'👹',p:'x-evil',mc:6.9e6,ch:61},
  {id:'x-good',name:'Good Vinny',t:'GOODV',e:'😇',p:'x-evil',mc:2.2e6,ch:-22.9},
  {id:'x-emax',name:'EGOD Maximus',t:'EMAX',e:'🔱',p:'x-egod',mc:720e3,ch:140.2},
];

let launches = [], market = {}, fam = ROOTS[0].id, sel = ROOTS[0].id, loaded = false;
let provider = null, wallet = null;
const ext = new Map(); // any other Solana coin someone looked up or remixed: id -> {id,name,t,e}
const rootIds = new Set(ROOTS.map(r => r.id));
const bigTickers = new Set(ROOTS.map(r => r.t.toUpperCase()));

const fmtUsd = n => n == null || isNaN(n) ? '–' : n >= 1e9 ? '$'+(n/1e9).toFixed(2)+'B' : n >= 1e6 ? '$'+(n/1e6).toFixed(2)+'M' : n >= 1e3 ? '$'+(n/1e3).toFixed(1)+'K' : '$'+Number(n).toFixed(0);
const fmtPx = n => n == null || isNaN(n) ? '–' : n >= 1 ? '$'+n.toFixed(3) : '$'+n.toPrecision(3);
const pct = c => c == null || isNaN(c) ? '–' : (c >= 0 ? '+' : '')+Number(c).toFixed(1)+'%';
const allRoots = () => [...ROOTS, ...ext.values()];
const allCoins = () => [...allRoots().map(r => ({...r, p:null, root:true})), ...launches];
const find = id => id === OG.id ? OG : EXAMPLE.find(c => c.id === id) || allCoins().find(c => c.id === id);
const isEx = () => fam === '__example';
const isRoot = id => rootIds.has(id) || ext.has(id);
const tick = s => String(s || '').replace(/^\$/, '');

/* ---------- verified-launch cache (transactions never change, so a verdict can be kept) ---------- */
const VKEY = 'rf-verified-' + NET;
let verified = {};
try { verified = JSON.parse(localStorage.getItem(VKEY) || '{}') || {}; } catch (_) { verified = {}; }
const saveVerified = () => { try { localStorage.setItem(VKEY, JSON.stringify(verified)); } catch (_) {} };

function familyOf(id){
  let c = find(id), guard = 0;
  while (c && c.p && guard++ < 50){ const up = find(c.p); if (!up) break; c = up; }
  return c && isRoot(c.id) ? c.id : OG.id;
}
// Register an outside coin as the top of its own family. Names from memos are provisional until read on-chain.
function addExt(id, name, t, onchain){
  if (!B58.test(id) || rootIds.has(id) || launches.some(c => c.id === id)) return;
  const cur = ext.get(id);
  if (cur && (cur.onchain || (!onchain && !cur.placeholder))) return;
  name = clean(name, 32); t = clean(tick(t), 12);
  ext.set(id, name || t ? {id, name: name || t, t: t || name.slice(0, 10), e:'🪙', onchain: !!onchain}
                        : {id, name: short(id), t: id.slice(0, 5), e:'🪙', placeholder: true});
}
function familyCoins(){
  if (isEx()) return EXAMPLE;
  const known = new Set(allCoins().map(c => c.id));
  const top = fam === OG.id ? {...OG, p:null} : {...find(fam), p:null};
  const list = [top];
  const kids = pid => launches.filter(c => pid === OG.id ? (!c.p || !known.has(c.p)) : c.p === pid);
  const q = [top.id], seen = new Set(q);
  while (q.length){
    const pid = q.shift();
    for (const k of kids(pid)) if (!seen.has(k.id)){ seen.add(k.id); list.push({...k, p:pid}); q.push(k.id); }
  }
  return list;
}

/* ---------- data ---------- */
async function pool(items, n, fn){
  const q = items.slice();
  await Promise.all(Array.from({length: Math.min(n, q.length)}, async () => { while (q.length) { try { await fn(q.shift()); } catch (_) {} } }));
}
async function loadLaunches(){
  try {
    const fresh = (await L.fetchLaunches(conn)).filter(c => !rootIds.has(c.id));
    // Keep only entries whose own transaction created the mint (verdicts cached per signature).
    const todo = fresh.filter(c => !(c.sig in verified)).slice(0, 150);
    await pool(todo, 4, async c => { verified[c.sig] = await L.verifyLaunch(conn, c) ? c.id : false; });
    if (todo.length) saveVerified();
    const real = fresh.filter(c => verified[c.sig] === c.id);
    const m = new Map();
    for (const c of real.slice().reverse()) if (!m.has(c.id)) m.set(c.id, c);
    for (const c of launches) if (!m.has(c.id) && c.local) m.set(c.id, c); // your own launch, not indexed yet
    launches = [...m.values()].sort((a, b) => (b.time || 0) - (a.time || 0));
    const ids = new Set(launches.map(c => c.id));
    const outside = [];
    for (const c of launches) if (c.p && !rootIds.has(c.p) && !ids.has(c.p)){ addExt(c.p, c.pn, c.pt); if (!ext.get(c.p)?.onchain) outside.push(c.p); }
    // Replace memo-supplied parent names with the token's real on-chain name.
    await pool([...new Set(outside)].slice(0, 40), 4, async id => { const i = await L.lookupMint(conn, id); addExt(id, i.name, i.t, true); });
  } catch (e) { console.warn('registry', e); toast('Could not reach the Solana network. Retrying shortly.'); }
  loaded = true;
  $('f-count').textContent = launches.length.toLocaleString();
}
async function loadMarket(ids){
  ids = ids.filter(id => B58.test(id));
  for (let i = 0; i < ids.length; i += 30){
    try {
      const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + ids.slice(i, i+30).join(','), {credentials:'omit', referrerPolicy:'no-referrer'});
      const j = await r.json(), best = {};
      for (const p of (j && Array.isArray(j.pairs)) ? j.pairs : []){
        const id = p?.baseToken?.address; if (!B58.test(id || '') || !ids.includes(id)) continue;
        if (best[id] && (best[id].liquidity?.usd || 0) >= (p.liquidity?.usd || 0)) continue;
        best[id] = p;
      }
      for (const [id, p] of Object.entries(best)){
        const num = v => (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && isFinite(+v) ? +v : null);
        market[id] = {mc:num(p.marketCap ?? p.fdv), ch:num(p.priceChange?.h24), price:num(p.priceUsd), liq:num(p.liquidity?.usd), vol:num(p.volume?.h24), img:safeImg(p.info?.imageUrl), url:safeDex(p.url)};
        if (ext.get(id)?.placeholder) addExt(id, p.baseToken.name, p.baseToken.symbol);
      }
    } catch (e) { console.warn('dexscreener', e); }
  }
}

/* ---------- tabs ---------- */
function buildTabs(){
  const count = id => { const f = fam; fam = id; const n = familyCoins().length - 1; fam = f; return n; };
  const av = c => market[c.id]?.img ? `<img src="${esc(market[c.id].img)}" alt="" referrerpolicy="no-referrer">` : `<span class="em">${esc(c.e)}</span>`;
  $('tabs').innerHTML =
    allRoots().map(r => `<button class="tab ${fam===r.id?'on':''}" data-act="fam" data-id="${esc(r.id)}">${av(r)}$${esc(r.t)} <span class="cnt">${count(r.id)}</span></button>`).join('') +
    `<button class="tab ${fam===OG.id?'on':''}" data-act="fam" data-id="${OG.id}"><span class="em">🌱</span>New families <span class="cnt">${count(OG.id)}</span></button>` +
    `<button class="tab ex ${isEx()?'on':''}" data-act="fam" data-id="__example"><span class="em">🐸</span>Example: Vinny</button>`;
}
function setFam(id){ fam = id; sel = isEx() ? 'x-vinny' : id; buildTabs(); drawTree(); drawSide(); }

/* ---------- tree ---------- */
let pos = {};
function drawTree(){
  const coins = familyCoins(), byParent = {};
  coins.forEach(c => { if (c.p) (byParent[c.p] ||= []).push(c); });
  const ghostFor = isEx() || !coins.some(c => c.id === sel) ? null : sel;
  pos = {}; let leaf = 0, depth = 0;
  const walk = (c, d) => {
    depth = Math.max(depth, d);
    const ks = [...(byParent[c.id] || [])];
    if (c.id === ghostFor && !c.virtual) ks.push({id:'__ghost', ghost:true});
    if (!ks.length){ pos[c.id] = {x:leaf++, d}; return pos[c.id].x; }
    const xs = ks.map(k => { if (k.ghost){ depth = Math.max(depth, d+1); pos.__ghost = {x:leaf++, d:d+1}; return pos.__ghost.x; } return walk(k, d+1); });
    pos[c.id] = {x:(xs[0] + xs[xs.length-1]) / 2, d}; return pos[c.id].x;
  };
  walk(coins[0], 0);
  const box = $('tree-box'), gapX = 128, gapY = 132;
  const Wd = Math.max(box.clientWidth - 2, leaf * gapX + 40), H = Math.max(478, (depth+1) * gapY + 100);
  const ox = (Wd - (leaf - 1) * gapX) / 2, oy = Math.max(80, (H - depth * gapY) / 2 - 20);
  for (const id in pos){ pos[id].px = ox + pos[id].x * gapX; pos[id].py = oy + pos[id].d * gapY; }
  const svg = $('tree');
  svg.setAttribute('width', Wd); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${Wd} ${H}`);
  const edge = (a, b, key, cls) => { const my = (a.py + b.py) / 2; return `<path class="edge ${cls||''}" data-edge="${esc(key)}" d="M${a.px},${a.py} C${a.px},${my} ${b.px},${my} ${b.px},${b.py}"/>`; };
  let s = '<g>';
  coins.forEach(c => { if (c.p && pos[c.p]) s += edge(pos[c.p], pos[c.id], c.id); });
  if (pos.__ghost) s += edge(pos[ghostFor], pos.__ghost, 'ghost', 'new');
  s += '</g><g id="pulses"></g>';
  coins.forEach((c, i) => {
    const P = pos[c.id], m = isEx() ? c : market[c.id] || {};
    const top = !c.p, r = top ? 36 : 26;
    const col = c.virtual ? 'var(--line2)' : top ? 'var(--pink)' : m.ch == null ? 'var(--line2)' : m.ch >= 0 ? 'var(--accent)' : 'var(--red)';
    const img = !isEx() && m.img, id = esc(c.id);
    s += `<g class="node" tabindex="0" role="button" aria-label="${esc(c.name)}" data-act="pick" data-id="${id}" transform="translate(${P.px},${P.py})">
      ${c.id === sel ? `<circle r="${r+7}" fill="none" stroke="var(--text)" stroke-width="1.5" stroke-dasharray="3 4"/>` : ''}
      <circle class="ring" r="${r}" fill="var(--panel2)" stroke="${col}" stroke-width="2.5"/>
      ${img ? `<clipPath id="cp${i}"><circle r="${r-3}"/></clipPath><image href="${esc(img)}" x="${-(r-3)}" y="${-(r-3)}" width="${(r-3)*2}" height="${(r-3)*2}" clip-path="url(#cp${i})" preserveAspectRatio="xMidYMid slice"/>`
            : `<text text-anchor="middle" dy="${r*.36}" font-size="${r*.95}">${esc(c.e)}</text>`}
      <text text-anchor="middle" y="${r+18}" fill="var(--text)" font-size="12.5" font-weight="600" font-family="JetBrains Mono,monospace">${c.virtual ? esc(c.t) : '$'+esc(c.t)}</text>
      ${c.virtual ? '' : `<text text-anchor="middle" y="${r+33}" fill="${m.mc ? (m.ch >= 0 ? 'var(--accent)' : 'var(--red)') : 'var(--faint)'}" font-size="11" font-family="JetBrains Mono,monospace">${m.mc ? fmtUsd(m.mc)+' '+pct(m.ch) : 'no pool yet'}</text>`}
    </g>`;
  });
  if (pos.__ghost){
    const P = pos.__ghost, par = find(ghostFor);
    s += `<g class="ghost" tabindex="0" role="button" aria-label="Remix ${esc(par.t)}" data-act="open" data-id="${esc(ghostFor)}" transform="translate(${P.px},${P.py})">
      <circle r="24" fill="var(--bg)" stroke="var(--line2)" stroke-width="2" stroke-dasharray="4 4"/>
      <text text-anchor="middle" dy="8" font-size="24" fill="var(--accent)">+</text>
      <text text-anchor="middle" y="42" fill="var(--dim)" font-size="11.5" font-family="JetBrains Mono,monospace">remix $${esc(par.t)}</text></g>`;
  }
  svg.innerHTML = s;
  const tag = $('tree-tag'), n = coins.length - 1;
  tag.className = 'tree-tag' + (isEx() ? ' ex' : '');
  tag.textContent = isEx() ? 'EXAMPLE · illustrative numbers' : !loaded ? 'loading on-chain registry…' : `${n} verified remix${n === 1 ? '' : 'es'} on-chain`;
}
function pulse(){
  if (!isEx() || document.hidden) return;
  const kids = EXAMPLE.filter(c => c.p), c = kids[Math.floor(Math.random() * kids.length)];
  const path = document.querySelector(`[data-edge="${c.id}"]`), g = $('pulses'); if (!path || !g) return;
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('r', 4.5); dot.setAttribute('fill', '#ff5fd2'); g.appendChild(dot);
  const len = path.getTotalLength(), t0 = performance.now();
  const step = now => { const k = Math.min((now - t0) / 1000, 1), pt = path.getPointAtLength(len * (1 - k));
    dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y); k < 1 ? requestAnimationFrame(step) : dot.remove(); };
  requestAnimationFrame(step);
}

/* ---------- side panel ---------- */
function pick(id){
  sel = id; drawTree(); drawSide();
  if (B58.test(id)) try { history.replaceState(null, '', '#' + id); } catch (_) {}
  if (innerWidth < 900) $('side').scrollIntoView({behavior:'smooth', block:'nearest'});
}
async function resolveCoin(ca){
  ca = String(ca || '').trim();
  const known = find(ca);
  if (known && B58.test(ca)) return known;
  const info = await L.lookupMint(conn, ca);
  addExt(info.id, info.name, info.t, true);
  await loadMarket([info.id]);
  return find(info.id);
}
async function findCoin(ca){
  const btn = $('find-go'); btn.disabled = true; btn.textContent = '…';
  try {
    const c = await resolveCoin(ca);
    $('find-ca').value = '';
    fam = familyOf(c.id); buildTabs(); pick(c.id);
    $('tree-box').scrollIntoView({behavior:'smooth', block:'nearest'});
  } catch (e) { toast(e.message || 'Could not find that coin.'); }
  btn.disabled = false; btn.textContent = 'Find';
}
function drawSide(){
  const c = find(sel); if (!c) return;
  const chain = []; let x = c, g = 0;
  while (x && g++ < 50){ chain.unshift(x); x = x.p ? find(x.p) : null; }
  const chainHtml = chain.length > 1 ? `<div class="chain">${chain.map(l => `<button data-act="pick" data-id="${esc(l.id)}">${esc(l.t)}</button>`).join('→')}</div>` : '';
  if (isEx()){
    const kids = EXAMPLE.filter(k => k.p === c.id).length;
    $('side').innerHTML = `
      <div class="coin-head"><div class="coin-av">${esc(c.e)}</div><div><h4>${esc(c.name)}</h4><div class="t">$${esc(c.t)} · example</div></div></div>
      ${chainHtml}
      <div class="kv"><div><div class="l">market cap</div><div class="v">${fmtUsd(c.mc)}</div></div><div><div class="l">24h</div><div class="v ${c.ch>=0?'up':'down'}">${pct(c.ch)}</div></div></div>
      <p class="nomkt">This tree is an illustration. The pink dots show how v2 will stream a slice of each child's trading fees up to its parent's holders. <b>$${esc(c.t)}</b> has ${kids} direct remix${kids===1?'':'es'}.</p>
      <button class="btn btn-main" data-act="fam" data-id="${ROOTS[0].id}">See real family trees</button>`;
    return;
  }
  if (c.virtual){
    $('side').innerHTML = `
      <div class="coin-head"><div class="coin-av">🌱</div><div><h4>New families</h4><div class="t">OG coins launched on remix.fun</div></div></div>
      <p class="nomkt">Coins launched with no parent start their own family here. Remix one of them, or start a new family yourself.</p>
      <button class="btn btn-main" data-act="open" data-id="">Start a new family</button>`;
    return;
  }
  const m = market[c.id], kids = launches.filter(k => k.p === c.id).length, id = esc(c.id);
  const av = m?.img ? `<img src="${esc(m.img)}" alt="" referrerpolicy="no-referrer">` : esc(c.e);
  const isRemix = !c.root;
  const copycat = isRemix && bigTickers.has(String(c.t).toUpperCase());
  $('side').innerHTML = `
    <div class="coin-head"><div class="coin-av">${av}</div><div><h4>${esc(c.name)}</h4><div class="t">$${esc(c.t)} · ${c.root ? (rootIds.has(c.id) ? 'OG' : 'Solana token') : chain.length > 1 ? 'gen ' + (chain.length - 1) + ' remix' : 'new family'}</div></div></div>
    ${copycat ? `<p class="warn">⚠ This remix uses the same ticker as a major coin. It is <b>not</b> $${esc(c.t)}. Check the contract address.</p>` : ''}
    ${chainHtml}
    <div class="addr"><span title="${id}">${short(c.id)}</span><button data-act="copy" data-id="${id}">copy CA</button></div>
    ${m && m.mc ? `<div class="kv">
      <div><div class="l">market cap</div><div class="v">${fmtUsd(m.mc)}</div></div>
      <div><div class="l">24h</div><div class="v ${m.ch>=0?'up':'down'}">${pct(m.ch)}</div></div>
      <div><div class="l">price</div><div class="v">${fmtPx(m.price)}</div></div>
      <div><div class="l">liquidity</div><div class="v">${fmtUsd(m.liq)}</div></div>
      <div><div class="l">24h volume</div><div class="v">${fmtUsd(m.vol)}</div></div>
      <div><div class="l">remixes</div><div class="v">${kids}</div></div></div>`
    : `<p class="nomkt"><b>No pool yet.</b> The creator holds the full supply. Once someone opens a pool on Raydium or Meteora, the price and market cap show up here within a minute.</p>`}
    ${isRemix ? `<p class="note">Anyone can launch a remix. Remix.fun does not vet coins; always check the contract address before buying.</p>` : ''}
    <div class="links">
      ${m && m.mc ? `<a href="https://jup.ag/swap/SOL-${id}" target="_blank" rel="noopener noreferrer">Trade on Jupiter ↗</a>` : `<a href="https://raydium.io/liquidity/create-pool/" target="_blank" rel="noopener noreferrer">Create pool ↗</a>`}
      <a href="${m?.url ? esc(m.url) : 'https://dexscreener.com/solana/' + id}" target="_blank" rel="noopener noreferrer">DexScreener ↗</a>
      <a href="https://solscan.io/token/${id}${CL}" target="_blank" rel="noopener noreferrer">Solscan ↗</a>
      ${c.sig ? `<a href="https://solscan.io/tx/${esc(c.sig)}${CL}" target="_blank" rel="noopener noreferrer">Launch tx ↗</a>` : `<a href="https://x.com/search?q=%24${encodeURIComponent(c.t)}" target="_blank" rel="noopener noreferrer">$${esc(c.t)} on X ↗</a>`}
    </div>
    <button class="btn btn-main" data-act="open" data-id="${id}">Remix $${esc(c.t)}</button>`;
}
function copyAddr(a){ navigator.clipboard.writeText(a).then(() => toast('Contract address copied'), () => toast(a)); }

/* ---------- wallet ---------- */
function getProvider(){ return window.phantom?.solana || window.solflare || window.backpack?.solana || window.solana || null; }
async function connectWallet(){
  provider = getProvider();
  if (!provider){ toast('No Solana wallet found. Install Phantom from phantom.app, then reload this page.'); return null; }
  try {
    const r = await provider.connect();
    const k = String((r && r.publicKey) || provider.publicKey || '');
    if (!B58.test(k)) throw new Error('bad key');
    wallet = k;
    refreshWallet();
    return wallet;
  } catch (e) { toast('Wallet connection cancelled'); return null; }
}
async function refreshWallet(){
  if (!wallet) return;
  let bal = '';
  try { bal = ((await conn.getBalance(new W.PublicKey(wallet))) / 1e9).toFixed(3) + ' SOL · '; } catch (_) {}
  $('wallet-btn').textContent = bal + short(wallet);
}

/* ---------- launch ---------- */
const EMO = ['🐸','🐕','🐱','😈','🦍','🐧','👽','🤡','💀','🔥','🍌','🧠','👑','🦄','💎','🚀'];
let form = {parent:'', emoji:EMO[0]}, busy = false;
function openLaunch(parent){
  if (busy) { $('modal').hidden = false; return; }
  if (parent === undefined) parent = isEx() ? ROOTS[0].id : (sel === OG.id ? '' : sel);
  if (parent && !B58.test(parent)) parent = '';
  form.parent = parent;
  const opts = [`<option value="">None: start a new family</option>`]
    .concat(allCoins().map(c => `<option value="${esc(c.id)}" ${c.id===parent?'selected':''}>$${esc(c.t)} · ${esc(c.name)}${rootIds.has(c.id)?'':' ('+short(c.id)+')'}</option>`));
  $('modal-body').innerHTML = `
    <div class="modal-top"><div><h3>Launch a remix</h3><p class="s">One transaction. You get 100% of the supply.</p></div><button class="x" data-act="close" aria-label="Close">×</button></div>
    <div class="field"><label for="f-ca">Remix any Solana coin: paste its contract address</label>
      <input id="f-ca" class="mono" placeholder="e.g. DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" autocomplete="off" spellcheck="false" maxlength="44">
      <div class="ca-status" id="f-ca-status"></div></div>
    <p class="or">or pick one</p>
    <div class="field"><select id="f-parent" aria-label="Parent coin">${opts.join('')}</select></div>
    <div class="field"><label for="f-name">Name</label><input id="f-name" maxlength="32" placeholder="Bonk Jr" autocomplete="off"></div>
    <div class="row2">
      <div class="field"><label for="f-tick">Ticker</label><input id="f-tick" class="mono" maxlength="10" placeholder="BONKJR" autocomplete="off"></div>
      <div class="field"><label for="f-supply">Supply</label><input id="f-supply" class="mono" value="1000000000" inputmode="numeric" maxlength="13"></div>
    </div>
    <div class="field"><label>Icon on remix.fun</label><div class="emojis" id="f-emoji">${EMO.map(e => `<button type="button" class="${e===form.emoji?'on':''}" data-act="emoji" data-id="${e}">${e}</button>`).join('')}</div></div>
    <div class="summary">
      <div><span>Network cost</span><b>~${LAUNCH_SOL} SOL</b></div>
      <div><span>Mint authority</span><b>revoked</b></div>
      <div><span>Freeze authority</span><b>none</b></div>
      <div><span>Decimals</span><b>6</b></div>
    </div>
    <p class="note">Your wallet will show exactly one transaction. Remix.fun never asks for your seed phrase or private key, and never asks you to send SOL to anyone.</p>
    <div class="err" id="f-err" hidden></div>
    <button class="btn btn-main btn-wide" id="f-go" data-act="launch">${wallet ? 'Launch' : 'Connect wallet & launch'}</button>`;
  $('f-ca').addEventListener('input', checkParentCA);
  $('f-parent').addEventListener('change', e => { form.parent = e.target.value; $('f-ca').value = ''; setCaStatus(''); });
  $('f-tick').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('f-supply').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); });
  $('modal').hidden = false;
  setTimeout(() => $('f-name').focus(), 50);
}
function setCaStatus(msg, cls){ const s = $('f-ca-status'); if (s){ s.textContent = msg; s.className = 'ca-status ' + (cls || ''); } }
let caTimer, caSeq = 0;
function checkParentCA(){
  clearTimeout(caTimer);
  const ca = $('f-ca').value.trim();
  if (!ca){ setCaStatus(''); form.parent = $('f-parent').value; return; }
  if (!B58.test(ca)){ setCaStatus('That does not look like a Solana address yet.', 'bad'); form.parent = null; return; }
  setCaStatus('Checking on-chain…'); form.parent = null;
  const seq = ++caSeq;
  caTimer = setTimeout(async () => {
    try {
      const c = await resolveCoin(ca);
      if (seq !== caSeq) return;
      form.parent = c.id;
      setCaStatus(`✓ $${tick(c.t)} · ${c.name}`, 'ok');
    } catch (e) { if (seq === caSeq) setCaStatus(e.message || 'Could not find that coin.', 'bad'); }
  }, 350);
}
function pickEmoji(b, e){ if (!EMO.includes(e)) return; form.emoji = e; document.querySelectorAll('#f-emoji button').forEach(x => x.classList.toggle('on', x === b)); }
function closeLaunch(){ if (!busy) $('modal').hidden = true; }
function fail(msg){ busy = false; const e = $('f-err'); e.textContent = msg; e.hidden = false; const b = $('f-go'); b.disabled = false; b.textContent = 'Try again'; }

async function launch(){
  if (busy) return;
  const name = clean($('f-name').value, 64), t = $('f-tick').value.trim(), supply = $('f-supply').value.trim();
  const btn = $('f-go'); $('f-err').hidden = true;
  if (!name) return fail('Give your coin a name.');
  if (new TextEncoder().encode(name).length > 32) return fail('That name is too long. Keep it under 32 characters.');
  if (!/^[A-Z0-9]{2,10}$/.test(t)) return fail('The ticker needs 2 to 10 letters or numbers.');
  if (!/^\d+$/.test(supply) || BigInt(supply) < 1n || BigInt(supply) > 1000000000000n) return fail('Supply must be between 1 and 1,000,000,000,000.');
  if ($('f-ca').value.trim() && !form.parent) return fail('That contract address is not a token yet. Fix it, or clear the box and pick a coin.');
  busy = true; btn.disabled = true; btn.textContent = 'Connecting wallet…';
  if (!wallet && !(await connectWallet())) return fail('Connect a wallet to launch.');
  try {
    const payer = new W.PublicKey(wallet);
    const lamports = await conn.getBalance(payer);
    const need = LAUNCH_SOL + 0.003;
    if (lamports < need * 1e9) return fail(`You need about ${need} SOL. This wallet has ${(lamports/1e9).toFixed(4)} SOL.`);
    btn.textContent = 'Approve in your wallet…';
    const mint = W.Keypair.generate(), parent = form.parent || null, emoji = form.emoji;
    const { tx, blockhash, lastValidBlockHeight } = await L.buildLaunchTx(conn, { payer, mint: mint, name, symbol: t, supply, parent, emoji,
      parentName: parent ? find(parent)?.name || '' : '', parentTicker: parent ? tick(find(parent)?.t) : '' });
    const expected = tx.serializeMessage();
    const signed = await provider.signTransaction(tx);
    // The wallet must return the exact message we checked, signed by the connected wallet and the mint.
    if (!signed || !signed.serializeMessage().equals(expected)) throw new Error('The wallet returned a different transaction, so it was not sent.');
    L.checkLaunchTx(signed, payer, mint.publicKey);
    if (!signed.verifySignatures()) throw new Error('The transaction signatures are incomplete, so it was not sent.');
    btn.textContent = 'Launching…';
    const sig = await conn.sendRawTransaction(signed.serialize(), { maxRetries: 5 });
    btn.textContent = 'Confirming…';
    const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    if (res.value.err) throw new Error('the transaction failed on-chain');
    const coin = { id: mint.publicKey.toBase58(), name, t, e: emoji, p: parent, sig, time: Date.now()/1000, local: true };
    verified[sig] = coin.id; saveVerified();
    launches.unshift(coin);
    $('f-count').textContent = launches.length.toLocaleString();
    fam = familyOf(coin.id); sel = coin.id; buildTabs(); drawTree(); drawSide(); refreshWallet();
    busy = false;
    const par = parent ? find(parent) : null;
    $('modal-body').innerHTML = `<div class="done">
      <div class="big">${esc(emoji)}</div>
      <h3>$${esc(t)} is live</h3>
      <p class="s">${par ? `Recorded on-chain as a remix of $${esc(par.t)}.` : 'You started a new family.'} The full supply is in your wallet.</p>
      <div class="addr full"><span>${short(coin.id)}</span><button data-act="copy" data-id="${coin.id}">copy CA</button></div>
      <div class="links full">
        <a href="https://solscan.io/tx/${sig}${CL}" target="_blank" rel="noopener noreferrer">View transaction ↗</a>
        <a href="https://raydium.io/liquidity/create-pool/" target="_blank" rel="noopener noreferrer">Create pool ↗</a>
      </div>
      <button class="btn btn-main full" data-act="see-tree">See it in the family tree</button></div>`;
  } catch (e) {
    console.error(e);
    const msg = String(e?.message || e);
    fail(/reject|cancel|denied/i.test(msg) ? 'You cancelled the transaction in your wallet.' : 'Launch failed: ' + msg.slice(0, 160));
  }
}

let tt; function toast(m){ const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2800); }

/* ---------- events (no inline handlers anywhere, so CSP can block all inline script) ---------- */
function act(el){
  const a = el.dataset.act, id = el.dataset.id;
  if (a === 'fam') setFam(id);
  else if (a === 'pick') pick(id);
  else if (a === 'open') openLaunch(id);
  else if (a === 'copy' && B58.test(id)) copyAddr(id);
  else if (a === 'emoji') pickEmoji(el, id);
  else if (a === 'close') closeLaunch();
  else if (a === 'launch') launch();
  else if (a === 'connect') connectWallet();
  else if (a === 'trees') $('lineages').scrollIntoView({behavior:'smooth'});
  else if (a === 'see-tree'){ closeLaunch(); $('lineages').scrollIntoView({behavior:'smooth'}); }
}
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el) act(el); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') return closeLaunch();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('g[data-act]')) { e.preventDefault(); act(e.target); }
});
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeLaunch(); });
$('find').addEventListener('submit', e => { e.preventDefault(); findCoin($('find-ca').value); });
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawTree, 150); });

/* ---------- boot ---------- */
(async () => {
  $('reg-link').textContent = short(RemixCore.REGISTRY);
  $('reg-link').href = 'https://solscan.io/account/' + RemixCore.REGISTRY + CL;
  if (NET === 'devnet') $('net').lastChild.textContent = 'devnet';
  buildTabs(); drawTree(); drawSide();
  await Promise.all([loadLaunches(), loadMarket(ROOTS.map(r => r.id))]);
  buildTabs(); drawTree(); drawSide();
  await loadMarket([...launches.map(c => c.id), ...ext.keys()]);
  buildTabs(); drawTree(); drawSide();
  const h = location.hash.slice(1);
  if (B58.test(h)) findCoin(h);
  const p = getProvider();
  if (p?.isConnected && p.publicKey && B58.test(String(p.publicKey))){ provider = p; wallet = String(p.publicKey); refreshWallet(); }
  setInterval(async () => { if (document.hidden) return; await loadMarket(familyCoins().map(c => c.id)); drawTree(); drawSide(); }, 30000);
  setInterval(async () => { if (document.hidden || busy) return; const n = launches.length; await loadLaunches(); if (launches.length !== n){ await loadMarket(launches.map(c => c.id)); buildTabs(); drawTree(); drawSide(); } }, 45000);
  setInterval(pulse, 500);
})();
