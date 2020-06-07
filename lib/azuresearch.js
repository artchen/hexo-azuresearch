const HexoUtil = require('hexo-util');
const Axios = require('axios');

/**
 * Extract a list type metadata from an Hexo post.
 * @param {object} post a hexo post object
 * @param {prop} prop property name e.g. tags
 */
const transformListProp = (post, prop) => {
  const items = [];
  Object.keys(post[prop].data).forEach(item => {
    if (item.name) {
      items.push(item.name);
    }
  });
  return items;
}

/**
 * Trnasform a Hexo post to an AzureSearch document.
 * @param {object} post a hexo post object
 * @prarm {object} config azure search config
 * @return post
 */
const transformPost = (post, config) => {
  const excerpt = post.excerpt || post.content || '';
  return {
    postId: post.slug,
    permalink: post.permalink,
    path: post.path,
    title: post.title,
    date: post.date.format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    excerpt: HexoUtil.truncate(HexoUtil.stripHTML(excerpt), {
      length: config.excerptLimit || 200,
      omission: '...',
      separator: ''
    }),
    tags: transformListProp(post, 'tags'),
    categories: transformListProp(post, 'categories'),
    '@search.action': 'mergeOrUpload'
  };
}

/**
 * Delete an index.
 * @param hexo 
 * @param config 
 */
const deleteIndex = async (hexo, config) => {
  const { serviceURL, serviceUrl, indexName, apiVersion, adminKey } = config;
  const url = `${serviceURL || serviceUrl}/indexes/${indexName}?api-version=${apiVersion}`;
  const headers = {
    'api-key': adminKey,
    'Content-Type': 'application/json'
  };
  try {
    const response = await Axios({
      method: 'delete',
      url,
      headers,
    });
    hexo.log.info('AzureSearch deleted index.');
    if (config.verbose) {
      hexo.log.info(JSON.stringify(response.data));
    }
    return Promise.resolve(response);
  } catch (e) {
    hexo.log.error('AzureSearch failed to delete index. But it might be OK.');
    hexo.log.error(e);
    hexo.log.error(JSON.stringify(e.response.data));
    return Promise.resolve();
  }
};

/**
 * Create an index.
 * @param hexo
 * @param indexFields
 * @param config
 * @returns {Promise<*>}
 */
const createIndex = async (hexo, indexFields, config) => {
  const { serviceURL, serviceUrl, indexName, apiVersion, adminKey } = config;
  const url = `${serviceURL || serviceUrl}/indexes/${indexName}?api-version=${apiVersion}`;
  const headers = {
    'api-key': adminKey,
    'Content-Type': 'application/json'
  };
  try {
    const response = await Axios({
      method: 'put',
      url,
      headers,
      data: {
        name: indexName,
        fields: indexFields,
        corsOptions: {
          allowedOrigins: ['*'],
          maxAgeInSeconds: 300
        }
      },
    });
    hexo.log.info('AzureSearch created index.');
    if (config.verbose) {
      hexo.log.info(JSON.stringify(response.data));
    }
    return Promise.resolve(response);
  } catch (e) {
    hexo.log.error('AzureSearch failed to create index.');
    hexo.log.error(e);
    hexo.log.error(JSON.stringify(e.response.data));
    return Promise.reject(e);
  }
};

/**
 * Index a post to AzureSearch.
 * @param hexo
 * @param posts
 * @param config
 * @returns {Promise<void|any>}
 */
const indexDocuments = async (hexo, posts, config) => {
  const { serviceURL, serviceUrl, indexName, apiVersion, adminKey } = config;
  const url = `${serviceURL || serviceUrl}/indexes/${indexName}/docs/index?api-version=${apiVersion}`;
  const headers = {
    'api-key': config.adminKey,
    'Content-Type': 'application/json'
  };
  try {
    const response = await Axios({
      method: 'post',
      url,
      headers,
      data: {
        value: posts
      },
    });
    hexo.log.info('AzureSearch indexed documents.');
    if (config.verbose) {
      hexo.log.info(JSON.stringify(response.data));
    }
    return Promise.resolve(response);
  } catch (e) {
    hexo.log.error('AzureSearch failed to index documents.');
    hexo.log.error(JSON.stringify(e.response.data));
    return Promise.reject(e);
  }
};

const AzureSearch = async (hexo, args, callback) => {
  const config = {
    ...hexo.config.AzureSearch,
    apiVersion: '2019-05-06'
  };
  const fields = [
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
  const fieldNames = fields.map(field => field.name);
  const posts = [];

  hexo.extend.filter.register('after_post_render', function(post) {
    if (post.published) {
      posts.push(transformPost(post, config));
    }
    return post;
  });

  const log = hexo.log;

  log.info('AzureSearch is claning up posts...');
  hexo.call('clean', (err) => {
    if (err) {
      log.info('AzureSearch failed to clean up posts : ' + err);
      return callback(err);
    }

    hexo.call('generate', {}).then(async (err) => {
      if (err) {
        log.info('AzureSearch failed to generate posts : ' + err);
        return callback(err);
      }

      log.info(`AzureSearch collected ${posts.length} posts.`);

      try {
        await deleteIndex(hexo, config);
        await createIndex(hexo, fields, config);
        await indexDocuments(hexo, posts, config);
      } catch (e) {
        log.error('AzureSearch exit due to error');
      }
    });
  });
};

module.exports = AzureSearch;
