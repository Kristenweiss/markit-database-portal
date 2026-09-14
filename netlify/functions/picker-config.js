'use strict';
const { getSession, buildSetCookie } = require('./_lib/session');
const { ensureAccessToken } = require('./_lib/google');

exports.handler = async (event) => {
  const session = getSession(event);
  if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in.' }) };

  try {
    const { accessToken, refreshedTokens } = await ensureAccessToken(session);
    const headers = { 'Content-Type': 'application/json' };
    if (refreshedTokens) {
      headers['Set-Cookie'] = buildSetCookie({ ...session, ...refreshedTokens }, 60 * 60 * 24 * 30);
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        apiKey: process.env.GOOGLE_PICKER_API_KEY || '',
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        accessToken,
        rootFolderId: process.env.DRIVE_ROOT_FOLDER_ID || '',
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 502, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
