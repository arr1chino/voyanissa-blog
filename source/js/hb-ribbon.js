/* ===== 跟着鼠标走的水光拖尾（整站都在） =====
   为什么不用主题自带的那个：
   主题的 canvas_ribbon 是「刷新时随机画一次、之后再也不动」的硬边折纸色块，
   跟鼠标没有任何关系，还会拿 document.onclick 抢点击事件，看着就像坏了。

   这里换成一条真跟手的拖尾：一串互相牵引的点（「每个点去追它前面那个点」
   就是丝带手感的来源），描成三层从宽到窄的光带。
   鼠标停下后光带自己化开，随后连动画循环也停掉，不白耗电。手机上不画。

   两套画法，按当前页自动切：
   · 首页（整屏都是海蓝）走「加法发光」—— 光叠在蓝上是越来越亮的水光；
   · 别的页（白底文章卡浮在海蓝上）走「水彩」—— 半透明的蓝压在白纸上
     才看得见，加法叠白纸等于什么都没画。
   想让水光更浓：把 ALPHA 往上加；太抢眼就往下调。 */
(function () {
  'use strict';

  if (/Android|webOS|iPhone|iPod|iPad|BlackBerry/i.test(navigator.userAgent)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var ALPHA = 1;       // 整体浓度总开关
  var POINTS = 22;     // 拖尾由多少个点串成：越多越长越软
  var FOLLOW = 0.34;   // 每帧追赶的比例：越大越跟手
  var DECAY = 0.966;   // 松开鼠标后光带化开的速度
  var CORE_TO = 0.55;  // 最亮的那根芯画到整条拖尾的百分之多少为止（做出尾端收细）

  /* 三层光带：由宽到窄、由淡到亮。每层都是「一笔画完」，
     所以同一根光带自己重叠的地方不会越叠越白。 */
  var GLOW = [
    { width: 26, rgb: '168,232,255', a: 0.16, blend: 'lighter' },
    { width: 9, rgb: '206,245,255', a: 0.30, blend: 'lighter' },
    { width: 2.4, rgb: '255,255,255', a: 0.55, blend: 'lighter' }
  ];
  var INK = [
    { width: 30, rgb: '88,182,231', a: 0.13, blend: 'source-over' },
    { width: 11, rgb: '56,163,219', a: 0.15, blend: 'source-over' },
    { width: 2.6, rgb: '214,248,255', a: 0.50, blend: 'lighter' }
  ];

  var canvas = document.createElement('canvas');
  canvas.className = 'hb-ribbon';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'z-index:3;pointer-events:none;';
  document.body.appendChild(canvas);

  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = window.innerWidth;
  var H = window.innerHeight;

  /* 改 canvas 尺寸会把画布状态清空，所以这里每样都得重设一遍 */
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  var pts = [];
  var soft = [];
  for (var i = 0; i < POINTS; i++) {
    pts.push({ x: -999, y: -999 });
    soft.push({ x: -999, y: -999 });
  }

  var target = { x: -999, y: -999 };
  var energy = 0;
  var hasPointer = false;
  var running = false;
  var tick = 0;

  function onMove(e) {
    if (!hasPointer) {
      /* 鼠标第一次出现：整条拖尾直接落到指针上，别让它从屏幕角落飞过来 */
      for (var k = 0; k < pts.length; k++) { pts[k].x = e.clientX; pts[k].y = e.clientY; }
      hasPointer = true;
    }
    target.x = e.clientX;
    target.y = e.clientY;
    energy = 1;
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onMove, { passive: true });
  document.addEventListener('mouseleave', function () { hasPointer = false; });

  function strokeBand(from, to, band, alpha) {
    var head = soft[from];
    var tail = soft[to];
    if (head.x < -900 || tail.x < -900) return;

    var started = false;
    ctx.beginPath();
    for (var i = from; i <= to; i++) {
      var p = soft[i];
      if (p.x < -900) continue;
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    }
    if (!started) return;

    /* 顺着拖尾的方向由亮到透 —— 这样尾端是「化开」而不是「切断」 */
    var g = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
    g.addColorStop(0, 'rgba(' + band.rgb + ',' + alpha.toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(' + band.rgb + ',' + (alpha * 0.45).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + band.rgb + ',0)');

    ctx.globalCompositeOperation = band.blend;
    ctx.strokeStyle = g;
    ctx.lineWidth = band.width;
    ctx.stroke();
  }

  function draw() {
    var n = pts.length;
    /* 底色是深蓝的时候（首页，或者任何页切到黑夜）走加法发光；
       白底的时候走水彩 —— 加法叠白纸等于什么都没画。
       每帧读一次 class 而已，开销可以忽略。 */
    var root = document.documentElement;
    var bands = (root.classList.contains('hero-mode') || root.classList.contains('hb-dark')) ? GLOW : INK;

    /* 先把这一帧的点算出来（叠一点很轻的水波），三层共用同一批坐标 */
    for (var i = 0; i < n; i++) {
      var t = 1 - i / (n - 1);
      soft[i].x = pts[i].x;
      soft[i].y = pts[i].y + Math.sin(tick * 0.05 - i * 0.6) * (1.5 + 3 * (1 - t));
    }

    var coreTo = Math.round((n - 1) * CORE_TO);
    for (var b = 0; b < bands.length; b++) {
      var band = bands[b];
      strokeBand(0, b === bands.length - 1 ? coreTo : n - 1,
        band, band.a * ALPHA * energy);
    }
  }

  function frame() {
    tick++;
    var n = pts.length;

    /* 每个点去追它前面那个点 —— 丝带的手感就来自这里 */
    pts[0].x += (target.x - pts[0].x) * FOLLOW;
    pts[0].y += (target.y - pts[0].y) * FOLLOW;
    for (var i = 1; i < n; i++) {
      pts[i].x += (pts[i - 1].x - pts[i].x) * FOLLOW;
      pts[i].y += (pts[i - 1].y - pts[i].y) * FOLLOW;
    }

    energy *= DECAY;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    if (energy > 0.02 && hasPointer) {
      draw();
      requestAnimationFrame(frame);
    } else {
      energy = 0;
      running = false;
    }
  }
})();
