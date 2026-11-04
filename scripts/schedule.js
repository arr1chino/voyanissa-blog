'use strict';
const {buildSchedule} = require('../lib/schedule.cjs');

// The authenticated editor publishes source/_data/schedule.yml through the existing GitHub workflow.
hexo.extend.generator.register('public-schedule', function (locals) {
  const schedule = buildSchedule(locals.data.schedule);
  return {
    path: 'js/hb-calendar-data.js',
    data: 'window.HB_PUBLIC_SCHEDULE = ' + JSON.stringify(schedule) + ';'
  };
});
