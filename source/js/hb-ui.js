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

  function boot() {
    paintTheme(readTheme());
    buildOcean();
    buildButtons();
    bindScrollbar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
