# vapr-conditionals [![Build Status](https://travis-ci.org/JoshuaWise/vapr-conditionals.svg?branch=master)](https://travis-ci.org/JoshuaWise/vapr-conditionals)

## Installation

```bash
npm install --save vapr
npm install --save vapr-conditionals
```

## Usage

This plugin enables [conditional requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Conditional_requests). Specifically, it handles the If-Match, If-None-Match, If-Modified-Since, and If-Unmodified-Since headers, while providing clients with the ETag and Last-Modified headers.

Conditional requests can make your server more efficient by saving bandwidth on responses that don't change very often. Also, they can empower clients to avoid certain race conditions.

```js
const crypto = require('crypto');
const conditionals = require('vapr-conditionals');
const app = require('vapr')();
const route = app.get('/foo');

route.use(conditionals({
  etag: res => crypto.createHash('md5').update(res.body).digest('base64'),
}));
```
