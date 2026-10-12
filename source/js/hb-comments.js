/* ============================================================
   评论区 · 全站脚本（只有文章页真的会画出来）

   后端在哪：Cloudflare 上那台中转站（voyanissa-ai/comments.js），
             留言存在 D1。前端只跟这三个地址说话：
               GET    <API>/api/comments?page=<当前网址>   读一页的全部留言
               POST   <API>/api/comments                   发一条
               DELETE <API>/api/comments/<id>              删一条（要站长钥匙）

   接口地址怎么定（按顺序找）：
     1. window.HB_COMMENT_API —— 本地联调时用
     2. 网址后面带的 ?api=https://xxx —— 不用重新构建就能临时换一台
     3. 本机预览（localhost / 127.0.0.1）→ 走同源，配合本地静态服务器转发
     4. 都没有 → 正式那台 api.shiq.me

   为什么不用现成的 Gitalk / Giscus / Waline / Twikoo：
     Gitalk / Giscus 要求访客登录 GitHub 才发得出来，对国内访客门槛太高；
     Waline / Twikoo 官方不支持 Cloudflare。所以评论区是自己写的，
     访客不注册、不登录，填个昵称就能说。

   为什么通篇不用 innerHTML 拼字符串：
     正文是访客原样存进来的，拼 innerHTML 等于把 XSS 的口子敞开 ——
     有人留一句 <img onerror=...> 就能偷走别人的登录态。这里一律
     createElement + textContent，正文里那几个链接单独用 <a> 拼，
     而且 href 还要过一遍协议白名单。
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 挂载点：只有「文章页」才干活 ----------
     主题给文章页的 #body-wrap 打的是 class="post"，
     日历页 / 聊天页 / 标签页那些打的是 class="page"，
     所以这第一行就能把非文章页全挡在门外，不用一个个列名单。 */
  var wrap = document.querySelector('#body-wrap.post');
  var host = document.getElementById('post');
  if (!wrap || !host) return;
  if (host.getAttribute('data-hbcm') === '1') return;
  host.setAttribute('data-hbcm', '1');

  var MAX = 600;
  var API = resolveApi();
  var PAGE = location.pathname;
  var draftKey = 'hb-cmt-draft:' + PAGE;
  var loadVersion = 0;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function motion() { return reducedMotion ? 'auto' : 'smooth'; }

  /* ---------- 接口地址 ---------- */
  function resolveApi() {
    var fromQuery = '';
    try { fromQuery = new URLSearchParams(location.search).get('api') || ''; } catch (e) { fromQuery = ''; }
    var configured = String(window.HB_COMMENT_API || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    if (fromQuery && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
      try { var custom = new URL(fromQuery); if (/^https?:$/.test(custom.protocol)) return custom.origin; } catch (e) {}
    }
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return location.origin;
    return 'https://api.shiq.me';
  }

  /* ---------- 站长钥匙：只存在这一个浏览器标签页里，不进网页、不进仓库 ----------
     想开管理模式就在网址后面加 ?cmtadmin=1，评论区右上角会多出一把小锁，
     点它把钥匙粘进去，之后每条留言旁边就多一个删除小叉。 */
  var adminKey = '';
  try { adminKey = sessionStorage.getItem('hb-cmt-key') || ''; } catch (e) { adminKey = ''; }
  var wantAdmin = /(^|[?&])cmtadmin=1(&|$)/.test(location.search);

  /* ---------- 小工具 ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function icon(name) {
    return el('i', 'fas ' + name);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fullTime(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function niceTime(ts) {
    var diff = Date.now() - ts;
    if (!isFinite(diff)) return '';
    if (diff < 0) return '刚刚';
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 86400000 * 7) return Math.floor(diff / 86400000) + ' 天前';
    return fullTime(ts).slice(0, 10);
  }

  /* 昵称 → 一个稳定的颜色。同一个人每次刷新都是同一颗头，不会乱跳。 */
  function tintOf(nick) {
    var h = 0;
    for (var i = 0; i < nick.length; i++) h = (h * 31 + nick.charCodeAt(i)) % 360;
    return {
      a: 'hsl(' + h + ' 62% 62%)',
      b: 'hsl(' + ((h + 38) % 360) + ' 66% 48%)'
    };
  }

  /* 正文里的链接：只认 http / https，其它一律当普通文字。
     这样 javascript: 那种花招进不来（后端也只数了几个 http 链接）。 */
  function fillBody(node, text) {
    var re = /https?:\/\/[^\s<>"'）】]+/g;
    var last = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = el('a', null, m[0]);
      a.href = m[0];
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      node.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  }

  /* ---------- 网络：统一带上超时，免得接口抽风时一直转圈 ---------- */
  function request(opt) {
    opt = opt || {};
    var head = {};
    if (opt.body) head['Content-Type'] = 'application/json';
    if (opt.admin) head['X-Admin-Key'] = adminKey;

    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;

    return fetch(API + opt.path, {
      method: opt.method || 'GET',
      headers: head,
      body: opt.body ? JSON.stringify(opt.body) : undefined,
      signal: ctrl ? ctrl.signal : undefined,
      mode: 'cors',
      credentials: 'omit'
    }).then(function (res) {
      return res.text().then(function (raw) {
        var data = {};
        try { data = JSON.parse(raw); } catch (e) { data = {}; }
        if (timer) clearTimeout(timer);
        return { status: res.status, data: data };
      }, function () { if (timer) clearTimeout(timer); return { status: res.status, data: {} }; });
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  /* ============================================================
     把评论区画出来
     ============================================================ */
  var items = [];
  var replyTo = null;
  var busy = false;

  var shell = el('section', 'hbcm');
  shell.id = 'hb-comments';
  shell.setAttribute('aria-label', '评论区');

  /* ---- 头 ---- */
  var top = el('div', 'hbcm-top');
  var heading = el('div', 'hbcm-heading');
  heading.appendChild(icon('fa-comments'));
  heading.appendChild(el('h3', 'hbcm-h', '评论'));
  var count = el('span', 'hbcm-n', '…');
  heading.appendChild(count);
  top.appendChild(heading);

  var lock = el('button', 'hbcm-lock');
  lock.type = 'button';
  lock.title = '站长管理';
  lock.setAttribute('aria-label', '站长管理');
  lock.appendChild(icon('fa-lock'));
  if (!wantAdmin && !adminKey) lock.hidden = true;
  top.appendChild(lock);

  top.appendChild(el('p', 'hbcm-note', '不用注册、不用登录 · 填个昵称就能说'));
  shell.appendChild(top);

  /* ---- 表单 ---- */
  var form = el('form', 'hbcm-form');
  form.noValidate = true;

  function field(labelText, hint, inputId, max, placeholder, type) {
    var lab = el('label', 'hbcm-f');
    var l = el('span', 'hbcm-lbl', labelText);
    if (hint) {
      var h = el('em', null, hint);
      l.appendChild(h);
    }
    lab.appendChild(l);
    var input = el('input');
    input.id = inputId;
    input.maxLength = max;
    input.placeholder = placeholder;
    input.type = type || 'text';
    if (type === 'email') input.autocomplete = 'email';
    lab.appendChild(input);
    return lab;
  }

  var grid = el('div', 'hbcm-grid');
  grid.appendChild(field('昵称', '必填', 'hbcm-nick', 24, '怎么称呼你'));
  grid.appendChild(field('邮箱', '选填 · 不会公开', 'hbcm-mail', 64, 'name@example.com', 'email'));
  form.appendChild(grid);
  form.appendChild(field('主页', '选填', 'hbcm-site', 120, 'https://…'));

  var replyBar = el('div', 'hbcm-reply');
  replyBar.hidden = true;
  var replyWho = el('span', 'hbcm-reply-who');
  replyBar.appendChild(replyWho);
  var replyX = el('button', 'hbcm-reply-x', '取消');
  replyX.type = 'button';
  replyBar.appendChild(replyX);
  form.appendChild(replyBar);

  var body = el('textarea', 'hbcm-body');
  body.id = 'hbcm-body';
  body.rows = 4;
  body.setAttribute('aria-label', '评论内容');
  body.setAttribute('aria-describedby', 'hbcm-counter');
  body.placeholder = '说点什么吧…';
  form.appendChild(body);

  /* 蜜罐：真人看不见这一格，机器人爱把所有框都填满。填了的人后端直接当空气。 */
  var hp = el('div', 'hbcm-hp');
  hp.setAttribute('aria-hidden', 'true');
  var hpLab = el('label', null, '请勿填写这一格');
  var hpInput = el('input');
  hpInput.id = 'hbcm-hp';
  hpInput.tabIndex = -1;
  hpInput.autocomplete = 'off';
  hpLab.appendChild(hpInput);
  hp.appendChild(hpLab);
  form.appendChild(hp);

  var actions = el('div', 'hbcm-actions');
  var counter = el('span', 'hbcm-count', '0 / ' + MAX);
  counter.id = 'hbcm-counter';
  actions.appendChild(counter);
  var msg = el('span', 'hbcm-msg');
  msg.setAttribute('role', 'alert');
  actions.appendChild(msg);
  var send = el('button', 'hbcm-send', '发表');
  send.type = 'submit';
  actions.appendChild(send);
  form.appendChild(actions);

  shell.appendChild(form);

  /* ---- 列表 ---- */
  var list = el('ul', 'hbcm-list');
  list.setAttribute('aria-live', 'polite');
  shell.appendChild(list);
  var refresh = el('button', 'hbcm-tool hbcm-refresh', '刷新评论');
  refresh.type = 'button';
  refresh.addEventListener('click', function () { load(); });
  shell.appendChild(refresh);

  host.appendChild(shell);

  var nickEl = document.getElementById('hbcm-nick');
  var mailEl = document.getElementById('hbcm-mail');
  var siteEl = document.getElementById('hbcm-site');

  /* 上次填过的昵称/邮箱存浏览器里，下次进来不用重敲。 */
  function loadWho() {
    var who = null;
    try { who = JSON.parse(localStorage.getItem('hb-cmt-who') || 'null'); } catch (e) { who = null; }
    if (!who) return;
    if (who.nick) nickEl.value = who.nick;
    if (who.mail) mailEl.value = who.mail;
    if (who.site) siteEl.value = who.site;
  }
  function saveWho() {
    try {
      localStorage.setItem('hb-cmt-who', JSON.stringify({
        nick: nickEl.value.trim(), mail: mailEl.value.trim(), site: siteEl.value.trim()
      }));
    } catch (e) { /* 隐私模式存不了就算了 */ }
  }

  /* ============================================================
     渲染
     ============================================================ */
  function avatarOf(item) {
    var box = el('span', 'hbcm-ava');
    if (item.admin) {
      var img = el('img');
      img.src = '/img/avatar.webp';
      img.alt = '';
      img.width = 40;
      img.height = 40;
      img.decoding = 'async';
      img.loading = 'lazy';
      box.appendChild(img);
      box.classList.add('is-admin');
    } else {
      var t = tintOf(item.nick || '?');
      box.style.backgroundImage = 'linear-gradient(135deg, ' + t.a + ', ' + t.b + ')';
      box.textContent = Array.from(item.nick || '?')[0] || '?';
    }
    return box;
  }

  function renderOne(item, depth) {
    var li = el('li', 'hbcm-item' + (depth ? ' is-child' : ''));
    li.id = 'hbcm-' + item.id;

    var head = el('div', 'hbcm-item-head');
    head.appendChild(avatarOf(item));

    var who = el('div', 'hbcm-who');
    var nameRow = el('div', 'hbcm-name-row');
    var nameText = item.nick || '匿名';
    var siteUrl = '';
    try { var parsedSite = new URL(item.site); if (/^https?:$/.test(parsedSite.protocol)) siteUrl = parsedSite.href; } catch (e) {}
    if (siteUrl) {
      var link = el('a', 'hbcm-name', nameText);
      link.href = siteUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer nofollow';
      nameRow.appendChild(link);
    } else {
      nameRow.appendChild(el('span', 'hbcm-name', nameText));
    }
    if (item.parent) {
      var target = items.find(function (x) { return x.id === item.parent; });
      if (target) nameRow.appendChild(el('span', 'hbcm-reply-target', '回复 @' + target.nick));
    }
    if (item.admin) nameRow.appendChild(el('span', 'hbcm-badge', '站长'));
    who.appendChild(nameRow);

    var time = el('time', 'hbcm-time', niceTime(item.created));
    time.title = fullTime(item.created);
    if (isFinite(new Date(item.created).getTime())) time.dateTime = new Date(item.created).toISOString();
    who.appendChild(time);
    head.appendChild(who);

    var tools = el('div', 'hbcm-tools');
    var replyBtn = el('button', 'hbcm-tool', '回复');
    replyBtn.type = 'button';
    replyBtn.addEventListener('click', function () { startReply(item); });
    tools.appendChild(replyBtn);

    if (adminKey) {
      var del = el('button', 'hbcm-tool is-del', '删除');
      del.type = 'button';
      del.addEventListener('click', function () { removeComment(item, li); });
      tools.appendChild(del);
    }
    head.appendChild(tools);
    li.appendChild(head);

    var text = el('div', 'hbcm-text');
    fillBody(text, item.body || '');
    li.appendChild(text);
    return li;
  }

  function render() {
    list.textContent = '';
    count.textContent = items.length ? items.length + ' 条' : '还没有';

    if (!items.length) {
      var empty = el('li', 'hbcm-empty');
      empty.appendChild(icon('fa-water'));
      empty.appendChild(el('span', null, '还没有人说话，来坐第一个沙发吧'));
      list.appendChild(empty);
      return;
    }

    /* 楼中楼只做一层：parent 指向一楼的那些挂在它下面。 */
    var byId = {};
    var i;
    for (i = 0; i < items.length; i++) byId[items[i].id] = items[i];

    var tops = [];
    var kids = {};
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      var root = it;
      var visited = {};
      while (root.parent && byId[root.parent] && !visited[root.parent]) {
        visited[root.id] = true;
        root = byId[root.parent];
      }
      if (root.id !== it.id) {
        (kids[root.id] = kids[root.id] || []).push(it);
      } else {
        tops.push(it);
      }
    }

    for (i = 0; i < tops.length; i++) {
      var topLi = renderOne(tops[i], 0);
      var children = kids[tops[i].id];
      if (children && children.length) {
        var sub = el('ul', 'hbcm-sub');
        for (var j = 0; j < children.length; j++) sub.appendChild(renderOne(children[j], 1));
        topLi.appendChild(sub);
      }
      list.appendChild(topLi);
    }
  }

  function say(text, kind) {
    msg.textContent = text || '';
    msg.className = 'hbcm-msg' + (kind ? ' is-' + kind : '');
  }

  /* ============================================================
     读 / 发 / 删
     ============================================================ */
  function load(scrollTo) {
    var version = ++loadVersion;
    refresh.disabled = true;
    list.setAttribute('aria-busy', 'true');
    if (!items.length) { list.textContent = ''; list.appendChild(el('li', 'hbcm-empty', '正在加载评论…')); }
    return request({ path: '/api/comments?page=' + encodeURIComponent(PAGE) })
      .then(function (res) {
        if (version !== loadVersion) return;
        refresh.disabled = false;
        list.setAttribute('aria-busy', 'false');
        if (res.status !== 200 || !res.data || res.data.ok !== true) {
          showBroken(res);
          return;
        }
        items = Array.isArray(res.data.items) ? res.data.items : [];
        render();
        if (msg.classList.contains('is-bad')) say('');
        if (scrollTo) {
          var target = document.getElementById('hbcm-' + scrollTo);
          if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center', behavior: motion() });
        }
      }, function () {
        if (version !== loadVersion) return;
        refresh.disabled = false;
        list.setAttribute('aria-busy', 'false');
        showBroken(null);
      });
  }

  function showBroken(res) {
    list.textContent = '';
    var li = el('li', 'hbcm-empty is-bad');
    li.appendChild(icon('fa-plug-circle-xmark'));
    li.appendChild(el('span', null, '评论暂时读不出来，稍后再刷新看看'));
    list.appendChild(li);
    count.textContent = '暂不可用';
    var retry = el('button', 'hbcm-tool', '重新加载');
    retry.type = 'button';
    retry.addEventListener('click', function () { load(); });
    li.appendChild(retry);
    var detail = res && res.data && (res.data.hint || res.data.error);
    say(detail ? String(detail) : '连不上评论服务器', 'bad');
  }

  function startReply(item) {
    replyTo = item;
    replyWho.textContent = '回复 @' + (item.nick || '匿名');
    replyBar.hidden = false;
    if (body.scrollIntoView) body.scrollIntoView({ block: 'center', behavior: motion() });
    try { body.focus({ preventScroll: true }); } catch (e) { body.focus(); }
  }

  function clearReply() {
    replyTo = null;
    replyBar.hidden = true;
    replyWho.textContent = '';
  }

  replyX.addEventListener('click', clearReply);

  body.addEventListener('input', function () {
    var n = Array.from(body.value).length;
    counter.textContent = n + ' / ' + MAX;
    counter.classList.toggle('is-over', n > MAX);
    try { sessionStorage.setItem(draftKey, body.value); } catch (e) {}
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;

    var nick = nickEl.value.trim();
    var text = body.value.trim();
    if (!nick) { say('先填个昵称吧', 'bad'); nickEl.focus(); return; }
    if (!text) { say('内容还是空的', 'bad'); body.focus(); return; }
    if (Array.from(text).length > MAX) { say('太长了，最多 ' + MAX + ' 个字', 'bad'); return; }

    if (mailEl.value && !mailEl.checkValidity()) { say('请填写有效的邮箱地址', 'bad'); mailEl.focus(); return; }
    if (siteEl.value.trim()) {
      try { var site = new URL(/^https?:\/\//i.test(siteEl.value.trim()) ? siteEl.value.trim() : 'https://' + siteEl.value.trim()); if (!/^https?:$/.test(site.protocol) || site.username || site.password) throw new Error(); }
      catch (err) { say('请填写有效的 http 或 https 主页地址', 'bad'); siteEl.focus(); return; }
    }
    busy = true;
    send.disabled = true;
    say('正在发…', 'wait');

    request({
      path: '/api/comments',
      method: 'POST',
      admin: Boolean(adminKey),
      body: {
        page: PAGE,
        parent: replyTo ? replyTo.id : 0,
        nick: nick,
        mail: mailEl.value.trim(),
        site: siteEl.value.trim(),
        body: text,
        hp: hpInput.value
      }
    }).then(function (res) {
      busy = false;
      send.disabled = false;
      if (res.status === 200 && res.data && res.data.ok) {
        saveWho();
        body.value = '';
        try { sessionStorage.removeItem(draftKey); } catch (e) {}
        counter.classList.remove('is-over');
        counter.textContent = '0 / ' + MAX;
        var newId = res.data.item && res.data.item.id;
        clearReply();
        say('发出去了 ✓', 'ok');
        setTimeout(function () { say(''); }, 2600);
        load(newId);
        return;
      }
      var hint = (res.data && (res.data.hint || res.data.error)) || ('发不出去（' + res.status + '）');
      say(String(hint), 'bad');
    }, function () {
      busy = false;
      send.disabled = false;
      say('网络不太顺，等会儿再试', 'bad');
    });
  });

  function removeComment(item, node) {
    if (!adminKey) return;
    if (!window.confirm('删掉这条留言？' + (items.some(function (x) { return x.parent === item.id; }) ? '（它下面的回复会一起删）' : ''))) return;
    request({ path: '/api/comments/' + item.id, method: 'DELETE', admin: true })
      .then(function (res) {
        if (res.status === 200 && res.data && res.data.ok) {
          say('删掉了', 'ok');
          setTimeout(function () { say(''); }, 2200);
          load();
          return;
        }
        if (res.status === 403) { say('钥匙不对，重新点小锁填一次', 'bad'); forgetKey(); return; }
        say('没删掉，稍后再试', 'bad');
      }, function () { say('网络不太顺，等会儿再试', 'bad'); });
  }

  /* ============================================================
     站长钥匙：只放在这个标签页的 sessionStorage 里 ——
     关掉标签页就没了，也不会跟着网页发到任何地方去。
     ============================================================ */
  function forgetKey() {
    adminKey = '';
    try { sessionStorage.removeItem('hb-cmt-key'); } catch (e) { /* 忽略 */ }
    lock.classList.remove('is-on');
    render();
  }

  lock.addEventListener('click', function () {
    if (adminKey) {
      if (window.confirm('退出站长管理模式？')) forgetKey();
      return;
    }
    var key = window.prompt('输入站长钥匙（只存在这个浏览器标签页里）');
    if (!key) return;
    adminKey = key.trim();
    try { sessionStorage.setItem('hb-cmt-key', adminKey); } catch (e) { /* 忽略 */ }
    lock.classList.add('is-on');
    say('管理模式已打开', 'ok');
    setTimeout(function () { say(''); }, 2400);
    render();
  });
  if (adminKey) lock.classList.add('is-on');
  if (adminKey) lock.hidden = false;

  body.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  loadWho();
  try { body.value = sessionStorage.getItem(draftKey) || ''; } catch (e) {}
  counter.textContent = Array.from(body.value).length + ' / ' + MAX;
  load();
})();
