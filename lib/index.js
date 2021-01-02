'use strict';
const { createHash } = require('crypto');
const { Request } = require('vapr');
const validate = Symbol();

module.exports = () => ({ method, headers, meta }) => {
	const isIgnoredMethod = method === 'CONNECT' || method === 'OPTIONS' || method === 'TRACE';

	let acceptedTags;
	let rejectedTags;
	let maxDateInclusive;
	let minDateExclusive;
	let isConditionalRequest = false;

	if (!isIgnoredMethod) {
		let condition = headers.get('if-match');
		if (condition) {
			if (!entityTags.test(condition)) return [400, 'Malformed If-Match Header'];
			acceptedTags = parseTags(condition, entityTag);
			isConditionalRequest = true;
		} else {
			condition = headers.get('if-unmodified-since');
			if (condition && httpDate.test(condition)) {
				maxDateInclusive = parseHttpDate(condition);
				isConditionalRequest = true;
			}
		}

		condition = headers.get('if-none-match');
		if (condition) {
			if (!entityTags.test(condition)) return [400, 'Malformed If-None-Match Header'];
			rejectedTags = parseTags(condition, opaqueTag);
			isConditionalRequest = true;
		} else if (method === 'GET' || method === 'HEAD') {
			condition = headers.get('if-modified-since');
			if (condition && httpDate.test(condition)) {
				minDateExclusive = parseHttpDate(condition);
				isConditionalRequest = true;
			}
		}
	}

	let etagHeader;
	let lastModifiedHeader;
	let invoked = false;

	meta[validate] = ({ strong, weak, lastModified } = {}) => {
		if (invoked) {
			throw new TypeError('The req.validate() function was invoked more than once for the same request');
		}
		if (strong != null && !(Array.isArray(strong) && strong.every(isHashable))) {
			throw new TypeError('Expected \'strong\' option to be an array of strings and/or Buffers');
		}
		if (weak != null && !(Array.isArray(weak) && weak.every(isHashable))) {
			throw new TypeError('Expected \'weak\' option to be an array of strings and/or Buffers');
		}
		if (strong && weak) {
			throw new TypeError('The \'strong\' and \'weak\' options are mutually exclusive');
		}
		if (lastModified != null && !(lastModified instanceof Date)) {
			throw new TypeError('Expected \'lastModified\' option to be a Date object');
		}

		const givenDate = lastModified ? Math.min(lastModified.getTime(), Date.now()) : Date.now();
		if (Number.isNaN(givenDate)) {
			throw new TypeError('The given \'lastModified\' date is an invalid date');
		}

		invoked = true;

		if (!isIgnoredMethod) {
			const strongTag = strong ? generateTag(strong) : '';
			const weakTag = strongTag || (weak ? generateTag(weak) : lastModified ? wrapAsTag(new Date(givenDate).toISOString()) : '');

			if (weakTag) {
				etagHeader = strongTag || `W/${weakTag}`;
				if (lastModified) lastModifiedHeader = new Date(givenDate).toGMTString();
			}

			if (isConditionalRequest) {
				if (acceptedTags !== undefined) {
					if (!matches(strongTag, acceptedTags)) throw 412;
				} else if (maxDateInclusive !== undefined) {
					if (givenDate > maxDateInclusive) throw 412;
				}

				if (rejectedTags !== undefined) {
					if (matches(weakTag, rejectedTags)) throw method === 'GET' || method === 'HEAD' ? [304, { 'etag': etagHeader, 'last-modified': lastModifiedHeader }] : 412;
				} else if (minDateExclusive !== undefined) {
					if (givenDate <= minDateExclusive) throw [304, { 'etag': etagHeader, 'last-modified': lastModifiedHeader }];
				}
			}
		}
	};

	return (res) => {
		meta[validate] = undefined;
		if (res.code >= 300) return;
		if (!invoked) {
			if (isConditionalRequest) throw new TypeError('Conditional request was never validated by req.validate()');
			throw new TypeError('Request was never assigned an ETag via req.validate()');
		}
		if (etagHeader !== undefined) {
			res.headers.set('etag', etagHeader);
		}
		if (lastModifiedHeader !== undefined) {
			res.headers.set('last-modified', lastModifiedHeader);
		}
	};
};

const matches = (tag, acceptedTags) => {
	if (!tag) return false;
	if (!acceptedTags) return true;
	for (const accepted of acceptedTags) {
		if (tag === accepted) return true;
	}
	return false;
};

const parseHttpDate = (str) => {
	if (!str.endsWith('T')) str += ' GMT';
	return new Date(str).getTime();
};

const parseTags = (str, pattern) => {
	if (str === '*') return null;
	pattern.lastIndex = 0;
	const tags = [];
	let match;
	while (match = pattern.exec(str)) tags.push(match[0]);
	return tags;
};

const httpDate = /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d\d (?:Jan|Feb|Mar|Apr|May|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d\d:\d\d:\d\d GMT|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [\d ]\d \d\d:\d\d:\d\d \d{4}|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d\d-(?:Jan|Feb|Mar|Apr|May|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d\d \d\d:\d\d:\d\d GMT)$/;
const entityTags = /^(?:\*|(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"(?:[ \t]*,[ \t]*(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*")*)$/;
const entityTag = /(?:W\/)?"[^"]*"/g;
const opaqueTag = /"[^"]*"/g;
const isHashable = x => typeof x === 'string' || Buffer.isBuffer(x);
const hash = x => createHash('md5').update(x).digest();
const wrapAsTag = x => `"${hash(x).toString('base64')}"`;
const generateTag = parts => wrapAsTag(Buffer.concat(parts.map(hash)));

Object.defineProperty(Request.prototype, 'validate', {
	configurable: true,
	get: function getValidate() { return this.meta[validate]; },
});
