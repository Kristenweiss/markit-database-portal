'use strict';
const { getSession, buildSetCookie } = require('./_lib/session');
const { ensureAccessToken, driveList } = require('./_lib/google');

exports.handler = async (event) => {
  const session = getSession(event);
  if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in.' }) };

  const folderId = (event.queryStringParameters || {}).folderId || process.env.DRIVE_ROOT_FOLDER_ID;
  if (!folderId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No folder ID given and DRIVE_ROOT_FOLDER_ID is not set.' }),
    };
  }

  try {
    const { accessToken, refreshedTokens } = await ensureAccessToken(session);
    const data = await driveList(accessToken, folderId);
    const headers = { 'Content-Type': 'application/json' };
    if (refreshedTokens) {
      headers['Set-Cookie'] = buildSetCookie({ ...session, ...refreshedTokens }, 60 * 60 * 24 * 30);
    }
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 502,
      body: JSON.stringify({
        error:
          'Could not read that folder. If this is the very first look at the MarkIt Database folder, use "Connect Drive folder" on the dashboard first — drive.file scope only sees folders you have explicitly picked.',
        detail: String(err.message || err),
      }),
    };
  }
};
