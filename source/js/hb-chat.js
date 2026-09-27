/* ============================================================
   和沃聊天 · 页面脚本（/chat/ 那一页用）

   这一页只负责「画聊天窗 + 把话递出去」，真正的人设和钥匙在
   Cloudflare 上那台中转站里（在 voyanissa-ai/ 那个文件夹）。

   接口地址怎么定（按顺序找）：
     1. 网址后面带的参数，例如 /chat/?api=https://xxx.workers.dev
        —— 临时试一个地址用这个，不用重新构建网站
     2. 页面里写死的 window.HB_CHAT_API（在 source/chat/index.md 顶上）
     3. 在本机预览时（地址是 localhost）自动指到 http://localhost:8787
        —— 也就是 voyanissa-ai 里 `node dev-server.js` 起的那台
     4. 都没有 → 显示「还没接通」，输入框禁用

   开场白由中转站随机给一句（想换语气去改 persona.js 里的 GREETINGS）。
   ============================================================ */
(function () {
  'use strict';

  var CONFIGURED = String(window.HB_CHAT_API || '').trim();

  function resolveEndpoint() {
    var fromQuery = '';
    try { fromQuery = new URLSearchParams(location.search).get('api') || ''; } catch (e) { fromQuery = ''; }
    if (fromQuery) return fromQuery.replace(/\/+$/, '');
    if (CONFIGURED) return CONFIGURED.replace(/\/+$/, '');
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return 'http://localhost:8787';
    return '';
  }

  var API = resolveEndpoint();

  /* 只有你和她的话会被记住；刷新一下就清空。 */
  var history = [];
  var busy = false;
  var greeted = false;

  var root = document.getElementById('hb-chat');
  if (!root) return;

  /* ---------- 先把聊天窗画出来 ---------- */
  root.innerHTML =
    '<div class="hbc-shell">' +
      '<div class="hbc-head">' +
        '<span class="hbc-ava">' +
          '<img src="/img/voyanissa-avatar.png" ' +
            'srcset="/img/voyanissa-avatar.png 1x, /img/voyanissa-avatar@2x.png 2x" ' +
            'alt="" width="42" height="42" decoding="async">' +
          '<span class="hbc-dot" aria-hidden="true"></span>' +
        '</span>' +
        '<span class="hbc-who">沃雅妮莎<small>离群的水妖 · 首席女高音</small></span>' +
        '<span class="hbc-meter" id="hbc-meter">读取中…</span>' +
      '</div>' +
      '<div class="hbc-log" id="hbc-log" role="log" aria-live="polite"></div>' +
      '<form class="hbc-form" id="hbc-form">' +
        '<textarea class="hbc-input" id="hbc-input" rows="1" autocomplete="off" ' +
          'placeholder="和她说点什么…"></textarea>' +
        '<button class="hbc-send" id="hbc-send" type="submit">说</button>' +
      '</form>' +
      '<p class="hbc-foot">Enter 发送 · Shift+Enter 换行 · 刷新页面就重置对话</p>' +
    '</div>';

  var log = document.getElementById('hbc-log');
  var form = document.getElementById('hbc-form');
  var input = document.getElementById('hbc-input');
  var sendBtn = document.getElementById('hbc-send');
  var meter = document.getElementById('hbc-meter');

  function bubble(who, text) {
    var row = document.createElement('div');
    row.className = 'hbc-row ' + who;
    var b = document.createElement('div');
    b.className = 'hbc-bubble';
    b.textContent = text || '';
    row.appendChild(b);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return b;
  }

  function system(text) {
    var d = document.createElement('div');
    d.className = 'hbc-sys';
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  /* 三个点的「正在打字」——只动 opacity，不碰布局 */
  function typing() {
    var row = document.createElement('div');
    row.className = 'hbc-row her hbc-typing';
    row.innerHTML = '<div class="hbc-bubble"><span></span><span></span><span></span></div>';
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return row;
  }

  function setMeter(info) {
    if (!info) return;
    meter.innerHTML =
      '今日余量 ' + Math.round(info.budgetLeft / 1000) + 'k<br>' +
      '每 ' + Math.round(info.windowSec / 60) + ' 分钟 ' + info.perIpLimit + ' 句';
  }

  function killInput(reason) {
    input.disabled = true;
    sendBtn.disabled = true;
    input.placeholder = reason;
  }

  if (!API) {
    system('中转站还没接通 —— 等 Cloudflare 那边的地址拿到，填进 source/chat/index.md 顶上的引号里，重新构建就好。');
    killInput('中转站还没接通');
    return;
  }

  function refreshStatus() {
    return fetch(API + '/api/status')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        setMeter(j);
        if (!j.configured) system('服务器还没放钥匙，她暂时起不来。');
      })
      .catch(function () {
        system('连不上中转站（' + API + '）。本地试玩的话，先在那个文件夹里把试玩服务器跑起来。');
        killInput('连不上中转站');
      });
  }

  /* 开场白只插一次（第一次问状态的时候顺带要一句） */
  function greetOnce() {
    return fetch(API + '/api/status')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (greeted) return;
        greeted = true;
        bubble('her', j.greeting || '（水面哗啦一声）嘿，有人来了。');
      })
      .catch(function () {
        if (greeted) return;
        greeted = true;
        bubble('her', '（水面哗啦一声）嘿，有人来了。');
      });
  }

  refreshStatus();
  greetOnce();

  /* ---------- 发一句话 ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;

    input.value = '';
    bubble('me', text);
    history.push({ role: 'user', content: text });

    busy = true;
    sendBtn.disabled = true;
    var dots = typing();
    var out = null;
    var caret = null;

    var accrued = '';
    var finished = false;

    function fail(msg) {
      if (finished) return;
      finished = true;
      if (dots.parentNode) dots.parentNode.removeChild(dots);
      if (caret) caret.remove();
      system(msg);
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }

    fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (j) {
            var wait = j.retryAfter ? '（约 ' + Math.ceil(j.retryAfter / 60) + ' 分钟后再来）' : '';
            throw new Error((j.hint || j.error || ('出错了 ' + res.status)) + wait);
          });
        }

        if (dots.parentNode) dots.parentNode.removeChild(dots);
        out = bubble('her', '');
        caret = document.createElement('span');
        caret.className = 'hbc-caret';
        out.appendChild(caret);

        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var tail = '';

        function pump() {
          return reader.read().then(function (step) {
            if (step.done) {
              if (caret) caret.remove();
              if (accrued) history.push({ role: 'assistant', content: accrued });
              if (history.length > 24) history = history.slice(-24);
              finished = true;
              busy = false;
              sendBtn.disabled = false;
              refreshStatus();
              return;
            }
            tail += dec.decode(step.value, { stream: true });
            var lines = tail.split('\n');
            tail = lines.pop();
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (line.indexOf('data:') !== 0) continue;
              var raw = line.slice(5).trim();
              if (!raw || raw === '[DONE]') continue;
              try {
                var obj = JSON.parse(raw);
                var d = obj.choices && obj.choices[0] && obj.choices[0].delta;
                if (d && d.content) {
                  accrued += d.content;
                  out.textContent = accrued;
                  out.appendChild(caret);
                  log.scrollTop = log.scrollHeight;
                }
              } catch (err) { /* 半截 JSON，等下一块拼上 */ }
            }
            return pump();
          });
        }
        return pump();
      })
      .catch(function (err) { fail(String(err.message || err)); });
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  /* 输入框跟着字长高一点点（最高 6 行），不出现滚动条那种小气样 */
  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  });

  input.focus();
})();
