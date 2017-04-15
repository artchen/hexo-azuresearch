# hexo-azuresearch

This Hexo plugin index your hexo blog and upload to Azure Search service.

For detailed setup procedures, please follow this tutorial: [https://artifact.me/universal-search-5-azure-search/](https://artifact.me/universal-search-5-azure-search/).

## Install

```bash
npm install --save hexo-azuresearch
```

## Config

Add the following lines in your hexo global `_config.yml`. The analyzer field is optional, please refer to [https://msdn.microsoft.com/en-us/library/azure/dn879793.aspx](https://msdn.microsoft.com/en-us/library/azure/dn879793.aspx) for a list of supported languages. In the following example I use Simplified Chinese.

```yml
AzureSearch:
  serviceURL: "<your-azure-search-service-url>"
  indexName: "<choose-a-index-name>"
  adminKey: "<your-azure-search-primary-admin-key>"
  excerptLimit: 300
  analyzer: "zh-Hans.lucene" # optional
```

## Run

This command will automatically re-generate the hexo site. You don't need to `hexo clean`.

```bash
hexo azuresearch
```
