'use strict';
const { exchangeCode, getUserInfo } = require('./_lib/google');
const { buildSetCookie } = require('./_lib/session');

const ALLOWED_EMAIL = (process.env.ALLOWED_EMAIL || '').toLowerCase();

exports.handler = async (event) => {
  const { code, error } = event.queryStringParameters || {};
  if (error) {
    return { statusCode: 302, headers: { Location: '/?error=' + encodeURIComponent(error) }, body: '' };
  }
  if (!code) {
    return { statusCode: 400, body: 'Missing authorization code.' };
  }

  try {
    const tokens = await exchangeCode(code);
    const userInfo = await getUserInfo(tokens.access_token);
    const email = (userInfo.email || '').toLowerCase();

    if (ALLOWED_EMAIL && email !== ALLOWED_EMAIL) {
      return {
        statusCode: 302,
        headers: {
          Location: '/?error=' + encodeURIComponent('This portal is only for ' + ALLOWED_EMAIL),
        },
        body: '',
      };
    }

    if (!tokens.refresh_token) {
      // Google only sends a refresh_token on first consent (or when
      // prompt=consent forces it, which auth-start always sets). If this
      // ever comes back empty, revoke access at
      // myaccount.google.com/permissions and sign in again.
      return {
        statusCode: 302,
        headers: {
          Location:
            '/?error=' +
            encodeURIComponent(
              'Google did not return a refresh token. Revoke access at myaccount.google.com/permissions and try again.'
            ),
        },
        body: '',
      };
    }

    const sessionData = {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };

    return {
      statusCode: 302,
      headers: {
        Location: '/app/',
        'Set-Cookie': buildSetCookie(sessionData, 60 * 60 * 24 * 30),
      },
      body: '',
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 302,
      headers: { Location: '/?error=' + encodeURIComponent('Sign-in failed. Check the function logs.') },
      body: '',
    };
  }
};
