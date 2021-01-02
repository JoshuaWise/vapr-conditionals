# vapr-conditionals [![Build Status](https://travis-ci.org/JoshuaWise/vapr-conditionals.svg?branch=master)](https://travis-ci.org/JoshuaWise/vapr-conditionals)

## Installation

```bash
npm install --save vapr
npm install --save vapr-conditionals
```

## Usage

This plugin enables [conditional requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Conditional_requests). Specifically, it handles the If-Match, If-None-Match, If-Modified-Since, and If-Unmodified-Since headers, while providing clients with ETag and Last-Modified headers. Conditional requests can make your server more efficient by saving bandwidth on responses that don't change very often, and they can empower clients to avoid certain race conditions.

When you add this plugin to a route, a new function called `req.validate()` becomes available. You *must* call `req.validate()` exactly once before returning a successful response. When you do, you can provide it with a [`lastModified`](#optionslastmodified--null) date, a [`weak`](#optionsweak--null) ETag, or a [`strong`](#optionsstrong--null) ETag (details down below). The `req.validate()` function can throw a `304 Not Modified` or a `412 Precondition Failed` response, or it can simply return normally, allowing your app to generate its typical (`2xx`) response.

```js
const conditionals = require('vapr-conditionals');
const app = require('vapr')();
const route = app.get('/foo');

route.use(conditionals());
route.use((req) => {
	req.validate({ lastModified: new Date(someTimestamp) });
	return [[someData]];
});
```

Any checks that you perform which may cause a `3xx` or `4xx` response should be done *before* calling `req.validate()`. In other words, `req.validate()` should only be called immediately before generating a successful response (or immediately before perfoming any meaningful actions, in the case of `POST`, `PUT`, `DELETE`, or `PATCH` requests).

## Options

### options.lastModified = *null*

The simplest way to use this plugin is to call `req.validate()` with the `lastModified` option, which must be a [`Date`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) object. The given date represents the last time that the requested resource was modified (or created). If the requested resource does not exist, you should use `null` instead of a `Date` object (or simply call `req.validate()` without any options).

```js
req.validate({ lastModified: new Date(someTimestamp) });
```

When you use this approach, a weak ETag header will automatically be generated from the given date, and the Last-Modified header will also be sent as a fallback for older clients that don't support ETags.

Don't use this approach if any of the following statements are true:

- You'd like to invalidate caches based on something other than the given `lastModified` date.
- Your clients need guaranteed data freshness with a precision finer than 1 second.
- Your clients need to use the If-Match header to avoid certain race conditions.
- You don't want to support conditional requests for legacy clients that don't support ETags.

### options.weak = *null*

If you need to invalidate caches based on factors other than a [`lastModified`](#optionslastmodified--null) date, you can instead call `req.validate()` with the `weak` option, which must be an array of strings and/or [`Buffers`](https://nodejs.org/api/buffer.html). All data in the array will be hashed and combined to generate a single weak ETag. If any element of the array is different from one request to another, the generated ETags will also be different (which will invalidate caches). If the requested resource does not exist, you should use `null` instead of an array (or simply call `req.validate()` without any options).

```js
// ISO strings have millisecond resolution
const isoString = new Date(someTimestamp).toISOString();

req.validate({ weak: [isoString, requestedLanguage] });
```

When you use this approach, an ETag header will be sent, but the Last-Modified header will *not* be sent unless you also provide a [`lastModified`](#optionslastmodified--null) date.

### options.strong = *null*

If your clients need to use the If-Match header to avoid certain race conditions, you must use *strong* ETags instead of a *weak* ones. Strong ETags are much harder to generate correctly, so they're *not recommended* unless you truly need them. To use strong ETags, call `req.validate()` with the `strong` option, which behaves exactly like the [`weak`](#optionsweak--null) option.

However, when using the `strong` option, you must adhere to strict requirements that cannot be enforced by this plugin:

- A strong ETag must change whenever *any* observable change to the resource payload changes.
- A strong ETag must be unique across all versions of a resource over time.
- A strong ETag must be different for different representations of the same resource. For example, if [content negotiation](https://tools.ietf.org/html/rfc7231#section-3.4) is used to conditionally apply gzip compression (Content-Encoding) to a resource, then the resource's ETag must be different between the gzipped and non-gzipped versions. It's a common mistake to forget this. If you apply compression via a plugin (like [`vapr-compress`](https://github.com/JoshuaWise/vapr-compress)), you should include the request's Accept-Encoding header in your ETag's array. Keep in mind that this also applies to any other transformations that you apply to the response body after it is generated.

For more details on the requirements of strong ETags, [read here](https://tools.ietf.org/html/rfc7232#section-2.1).

```js
const crypto = require('crypto');

const hashedPayload = crypto.createHash('md5').update(payload).digest();
const etagParts = [hashedPayload];

if (req.headers.has('accept-encoding')) {
	etagParts.push(req.headers.get('accept-encoding'));
}

req.validate({ strong: etagParts });
```

When you use this approach, an ETag header will be sent, but the Last-Modified header will *not* be sent unless you also provide a [`lastModified`](#optionslastmodified--null) date.
