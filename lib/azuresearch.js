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
  var log = hexo.log;
  var fields = [
    {
      "name": "postId",
      "type": "Edm.String",
      "searchable": false,
      "filterable": false,
      "retrievable": true,
      "sortable": false,
      "facetable": false,
      "key": true
    },
    {
      "name": "title",
      "type": "Edm.String",
      "searchable": true,
      "filterable": false,
      "retrievable": true,
      "sortable": false,
      "facetable": false,
      "key": false,
      "analyzer": config.analyzer || null
    },
    {
      "name": "date",
      "type": "Edm.DateTimeOffset",
      "searchable": false,
      "filterable": false,
      "retrievable": true,
      "sortable": true,
      "facetable": false,
      "key": false
    },
    {
      "name": "excerpt",
      "type": "Edm.String",
      "searchable": true,
      "filterable": false,
      "retrievable": true,
      "sortable": false,
      "facetable": false,
      "key": false,
      "analyzer": config.analyzer || null
    },
    {
      "name": "permalink",
      "type": "Edm.String",
      "searchable": false,
      "filterable": false,
      "retrievable": true,
      "sortable": false,
      "facetable": false,
      "key": false
    },
    {
      "name": "path",
      "type": "Edm.String",
      "searchable": false,
      "filterable": false,
      "retrievable": true,
      "sortable": false,
      "facetable": false,
      "key": false
    },
    {
      "name": "tags",
      "type": "Collection(Edm.String)",
      "searchable": true,
      "filterable": false,
      "retrievable": true,
      "sortable": false,
      "facetable": false,
      "key": false,
      "analyzer": config.analyzer || null
    },
    {
      "name": "categories",
      "type": "Collection(Edm.String)",
      "searchable": true,
      "filterable": false,
      "retrievable": true,
      "sortable": false,
      "facetable": false,
      "key": false,
      "analyzer": config.analyzer || null
    }
  ];
  var fieldList = ['title', 'date', 'excerpt', 'permalink', 'path', 'tags', 'categories'];
  var posts = [];
  config.apiVersion = "2015-02-28";

  /**
   * Process a post
   * @param post {Object} a hexo post object
   * @return post {Object} a post extracted object for algolia
   */
  function processPost(post) {
    var key = null;
    var object = {};

    object = _.pick(post, fieldList);
    object['@search.action'] = 'mergeOrUpload';
    object.postId = post.slug;
    object.tags = getProperty(post, 'tags');
    object.categories = getProperty(post, 'categories');
    object.date = post.date.format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    object.excerpt = hexoUtil.truncate(hexoUtil.stripHTML(post.content), {
      length: config.excerptLimit || 200,
      omission: "...",
      separator: ""
    });
    return object;
  }

  /**
   * Extract a given property from an hexo post object
   * @param post {Object} a hexo post object
   * @param property {String} a property name of hexo post objects
   */
  function getProperty(post, property) {
    var tags = [];
    for (var key in post[property].data) {
      if (post[property].data.hasOwnProperty(key)) {
        if (post[property].data[key].hasOwnProperty('name')) {
          tags.push(post[property].data[key].name);
        }
      }
    }
    return tags;
  }

  /**
   * Delete the existing index on azure search
   * no param
   */
  function deleteIndex() {
    var deferred = Q.defer();
    var url = config.serviceURL + '/indexes/' +config.indexName+ '?api-version=' +config.apiVersion;
    var headers = {
      'api-key': config.adminKey,
      'Content-type': 'application/json'
    };
    var options = {
      url: url,
      headers: headers,
      withCredentials: false
    };
    request.del(options, function(error, response, body) {
      log.info('delete index result: ' + response.statusCode);
      log.info(body);
      deferred.resolve();
    });
    return deferred.promise;
  }

  /**
   * Create a new index on azure search
   * no param
   */
  function createIndex() {
    var deferred = Q.defer();
    var url = config.serviceURL + "/indexes/" +config.indexName+ "?api-version=" +config.apiVersion;
    var headers = {
      'api-key': config.adminKey,
      'Content-Type': 'application/json'
    };
    var options = {
      url: url,
      headers: headers,
      body: JSON.stringify({
        "name": config.indexName,
        "fields": fields,
        "scoringProfiles": [],
        "defaultScoringProfile": null,
        "corsOptions": {
          "allowedOrigins": ["*"],
          "maxAgeInSeconds": 300
        },
        "suggesters": []
      }),
      withCredentials: false
    };
    request.put(options, function(error, response, body){
      log.info("create index result: " + response.statusCode);
      log.info(body);
      deferred.resolve();
    });
    return deferred.promise;
  }

  /**
   * Upload generated posts data to Azure Search
   * no param
   */
  function uploadData() {
    var deferred = Q.defer();
    var url = config.serviceURL + '/indexes/' +config.indexName+ "/docs/index?api-version=" +config.apiVersion;
    var headers = {
      'api-key': config.adminKey,
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
      log.info("upload posts result: " + response.statusCode);
      log.info(body);
      if (response.statusCode === 200) {
        log.info("Successfully uploaded index data to Azure Search.");
      }
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

      hexo.call('generate', {}).then(function(err) {
        if (err) {
          log.info('Failed to generate posts : ' + err);
          return callback(err);
        }
        log.info(posts.length + ' posts collected.');
        
        deleteIndex()
          .then(createIndex)
          .then(uploadData);
      });
    });
  }

  init();
}

module.exports = AzureSearch;