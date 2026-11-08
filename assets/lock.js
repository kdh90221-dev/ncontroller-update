/*
 * 구매자 전용 잠금 (2026-11-08) — 다운로드 · 설치 방법 · 설명서는 구매자 코드를 넣어야 열린다.
 *
 *   빌더가 올릴 때 그 부분을 구매자 코드로 암호화(AES-GCM, 열쇠 = PBKDF2-SHA256(코드, salt))해 둔다.
 *   이 파일은 코드를 받아 풀기만 한다 — 코드는 사이트 어디에도 없다(단톡방에만).
 *   한 번 맞으면 이 브라우저에 30일 기억. 코드를 바꾸면(salt 가 바뀜) 다시 묻는다.
 *
 *   잠긴 것
 *     <div class="nc-locked" data-lock="id">     + <script type="application/octet-stream" id="nc-lock-id">  (첫 화면 칸)
 *     <script type="application/octet-stream" id="nc-page">                                      (설명서 쪽 통째)
 *     <img data-enc-src="…jpg.enc">                                                              (설치 사진)
 *     <a href="dl/….apk.enc">                                                                    (다운로드 — 풀어서 저장)
 */
(function () {
  'use strict';
  var meta = document.querySelector('meta[name="nc-lock"]');
  if (!meta || !window.crypto || !crypto.subtle) return;
  var parts = meta.getAttribute('content').split('.');
  var SALT = parts[0], ITER = parseInt(parts[1], 10) || 210000;
  var STORE = 'nc_buyer_v1', DAYS = 30;
  var KEY = null;

  function b64(s) { var b = atob(s.replace(/\s+/g, '')), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function norm(c) { return String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }
  function derive(code) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(norm(code)), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(SALT), iterations: ITER, hash: 'SHA-256' }, k,
        { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    });
  }
  function dec(key, u) {
    if (u.length < 32 || u[0] !== 78 || u[1] !== 67 || u[2] !== 69 || u[3] !== 49) return Promise.reject(new Error('형식'));   /* "NCE1" */
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(4, 16) }, key, u.subarray(16)).then(function (b) { return new Uint8Array(b); });
  }
  function text(u) { return new TextDecoder('utf-8').decode(u); }
  function blobOf(id) { var s = document.getElementById(id); return s ? b64(s.textContent) : null; }

  /* 확인용 — 이 쪽에서 잠긴 것 하나를 풀어 본다 */
  function probe() {
    var s = document.querySelector('script[type="application/octet-stream"][id^="nc-"]');
    return s ? b64(s.textContent) : null;
  }

  function saved() {
    try { var o = JSON.parse(localStorage.getItem(STORE) || 'null'); if (o && o.s === SALT && o.t > Date.now()) return o.c; } catch (e) {}
    return null;
  }
  function save(c) { try { localStorage.setItem(STORE, JSON.stringify({ c: norm(c), s: SALT, t: Date.now() + DAYS * 864e5 })); } catch (e) {} }

  function tryCode(code) {
    return derive(code).then(function (k) {
      var p = probe();
      return (p ? dec(k, p) : Promise.resolve()).then(function () { return k; });
    });
  }

  /* ── 풀기 ── */
  function unlockAll() {
    var jobs = [];
    var page = document.getElementById('nc-page');
    if (page) {
      jobs.push(dec(KEY, b64(page.textContent)).then(function (u) {
        document.body.innerHTML = text(u);
        [].slice.call(document.body.querySelectorAll('script')).forEach(function (old) {   /* innerHTML 로 넣은 스크립트는 안 돈다 — 다시 만든다 */
          var s = document.createElement('script'); s.textContent = old.textContent; old.parentNode.replaceChild(s, old);
        });
      }));
    }
    [].slice.call(document.querySelectorAll('.nc-locked[data-lock]')).forEach(function (box) {
      var raw = blobOf('nc-lock-' + box.getAttribute('data-lock'));
      if (!raw) return;
      jobs.push(dec(KEY, raw).then(function (u) {
        var wrap = document.createElement('div'); wrap.innerHTML = text(u);
        while (wrap.firstChild) box.parentNode.insertBefore(wrap.firstChild, box);
        box.parentNode.removeChild(box);
      }));
    });
    return Promise.all(jobs).then(function () {
      images();
      document.dispatchEvent(new Event('nc-unlocked'));
      if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
    });
  }
  function images() {
    [].slice.call(document.querySelectorAll('img[data-enc-src]')).forEach(function (im) {
      var u = im.getAttribute('data-enc-src'); im.removeAttribute('data-enc-src');
      fetch(u).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
        .then(function (b) { return dec(KEY, new Uint8Array(b)); })
        .then(function (d) { im.src = URL.createObjectURL(new Blob([d], { type: /\.png\.enc$/.test(u) ? 'image/png' : 'image/jpeg' })); })
        .catch(function () {});
    });
  }

  /* ── 다운로드 — 내려받아 풀고 저장 ── */
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href$=".enc"]') : null;
    if (!a) return;
    e.preventDefault();
    if (!KEY) { ask(); return; }
    var url = a.getAttribute('href'), name = url.split('/').pop().replace(/\.enc$/, '');
    var label = a.textContent; a.textContent = '다운로드 중…'; a.style.pointerEvents = 'none';
    fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (b) { return dec(KEY, new Uint8Array(b)); })
      .then(function (d) {
        var u = URL.createObjectURL(new Blob([d], { type: /\.apk$/.test(name) ? 'application/vnd.android.package-archive' : 'application/octet-stream' }));
        var t = document.createElement('a'); t.href = u; t.download = name; document.body.appendChild(t); t.click(); t.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
      })
      .catch(function () { alertBox('다운로드하지 못했습니다. 잠시 뒤 다시 눌러 주세요.'); })
      .then(function () { a.textContent = label; a.style.pointerEvents = ''; });
  }, true);

  /* ── 잠긴 동안 — 아직 없는 자리(#dl-v1 · #dl-v2 · #install-v1 …)로 가는 링크는 코드 칸으로 ── */
  document.addEventListener('click', function (e) {
    if (KEY) return;
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id || document.getElementById(id)) return;
    e.preventDefault();
    ask();
  }, true);

  /* ── 코드 넣는 칸 (2026-11-09 — 한 쪽에 한 곳만. 나머지 잠긴 칸은 안내 + 「코드 넣기」) ── */
  var css = '.nc-lockcard{border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:22px;background:rgba(255,255,255,.03);max-width:520px}' +
    '.nc-lockcard h3{margin:0 0 6px;font-size:17px}.nc-lockcard p{margin:0 0 14px;color:#9aa2aa;font-size:14px;line-height:1.6}' +
    '.nc-lockcard form{display:flex;gap:8px;flex-wrap:wrap}.nc-lockcard input{flex:1;min-width:160px;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);' +
    'background:#0d1116;color:#fff;font-size:16px;letter-spacing:.12em;text-transform:uppercase}.nc-lockcard .err{color:#ff6b6b;margin:10px 0 0;font-size:13px;min-height:1em}' +
    '.nc-gate{min-height:70vh;display:flex;align-items:center;justify-content:center;padding:24px}' +
    '.nc-lockhint{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px dashed rgba(255,255,255,.16);border-radius:14px;padding:14px 16px;color:#9aa2aa;font-size:14px;line-height:1.6;max-width:520px}' +
    '.nc-lockhint span{flex:1;min-width:200px}' +
    '@keyframes ncflash{0%{box-shadow:0 0 0 0 rgba(161,196,235,.7)}100%{box-shadow:0 0 0 14px rgba(161,196,235,0)}}.nc-flash{animation:ncflash .9s ease-out 2}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function card() {
    var d = document.createElement('div'); d.className = 'nc-lockcard';
    d.innerHTML = '<h3>구매자 전용</h3><p>다운로드 · 설치 방법 · 설명서는 구매하신 분만 볼 수 있습니다. 구매자 단톡방에서 받은 코드를 넣어 주세요.</p>' +
      '<form><input autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="구매자 코드" aria-label="구매자 코드">' +
      '<button class="btn primary" type="submit">확인</button></form><div class="err" role="alert"></div>';
    var f = d.querySelector('form'), inp = d.querySelector('input'), err = d.querySelector('.err');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var c = inp.value; if (!norm(c)) { err.textContent = '코드를 넣어 주세요.'; return; }
      err.textContent = '확인 중…';
      tryCode(c).then(function (k) { KEY = k; save(c); return unlockAll(); })
        .catch(function () { err.textContent = '코드가 맞지 않습니다. 단톡방의 코드를 다시 확인해 주세요.'; });
    });
    return d;
  }
  function ask() {
    var i = document.querySelector('.nc-lockcard input');
    if (!i) return;
    i.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(function () { try { i.focus({ preventScroll: true }); } catch (e) { i.focus(); } }, 350);
    var c = i.closest('.nc-lockcard');
    if (c) { c.classList.remove('nc-flash'); void c.offsetWidth; c.classList.add('nc-flash'); }
  }
  function hint() {
    var d = document.createElement('div'); d.className = 'nc-lockhint';
    d.innerHTML = '<span>구매자 전용입니다. 구매자 코드를 한 번 넣으면 다운로드 · 설치 방법 · 설명서가 함께 열립니다.</span>' +
      '<button class="btn" type="button">코드 넣기</button>';
    d.querySelector('button').addEventListener('click', ask);
    return d;
  }
  function alertBox(m) { try { window.alert(m); } catch (e) {} }

  function showLocks() {
    var gate = document.getElementById('nc-gate');
    var first = !gate;
    [].slice.call(document.querySelectorAll('.nc-locked[data-lock]')).forEach(function (box) {
      box.appendChild(first ? card() : hint());
      first = false;
    });
    if (gate) gate.appendChild(card());
  }

  var c0 = saved();
  if (c0) {
    tryCode(c0).then(function (k) { KEY = k; return unlockAll(); }).catch(function () { try { localStorage.removeItem(STORE); } catch (e) {} showLocks(); });
  } else showLocks();
})();
