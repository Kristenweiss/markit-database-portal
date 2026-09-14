'use strict';
const crypto = require('crypto');
const { buildAuthUrl } = require('./_lib/google');

exports.handler = async () => {
  const state = crypto.randomBytes(16).toString('hex');
  return {
    statusCode: 302,
    headers: { Location: buildAuthUrl(state) },
    body: '',
  };
};
