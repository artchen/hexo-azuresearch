'use strict';

var azuresearch = require('./lib/azuresearch');

hexo.extend.console.register('azuresearch', 'Index posts on Azure Search', {
  options: []
}, azuresearch);