/* ============================================================
   构建收尾：把网站「自己手写的那几份」CSS / JS 压小一遍，再写回 public。

   为什么要有这一步：hero.css / hero.js / hb-*.js 是手写的，
   source/ 里留着带注释的原文（方便以后改），但发布出去的那一份没必要
   连注释和缩进一起发。这里在 generate 结束之后就地压一遍 ——
   只动产物，不动 source/，所以以后再改代码还是改原文。

   只压这几处，别的都不碰：
     public/css/hero.css、public/css/lenis.css
     public/js/*.js（*.min.js 已经是压过的，跳过）
   主题那份 index.css 由 stylus 自己压（见 _config.yml 的 stylus.compress），
   vendor/ 下面本来就是压缩产物 —— 都不在这里处理。

   ES module（带 import/export 的，比如 hero.js）按 module 规则压，
   普通 <script> 按脚本规则压（顶层名字一个都不许改名：那些文件之间
   是靠顶层变量互相串的，改名就全断了）。
   任何一步压失败都只记一行日志、原文照发，绝不让构建挂掉。
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const CSS_FILES = ['css/hero.css', 'css/lenis.css'];

function readIf(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return null;
  }
}

function writeOut(hexo, rel, before, after) {
  const file = path.join(hexo.public_dir, rel);
  fs.writeFileSync(file, after);
  const pct = before.length ? Math.round((1 - after.length / before.length) * 100) : 0;
  hexo.log.info(
    'optimize: %s  %sKB -> %sKB (-%s%%)',
    rel, Math.round(before.length / 1024), Math.round(after.length / 1024), pct
  );
}

hexo.extend.filter.register('after_generate', function () {
  const CleanCSS = require('clean-css');
  const cleaner = new CleanCSS({ level: { 1: { all: true } }, rebase: false, returnPromise: false });

  CSS_FILES.forEach(function (rel) {
    const src = readIf(path.join(hexo.public_dir, rel));
    if (src === null) return;
    try {
      const out = cleaner.minify(src);
      if (out.errors && out.errors.length) throw new Error(out.errors.join(' / '));
      if (out.styles) writeOut(hexo, rel, src, out.styles);
    } catch (e) {
      hexo.log.warn('optimize: %s 压缩失败，已按原文发布（%s）', rel, e.message);
    }
  });

  const terser = require('terser');
  const jsDir = path.join(hexo.public_dir, 'js');
  let names = [];
  try { names = fs.readdirSync(jsDir).filter((n) => /\.js$/i.test(n) && !/\.min\.js$/i.test(n)); }
  catch (e) { names = []; }

  return names.reduce(function (chain, name) {
    return chain.then(function () {
      const rel = 'js/' + name;
      const src = readIf(path.join(jsDir, name));
      if (src === null) return;
      const isModule = /^\s*(import|export)[\s{]/m.test(src);
      const opts = {
        compress: { passes: 2, ecma: 2020 },
        mangle: true,
        format: { comments: /@license|@preserve|Copyright/ },
      };
      if (isModule) {
        /* module 的顶层名字外面没人引用，可以放心缩短（省得更多） */
        opts.module = true;
        opts.compress.toplevel = true;
        opts.mangle = { toplevel: true };
      }
      return terser.minify(src, opts).then(function (out) {
        if (out.error) throw out.error;
        if (out.code) writeOut(hexo, rel, src, out.code);
      }).catch(function (e) {
        /* 一定要把行号打出来。terser 的报错原文只有一句 "Unexpected character '（'"，
           没有位置 —— r140 就吃了这个亏：hero.js 里有个中文全角括号漏在注释外面，
           解析当场失败，构建却只是一声不吭地把 72KB 的原文照发（而压缩后只有 23KB），
           页面上看不出来，只有加载页白白多下 50KB。日志里带上 line/col，
           下次一眼就能定位。 */
        const where = (e && typeof e.line === 'number')
          ? ' @' + rel + ':' + e.line + ':' + (e.col || 0)
          : '';
        hexo.log.warn('optimize: %s 压缩失败，已按原文发布（%s%s）', rel, e.message, where);
      });
    });
  }, Promise.resolve());
});
