/* ===== 整站的两个小零件（每一页都会加载） =====
   1) 右下角三个小圆钮：回到顶部 / 白天黑夜切换 / 回首页。
   2) 深海底色：不是首页的那些页（文章页、日历页…）也铺上同一片流光蓝，
      内容卡片还是白的浮在上面 —— 这样整站看着是同一个人做的。

   黑白模式：记住上次的选择（存在浏览器自己的 localStorage 里），
   刷新之后还是你上次选的那个。一次都没选过的访客默认进黑夜模式。
   真正的开关在 <html> 上的两个属性：data-theme 交给主题的配色用，
   hb-dark 是我自己那几块（首页的卡片、流光蓝）用。 */
(function () {
  'use strict';

  var KEY = 'hb-theme';
  var root = document.documentElement;

  function readTheme() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === 'dark' || v === 'light') return v;
    } catch (e) { /* 隐私模式下读不到就算了 */ }
    return 'dark';
  }

  function paintTheme(mode) {
    var dark = mode === 'dark';
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.classList.toggle('hb-dark', dark);

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#071722' : '#ffffff');

    var btn = document.getElementById('hb-fab-theme');
    if (btn) {
      var icon = btn.querySelector('i');
      if (icon) icon.className = 'fas ' + (dark ? 'fa-sun' : 'fa-moon');
      btn.setAttribute('title', dark ? '切换到白天模式' : '切换到黑夜模式');
      btn.setAttribute('aria-label', btn.getAttribute('title'));
    }
  }

  function saveTheme(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) { /* 存不了就算了，本次有效 */ }
  }

  /* 首页的滚动是 Lenis 接管的，window.scrollTo 会被拽回去，所以优先走它的接口 */
  function toTop() {
    if (window.__hero && typeof window.__hero.scrollTo === 'function') {
      window.__hero.scrollTo(0, { duration: 0.9 });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function buildButtons() {
    if (document.getElementById('hb-fabs')) return;

    var box = document.createElement('div');
    box.className = 'hb-fabs';
    box.id = 'hb-fabs';
    box.innerHTML =
      '<button id="hb-fab-top" class="hb-fab" type="button" title="回到顶部" aria-label="回到顶部">' +
        '<i class="fas fa-arrow-up"></i></button>' +
      '<button id="hb-fab-theme" class="hb-fab" type="button" title="切换到黑夜模式" aria-label="切换到黑夜模式">' +
        '<i class="fas fa-moon"></i></button>' +
      '<a id="hb-fab-home" class="hb-fab" href="/" title="回到首页" aria-label="回到首页">' +
        '<i class="fas fa-water"></i></a>';
    document.body.appendChild(box);

    document.getElementById('hb-fab-top').addEventListener('click', toTop);
    document.getElementById('hb-fab-theme').addEventListener('click', function () {
      var next = root.classList.contains('hb-dark') ? 'light' : 'dark';
      saveTheme(next);
      paintTheme(next);
      window.dispatchEvent(new CustomEvent('hb-theme-change', { detail: next }));
    });
  }

  /* 不是首页就把那片流光蓝铺上：body 最前面插一个跟首页同一个 .hero-flow */
  function buildOcean() {
    if (root.classList.contains('hero-mode')) return;
    root.classList.add('hb-ocean');
    var flow = document.createElement('div');
    flow.className = 'hero-flow';
    document.body.insertBefore(flow, document.body.firstChild);
  }

  /* 右边那条滚动条：鼠标贴到窗口最右边时，给她贴个记号，
     让滑块「吸」地胀开一点，按住拖动再胀一档（在 css 里）。
     鼠标一旦压到滚动条上，网页这边就收不到移动事件了，
     所以判定线取「离右边还差 1px」——效果上就是光标一贴边就触发。 */
  function bindScrollbar() {
    var hot = false, drag = false;

    function paint() {
      root.classList.toggle('is-sb-hot', hot);
      root.classList.toggle('is-sb-drag', drag);
    }

    document.addEventListener('mousemove', function (e) {
      var near = e.clientX >= root.clientWidth - 1;
      if (near !== hot) { hot = near; paint(); }
    }, { passive: true });

    document.addEventListener('mousedown', function () {
      if (hot && !drag) { drag = true; paint(); }
    }, true);

    document.addEventListener('mouseup', function () {
      if (drag) { drag = false; paint(); }
    }, true);

    function reset() {
      if (!hot && !drag) return;
      hot = false; drag = false; paint();
    }
    document.addEventListener('mouseleave', reset);
    window.addEventListener('blur', reset);
  }

  /* ===== 页脚平台方块里的「点一下复制」 =====
     抖音 / B站 / QQ / GitHub 是真链接，点了直接跳走，用不到下面这套。
     微信压根没有「网页跳微信」这种东西，原神那一行也只是我的 UID，
     两个都跳不了 —— 所以给它们改成：点一下把号码复制到剪贴板，
     再从屏幕下方飘一条小提示，告诉访客「复制好了，去微信搜这个就行」。

     用法：给任意元素挂 data-hb-copy="要复制的内容"，
     想自定义提示语就再加 data-hb-copy-tip="……"。
     只挂 data-hb-copy、没有 href 的元素也能点。 */
  function showToast(msg) {
    var box = document.getElementById('hb-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'hb-toast';
      box.className = 'hb-toast';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    box.textContent = msg;
    // 先摘掉再戴上，连续点两次才会重新播一遍淡入，不会僵在那里
    box.classList.remove('is-on');
    void box.offsetWidth;
    box.classList.add('is-on');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { box.classList.remove('is-on'); }, 2800);
  }

  function copyText(text) {
    /* 老浏览器、或者 http 页面里没有 navigator.clipboard，
       就拿一个看不见的输入框选中再 execCommand 兜一下。 */
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* 复制不了就算了，提示照样弹 */ }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(fallback);
    }
    fallback();
    return Promise.resolve();
  }

  function bindCopyRows() {
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-hb-copy]') : null;
      if (!el) return;
      var text = el.getAttribute('data-hb-copy');
      if (!text) return;
      // 这类行的 href 写的是 '#'，不拦一下的话点完会「嗖」地跳回页首
      var href = el.getAttribute('href');
      if (!href || href === '#') e.preventDefault();
      copyText(text).then(function () {
        showToast(el.getAttribute('data-hb-copy-tip') || ('已复制：' + text));
      });
    });
  }

  function boot() {
    paintTheme(readTheme());
    buildOcean();
    buildButtons();
    bindScrollbar();
    bindCopyRows();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
