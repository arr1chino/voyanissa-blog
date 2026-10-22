'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Keep this workflow when hexo-deployer-git replaces the published tree.
hexo.extend.filter.register('after_generate', () => {
  hexo.route.set('.github/workflows/pages.yml',
    fs.readFileSync(path.join(hexo.base_dir, 'deployment/pages.yml'), 'utf8'));
});
