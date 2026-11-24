/* 주문서 · 주문 조회 공용 (2026-11-22) — 서버 = Apps Script 웹 앱 (빌더와 같은 주소) */
(function () {
  var SERVER = window.NC_SERVER || 'https://script.google.com/macros/s/AKfycbwcvu1k3HLs8aGLRlp2007acu-CQCtjm4TMZFfDdHQf2p-n0ZCEO9hynKv1byQIhye7/exec';
  var KAKAO = 'https://open.kakao.com/o/s6SgPQXi';

  function call(obj) {
    // text/plain 으로 보내면 미리 묻기(preflight) 없이 간다 — 서버는 JSON 그대로 읽음
    return fetch(SERVER, { method: 'POST', body: JSON.stringify(obj), redirect: 'follow' })
      .then(function (r) { return r.json(); });
  }
  function won(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }
  function day(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return (+m[2]) + '월 ' + (+m[3]) + '일(' + '일월화수목금토'[d.getDay()] + ')';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function product(o) { return esc(o.product) + (o.with_switch ? ' + 순정형 배기 스위치' : ''); }
  /** ★11-22 가격 종류 표시 — v1 이벤트 · v1 할인일 때만 */
  function kindTag(o) {
    var k = String(o.price_kind || '');
    if (k === 'v1 이벤트') return '<span class="kind">v1 고객 감사 이벤트</span>';
    if (k === 'v1 할인') return '<span class="kind">v1 고객 할인</span>';
    return '';
  }
  function copyBtn(text) { return '<button type="button" class="copy" data-copy="' + esc(text) + '">복사</button>'; }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]');
    if (!b) return;
    var t = b.getAttribute('data-copy');
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
      b.textContent = '복사됨'; setTimeout(function () { b.textContent = '복사'; }, 1400);
    }, function () { window.prompt('복사해 주세요', t); });
  });

  /** 입금 안내 칸 */
  function payBox(o) {
    var acc = o.account
      ? '<div class="row"><span>은행</span><span>' + esc(o.bank) + '</span></div>' +
        '<div class="row"><span>계좌</span><span>' + esc(o.account) + copyBtn(String(o.account).replace(/[^0-9]/g, '')) + '</span></div>' +
        '<div class="row"><span>예금주</span><span>' + esc(o.holder) + '</span></div>'
      : '<div class="row"><span>입금 계좌</span><span>카카오톡으로 안내합니다</span></div>';
    return '<div class="box"><h2>입금 안내</h2>' + acc +
      '<div class="row"><span>입금할 금액</span><span class="amt">' + won(o.amount) + copyBtn(String(o.amount)) + '</span></div>' +
      (o.payer ? '<div class="row"><span>입금자명</span><span>' + esc(o.payer) + '</span></div>' : '') +
      (o.due ? '<div class="row"><span>입금 기한</span><span>' + day(o.due) + '까지</span></div>' : '') +
      '<p class="hint">입금자명이 주문자 이름과 다르면 카카오톡으로 알려 주세요.<br>기한이 지나면 주문이 취소될 수 있습니다.</p></div>';
  }

  /** 진행 상황 */
  function trackBox(o) {
    var st = o.state || '접수', d = o.dates || {};
    if (st === '취소' || st === '환불') {
      return '<div class="box"><h2>진행 상황</h2><p class="cancel">' + (st === '환불' ? '환불된 주문입니다' : '취소된 주문입니다') +
        (d.cancel ? ' · ' + day(d.cancel) : '') + '</p><p class="hint">궁금한 점은 카카오톡으로 문의해 주세요.</p></div>';
    }
    // ★11-24 6단계 — 입금 완료 → 제작 중 → 제작 완료 · 발송 준비 → 발송
    var lv = { '접수': 0, '입금': 1, '제작 중': 2, '제작 완료': 3, '출고': 4, '배송': 4, '완료': 5 }[st];
    if (lv === undefined) lv = 0;
    var steps = [
      ['주문 접수', d.order ? day(d.order) : '', lv === 0 ? '입금을 기다리고 있습니다' : ''],
      ['입금 완료', d.paid ? day(d.paid) : '', lv === 1 ? (o.ship_note || '제작 순서를 기다리고 있습니다') : ''],
      ['제작 중', d.made ? day(d.made) : '', lv === 2 ? '제작하고 있습니다' : ''],
      ['제작 완료 · 발송 준비', d.built ? day(d.built) : '', lv === 3 ? '발송을 준비하고 있습니다' : ''],
      ['발송', d.ship ? day(d.ship) : '', ''],
      ['배송 완료', d.delivered ? day(d.delivered) : '', '']
    ];
    var LAST = steps.length - 1, SHIP = 4;
    var html = '<div class="box"><h2>진행 상황</h2><ol class="steps2">';
    steps.forEach(function (s, i) {
      var cls = i < lv ? 'done' : i === lv ? (lv === LAST ? 'done' : 'now') : 'todo';
      html += '<li class="' + cls + '"><b>' + s[0] + '</b>' + (s[1] ? '<div class="d">' + s[1] + '</div>' : '') +
        (s[2] ? '<div class="d">' + esc(s[2]) + '</div>' : '');
      if (i === SHIP && lv >= SHIP && o.invoice) {
        html += '<div class="d">송장 ' + esc(o.invoice) + copyBtn(String(o.invoice).replace(/[^0-9]/g, '')) + '</div>';
      }
      html += '</li>';
    });
    return html + '</ol></div>';
  }

  function orderHead(o) {
    return '<div class="box sum"><div class="k">주문번호 ' + esc(o.order_no) + (o.test ? '<span class="test">시험</span>' : '') + '</div>' +
      kindTag(o) + '<div class="p">' + product(o) + '</div>' +
      '<div class="row"><span>차종</span><span>' + esc(o.vehicle || '-') + '</span></div>' +
      '<div class="row"><span>금액</span><span>' + won(o.amount) + '</span></div>' +
      (o.ship_note && (o.state === '접수' || o.state === '입금') ? '<div class="row"><span>발송</span><span>' + esc(o.ship_note) + '</span></div>' : '') + '</div>';
  }

  function afterBox() {
    return '<a class="sub-go" href="' + KAKAO + '" target="_blank" rel="noopener">카카오톡 문의</a>';
  }

  window.NCShop = { call: call, won: won, day: day, esc: esc, product: product, kindTag: kindTag, payBox: payBox, trackBox: trackBox,
                    orderHead: orderHead, afterBox: afterBox, copyBtn: copyBtn, KAKAO: KAKAO };
})();
