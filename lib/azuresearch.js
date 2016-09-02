/**
 * Index Hexo posts and upload to Azure Search
 * Based on hexo-algoliasearch (https://github.com/LouisBarranqueiro/hexo-algoliasearch)
 * @param args {Object}
 * @param callback {Function}
 */
function AzureSearch(args, callback) {
  var _ = require('lodash');
  var hexoUtil = require('hexo-util');
  var async = require('async');
  var request = require('request');
  var Q = require('q');

  var hexo = this;
  var config = hexo.config.AzureSearch;
  var fields = getFields(config.fields);
  var customFields = getCustomFields(config.fields);
  var log = hexo.log;
  var posts = [];
  var actions = {};

  actions.strip = hexoUtil.stripHTML;

  /**
   * Process a post
   * @param post {Object} a hexo post object
   * @return post {Object} a post extracted object for algolia
   */
  function processPost(post) {
    var key = null;
    var object = {};

    object = _.pick(post, fields);
    object.postId = post._id;

    if (fields.indexOf('tags') >= 0) {
      object.tags = getProperty(post, 'tags');
    }
    if (fields.indexOf('categories') >= 0) {
      object.categories = getProperty(post, 'categories');
    }

    for (key in customFields) {
      if (customFields.hasOwnProperty(key)) {
        var field = customFields[key].split(':');
        var fieldName = field[0];
        var actionName = field[1];
        var actionFn = actions[actionName];
        var fieldContent = post[fieldName];
        // handle cases where excerpt may not exist 
        // when <!--more--> is not present
        if (fieldName === "excerpt" && fieldContent === "") {
          fieldContent = hexoUtil.truncate(hexoUtil.stripHTML(post.content), {
            length: 200,
            omission: "...",
            separator: " "
          });
        }
        if (actionFn instanceof Function) {
          object[fieldName + _.upperFirst(actionName)] = actionFn(fieldContent);
        }
      }
    }

    object['@search.action'] = 'mergeOrUpload';
    return object;
  }

  /**
   * Extract a given property from an hexo post object
   * @param post {Object} a hexo post object
   * @param property {String} a property name of hexo post objects
   */
  function getProperty(post, property) {
    var tags = [];
    for (key in post[property].data) {
      if (post[property].data.hasOwnProperty(key)) {
        if (post[property].data[key].hasOwnProperty('name')) {
          tags.push(post[property].data[key].name);
        }
      }
    }
    return tags;
  }

  /**
   * Index posts
   * @param index {String} an index name
   * @param posts {Array} an array of hexo post objects
   */
  function indexPosts(index, posts) {
    // split our results into chunks of 5,000 objects,
    // to get a good indexing/insert performance
    var chunkedPosts = _.chunk(posts, config.chunkSize || 5000);
    log.info('Indexing posts ...');
    async.each(chunkedPosts, index.saveObjects.bind(index), function(err) {
      if (err) {
        log.info('Failed to index posts : ' + err);
        throw err;
      }
      log.info('Indexation done. ' +posts.length+ + ' posts indexed.');
    });
  }

  /**
   * Upload generated posts index to Azure Search
   * @param posts {Array} an array of generated posts
   */
  function uploadPosts(posts) {
    var deferred = Q.defer();
    var url = config.serviceURL + '/indexes/' + config.indexName + "/docs/index?api-version=2015-02-28";
    var headers = {
      'api-key': config.apiKey,
      'Content-type': 'application/json'
    };
    var options = {
      url: url,
      headers: headers,
      body: JSON.stringify({
        "value": posts
      }),
      withCredentials: false
    };
    request.post(options, function(error, response, body) {
      log.info("run result: " + response.statusCode);
      deferred.resolve();
    });

    return deferred.promise;
  }

  /**
   * Initialization
   * no param
   */
  function init() {
    hexo.extend.filter.register('after_post_render', function(post) {
      if (post.published) {
        posts.push(processPost(post));
      }
      return post;
    });

    log.info('Clearing posts ...');
    hexo.call('clean', function(err) {
      if (err) {
        log.info('Failed to clear posts : ' + err);
        return callback(err);
      }

      hexo.call('generate', function(err) {
        if (err) {
          log.info('Failed to generate posts : ' + err);
          return callback(err);
        }
        log.info(posts.length + ' posts collected.');
        
        // TODO: upload posts to Azure Search
        uploadPosts(posts);
      });
    });
  }

  init();
}

function getFields(fields) {
  return fields.filter(function(field) {
    return !/:/.test(field);
  });
};

function getCustomFields(fields) {
  return fields.filter(function(field) {
    return /:/.test(field);
  });
};

module.exports = AzureSearch;