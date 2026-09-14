'use strict';
const { getSession } = require('./_lib/session');

exports.handler = async (event) => {
  const session = getSession(event);
  if (!session) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loggedIn: false }),
    };
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loggedIn: true, email: session.email }),
  };
};
