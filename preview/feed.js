// KJ the Genie sample social feed: a TikTok / Reels / Shorts style strip for sample sites.
// Each clip is a real photo animated like a short video (slow zoom + caption stickers).
// Usage: KJFeed.mount(document.getElementById('feed'), { handle, name, avatar, accent, clips: [...] })
//   clip = { img, title, caption, lines: ['sticker 1', 'sticker 2'], net: 'tiktok' | 'reels' | 'shorts', sound }
(function () {
  const NETS = {
    tiktok: { label: 'TikTok', icon: '/img/social/tiktok.svg' },
    reels: { label: 'Reels', icon: '/img/social/instagram.svg' },
    shorts: { label: 'Shorts', icon: '/img/social/youtube.svg' }
  };
  const CLIP_MS = 6500;

  const css = `
  .kjf { --acc: #ffb22c; }
  .kjf-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .kjf-head img { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 3px solid var(--acc); }
  .kjf-head b { display: block; font-size: 18px; }
  .kjf-head small { color: #b8b0c4; }
  .kjf-nets { display: flex; gap: 6px; margin-left: auto; }
  .kjf-nets img { width: 30px; height: 30px; padding: 6px; border-radius: 50%; background: #fff; }
  .kjf-row { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 8px; -webkit-overflow-scrolling: touch; }
  .kjf-tile { position: relative; flex: 0 0 148px; aspect-ratio: 9 / 16; border-radius: 16px; overflow: hidden; scroll-snap-align: start; cursor: pointer; border: 0; padding: 0; background: #222; color: #fff; text-align: left; font: inherit; }
  .kjf-tile img.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .4s; }
  .kjf-tile:hover img.bg { transform: scale(1.06); }
  .kjf-tile::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.85), transparent 55%); }
  .kjf-tile .net { position: absolute; top: 8px; left: 8px; z-index: 1; display: flex; align-items: center; gap: 5px; padding: 3px 8px 3px 4px; border-radius: 999px; background: rgba(0,0,0,.6); font-size: 11px; font-weight: 800; }
  .kjf-tile .net img { width: 16px; height: 16px; padding: 2px; border-radius: 50%; background: #fff; }
  .kjf-tile .play { position: absolute; top: 50%; left: 50%; z-index: 1; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(255,255,255,.9); }
  .kjf-tile .play::before { content: ""; position: absolute; left: 17px; top: 13px; border-left: 14px solid #111; border-top: 9px solid transparent; border-bottom: 9px solid transparent; }
  .kjf-tile .t { position: absolute; left: 10px; right: 10px; bottom: 10px; z-index: 1; font-weight: 800; font-size: 14px; line-height: 1.2; }
  .kjf-note { margin: 10px 0 0; font-size: 13px; color: #b8b0c4; }
  /* full-screen player */
  .kjf-player { position: fixed; inset: 0; z-index: 50; background: #000; display: none; align-items: center; justify-content: center; }
  .kjf-player.open { display: flex; }
  .kjf-stage { position: relative; height: 100%; max-height: 100dvh; aspect-ratio: 9 / 16; max-width: 100vw; overflow: hidden; background: #111; color: #fff; font-family: inherit; }
  .kjf-stage .media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .kjf-stage .media.go { animation: kjf-zoom ${CLIP_MS}ms linear forwards; }
  @keyframes kjf-zoom { from { transform: scale(1.02) translate(0, 0); } to { transform: scale(1.22) translate(-3%, -4%); } }
  .kjf-stage .shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.8), transparent 40%, transparent 75%, rgba(0,0,0,.5)); pointer-events: none; }
  .kjf-bars { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; gap: 4px; z-index: 3; }
  .kjf-bars i { flex: 1; height: 3px; border-radius: 3px; background: rgba(255,255,255,.35); overflow: hidden; }
  .kjf-bars i b { display: block; height: 100%; width: 0; background: #fff; }
  .kjf-bars i.done b { width: 100%; }
  .kjf-bars i.now b { animation: kjf-bar ${CLIP_MS}ms linear forwards; }
  @keyframes kjf-bar { to { width: 100%; } }
  .kjf-top { position: absolute; top: 22px; left: 12px; right: 12px; display: flex; align-items: center; justify-content: space-between; z-index: 3; }
  .kjf-top .net { display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 14px; }
  .kjf-top .net img { width: 22px; height: 22px; padding: 3px; border-radius: 50%; background: #fff; }
  .kjf-x { width: 40px; height: 40px; border-radius: 50%; border: 0; background: rgba(0,0,0,.5); color: #fff; font-size: 22px; cursor: pointer; }
  .kjf-stickers { position: absolute; left: 0; right: 0; top: 30%; display: grid; gap: 10px; justify-items: center; z-index: 2; padding: 0 18px; pointer-events: none; }
  .kjf-stickers span { opacity: 0; transform: scale(.6) rotate(-3deg); padding: 6px 14px; border-radius: 10px; background: #fff; color: #111; font-weight: 900; font-size: clamp(18px, 5vw, 26px); text-align: center; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
  .kjf-stickers span:nth-child(2) { background: var(--acc); transform: scale(.6) rotate(3deg); }
  .kjf-stickers span.in { animation: kjf-pop .45s cubic-bezier(.2, 1.6, .5, 1) forwards; }
  @keyframes kjf-pop { to { opacity: 1; transform: scale(1) rotate(0); } }
  .kjf-info { position: absolute; left: 14px; right: 74px; bottom: 22px; z-index: 3; }
  .kjf-info b { font-size: 17px; }
  .kjf-info p { margin: 6px 0 8px; font-size: 15px; line-height: 1.35; }
  .kjf-info .snd { font-size: 13px; white-space: nowrap; overflow: hidden; }
  .kjf-info .snd span { display: inline-block; padding-left: 100%; animation: kjf-marq 9s linear infinite; }
  @keyframes kjf-marq { to { transform: translateX(-100%); } }
  .kjf-rail { position: absolute; right: 10px; bottom: 26px; z-index: 3; display: grid; gap: 18px; justify-items: center; }
  .kjf-rail img { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; }
  .kjf-rail button { width: 46px; height: 46px; border-radius: 50%; border: 0; background: rgba(0,0,0,.35); color: #fff; font-size: 24px; cursor: pointer; }
  .kjf-rail button.liked { color: #ff2d55; animation: kjf-pop .3s; }
  .kjf-tap { position: absolute; top: 70px; bottom: 120px; width: 40%; z-index: 2; cursor: pointer; }
  .kjf-tap.l { left: 0; } .kjf-tap.r { right: 0; }
  .kjf-tag { position: absolute; left: 50%; bottom: 4px; transform: translateX(-50%); z-index: 3; font-size: 11px; color: rgba(255,255,255,.7); white-space: nowrap; }
  `;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mount(root, cfg) {
    if (!document.getElementById('kjf-css')) { const s = el('style'); s.id = 'kjf-css'; s.textContent = css; document.head.appendChild(s); }
    root.classList.add('kjf');
    if (cfg.accent) root.style.setProperty('--acc', cfg.accent);
    const nets = [...new Set(cfg.clips.map(c => c.net))];
    root.innerHTML = `<div class="kjf-head"><img src="${esc(cfg.avatar)}" alt=""><div><b>@${esc(cfg.handle)}</b><small>${esc(cfg.name)}</small></div>
      <div class="kjf-nets">${nets.map(n => `<img src="${NETS[n].icon}" alt="${NETS[n].label}" title="${NETS[n].label}">`).join('')}</div></div>`;
    const row = el('div', 'kjf-row');
    cfg.clips.forEach((c, i) => {
      const t = el('button', 'kjf-tile', `<img class="bg" src="${esc(c.img)}" alt="" loading="lazy"><span class="net"><img src="${NETS[c.net].icon}" alt="">${NETS[c.net].label}</span><span class="play"></span><span class="t">${esc(c.title)}</span>`);
      t.type = 'button'; t.setAttribute('aria-label', 'Play: ' + c.title);
      t.addEventListener('click', () => player.open(i));
      row.appendChild(t);
    });
    root.appendChild(row);
    root.appendChild(el('p', 'kjf-note', cfg.note || 'Sample feed: the kind of short videos KJ the Genie films at your business and posts for you.'));
    const player = makePlayer(cfg);
  }

  function makePlayer(cfg) {
    const p = el('div', 'kjf-player'); p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true');
    if (cfg.accent) p.style.setProperty('--acc', cfg.accent);
    p.innerHTML = `<div class="kjf-stage">
      <img class="media" alt=""><div class="shade"></div>
      <div class="kjf-bars">${cfg.clips.map(() => '<i><b></b></i>').join('')}</div>
      <div class="kjf-top"><span class="net"></span><button class="kjf-x" type="button" aria-label="Close">✕</button></div>
      <div class="kjf-stickers"></div>
      <div class="kjf-tap l" aria-hidden="true"></div><div class="kjf-tap r" aria-hidden="true"></div>
      <div class="kjf-info"><b>@${esc(cfg.handle)}</b><p></p><div class="snd"><span></span></div></div>
      <div class="kjf-rail"><img src="${esc(cfg.avatar)}" alt=""><button type="button" aria-label="Like">♥</button><button type="button" aria-label="Comment">💬</button><button type="button" aria-label="Share">↗</button></div>
      <div class="kjf-tag">Sample by KJ the Genie</div></div>`;
    document.body.appendChild(p);
    const $ = s => p.querySelector(s), media = $('.media'), bars = [...p.querySelectorAll('.kjf-bars i')];
    let cur = 0, timer = null, stickerTimers = [];

    function show(i) {
      if (i < 0) i = 0;
      if (i >= cfg.clips.length) return close();
      cur = i; const c = cfg.clips[i];
      clearTimeout(timer); stickerTimers.forEach(clearTimeout); stickerTimers = [];
      media.classList.remove('go'); void media.offsetWidth;
      media.src = c.img; media.classList.add('go');
      bars.forEach((b, k) => { b.className = k < i ? 'done' : ''; });
      void bars[i].offsetWidth; bars[i].className = 'now';
      $('.kjf-top .net').innerHTML = `<img src="${NETS[c.net].icon}" alt="">${NETS[c.net].label}`;
      $('.kjf-info p').textContent = c.caption;
      $('.kjf-info .snd span').textContent = '♫ ' + (c.sound || 'Original sound · ' + cfg.name);
      $('.kjf-rail button').classList.remove('liked');
      const st = $('.kjf-stickers'); st.innerHTML = (c.lines || []).map(l => `<span>${esc(l)}</span>`).join('');
      [...st.children].forEach((s, k) => stickerTimers.push(setTimeout(() => s.classList.add('in'), 500 + k * 1400)));
      timer = setTimeout(() => show(cur + 1), CLIP_MS);
    }
    function open(i) { p.classList.add('open'); document.body.style.overflow = 'hidden'; show(i); $('.kjf-x').focus(); }
    function close() { clearTimeout(timer); stickerTimers.forEach(clearTimeout); p.classList.remove('open'); document.body.style.overflow = ''; }
    $('.kjf-x').addEventListener('click', close);
    $('.kjf-tap.r').addEventListener('click', () => show(cur + 1));
    $('.kjf-tap.l').addEventListener('click', () => show(cur - 1));
    $('.kjf-rail button').addEventListener('click', e => e.currentTarget.classList.toggle('liked'));
    document.addEventListener('keydown', e => {
      if (!p.classList.contains('open')) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') show(cur + 1); else if (e.key === 'ArrowLeft') show(cur - 1);
    });
    return { open };
  }

  window.KJFeed = { mount };
})();
