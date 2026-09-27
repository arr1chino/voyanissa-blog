/* 给手写的 css / js 自动挂一个「本次构建」的版本号（?v=xxxx）。
   为什么需要：GitHub Pages 给静态文件发的是 cache-control: max-age=600，
   也就是浏览器十分钟内不会再去问服务器「这个文件变了没」。
   发布之后就会出现「新 HTML + 旧 CSS」的错位 —— 卡片标题变白、位置跑偏这类
   只在缓存期才出现的怪毛病，用户看到的是坏页面，刷新一下又好了，很难查。
   URL 上带一个每次构建都不同的版本号，浏览器就会当成新文件去取，
   HTML 和 CSS/JS 永远同一批，不用再让人按 Ctrl+F5。
   只处理自己手写的那几个：/css/hero.css、/css/lenis.css、/js/hero.js、/js/hb-*.js。
   主题自己生成的 index.css、utils.js 等不碰（它们已经被主题的 ?v= 管着）。 */

const STAMP = Date.now().toString(36);

const RULES = [
  [/\/css\/hero\.css(\?v=[\w.]+)?/g, '/css/hero.css?v=' + STAMP],
  [/\/css\/lenis\.css(\?v=[\w.]+)?/g, '/css/lenis.css?v=' + STAMP],
  [/\/js\/hero\.js(\?v=[\w.]+)?/g, '/js/hero.js?v=' + STAMP],
  [/\/js\/hb-[a-z-]+\.js(\?v=[\w.]+)?/g, function (m) { return m.replace(/\?v=[\w.]+$/, '') + '?v=' + STAMP; }],
];

hexo.extend.filter.register('after_render:html', function (str) {
  let out = str;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
});
