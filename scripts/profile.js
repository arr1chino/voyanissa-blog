'use strict';
const {readSettings, applyProfile} = require('../lib/profile.cjs');
let settings;

// Data files have been processed here, before any page or metadata is rendered.
hexo.extend.filter.register('before_generate', function () {
  settings = readSettings(hexo.locals.get('data'));
  applyProfile(hexo.config, hexo.theme.config, settings.profile);
}, 1);
hexo.extend.helper.register('blogProfile', () => settings.profile);
hexo.extend.helper.register('blogHomepage', () => settings.homepage);
