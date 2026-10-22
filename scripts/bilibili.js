'use strict';
hexo.extend.filter.register('before_post_render', require('../lib/bilibili.cjs').appendVideo);
