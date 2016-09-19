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
  var indexFields = [];
  var actions = {};

  actions.strip = hexoUtil.stripHTML;
  config.apiVersion = "2015-02-28";

  /**
   * Process a post
   * @param post {Object} a hexo post object
   * @return post {Object} a post extracted object for algolia
   */
  function processPost(post) {
    var key = null;
    var object = {};

    object = _.pick(post, fields);
    object['@search.action'] = 'mergeOrUpload';
    object.postId = post.slug;

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
            length: 100,
            omission: "...",
            separator: ""
          });
        }
        if (actionFn instanceof Function) {
          object[fieldName + _.upperFirst(actionName)] = actionFn(fieldContent);
        }
      }
    }
    return object;
  }

  /**
   * Generate azure search index
   * no param
   */
  function generateIndexFields() {
    var key = null;
    addIndexField('postId', true, false, null);
    for (key in fields) {
      addIndexField(fields[key], false, true, config.analyzer);
    }
    for (key in customFields) {
      var field = customFields[key].split(':');
      addIndexField(field[0] + _.upperFirst(field[1]), false, true, config.analyzer);
    }
  }

  /**
   * Add an index field
   * @param name {String} name of the field
   * @param isKey {Boolean} is this field a key
   * @param searchable {Boolean} is this field searchable
   * @param analyzer {String} language analyze or not
   */
  function addIndexField(name, isKey, searchable, analyzer) {
    indexFields.push({
      "name": name,
      "type": "Edm.String",
      "searchable": searchable,
      "filterable": false,
      "retrievable": true,
      "sortable": false,
      "facetable": false,
      "key": isKey,
      "analyzer": analyzer || null
    });
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
        "fields": indexFields,
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
    generateIndexFields();
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