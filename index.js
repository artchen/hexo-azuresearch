'use strict';

const AzureSearch = require('./lib/azuresearch');

hexo.extend.console.register('azuresearch', 'Index posts on Azure Search', {
  options: []
}, (options, callback) => {
  AzureSearch(hexo, options, callback);
});