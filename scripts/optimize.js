/* Optimize Hexo routes before generate writes them to public/.
 * after_generate runs before public files are written, so modifying public/ here
 * optimizes the previous build and gets overwritten by the current one.
 * Replacing route data works for clean builds, incremental builds and hexo server.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CleanCSS = require('clean-css');
const terser = require('terser');
const CSS_FILES = new Set(['css/hero.css', 'css/lenis.css']);

function readRoute(name) {
  return new Promise((resolve, reject) => {
    const stream = hexo.route.get(name);
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function versionHeroModules(source) {
  return source.replace(/(from\s*['"])(\.\/hero\/[\w-]+\.js)(?:\?v=[\w-]+)?(['"])/g, (_, prefix, specifier, quote) => {
    const helper = fs.readFileSync(path.resolve(hexo.source_dir, 'js', specifier), 'utf8');
    const hash = crypto.createHash('sha256').update(helper).digest('hex').slice(0, 12);
    return prefix + specifier + '?v=' + hash + quote;
  });
}

hexo.extend.filter.register('after_generate', async function () {
  const cleaner = new CleanCSS({ level: { 1: { all: true } }, rebase: false });
  const names = hexo.route.list().filter((name) => CSS_FILES.has(name) ||
    (/^js\/(?:[^/]+|hero\/[^/]+)\.js$/i.test(name) && !/\.min\.js$/i.test(name)));

  for (const name of names) {
    const original = await readRoute(name);
    let output;
    try {
      if (CSS_FILES.has(name)) {
        const result = cleaner.minify(original);
        if (result.errors.length) throw new Error(result.errors.join(' / '));
        output = result.styles;
      } else {
        const source = name === 'js/hero.js' ? versionHeroModules(original) : original;
        const module = /^\s*(import|export)[\s{]/m.test(source);
        const result = await terser.minify(source, {
          module,
          compress: { passes: 2, ecma: 2020, toplevel: module },
          mangle: module ? { toplevel: true } : true,
          format: { comments: /@license|@preserve|Copyright/ }
        });
        output = result.code;
      }
      if (output == null) throw new Error('Optimizer returned no output');
    } catch (err) {
      // Stop a broken build instead of quietly publishing a different script.
      throw new Error('optimize: ' + name + ': ' + err.message);
    }
    hexo.route.set(name, output);
    hexo.log.info('optimize: %s %sKB -> %sKB', name,
      Math.round(Buffer.byteLength(original) / 1024), Math.round(Buffer.byteLength(output) / 1024));
  }
});
