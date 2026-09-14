'use strict';
const { getSession, buildSetCookie } = require('./_lib/session');
const { ensureAccessToken, driveUploadFile } = require('./_lib/google');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const session = getSession(event);
  if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in.' }) };

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad JSON body.' }) };
  }
  const { parentId, filename, mimeType, base64Data } = payload;
  if (!parentId || !filename || !base64Data) {
    return { statusCode: 400, body: JSON.stringify({ error: 'parentId, filename and base64Data are required.' }) };
  }

  try {
    const { accessToken, refreshedTokens } = await ensureAccessToken(session);
    const file = await driveUploadFile(accessToken, parentId, filename, mimeType, base64Data);
    const headers = { 'Content-Type': 'application/json' };
    if (refreshedTokens) {
      headers['Set-Cookie'] = buildSetCookie({ ...session, ...refreshedTokens }, 60 * 60 * 24 * 30);
    }
    return { statusCode: 200, headers, body: JSON.stringify(file) };
  } catch (err) {
    console.error(err);
    return { statusCode: 502, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
