'use strict';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

function getRedirectUri() {
  const base = process.env.URL || process.env.DEPLOY_URL || '';
  return `${base}/.netlify/functions/auth-callback`;
}

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: state || '',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: getRedirectUri(),
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getUserInfo(accessToken) {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Userinfo failed: ${res.status}`);
  return res.json();
}

// Returns a valid access token, refreshing it if the stored one is expired.
// refreshedTokens is non-null only when a refresh happened, so the caller
// knows to re-save the session cookie with the new token.
async function ensureAccessToken(session) {
  const now = Date.now();
  if (session.accessToken && session.expiresAt && now < session.expiresAt - 60000) {
    return { accessToken: session.accessToken, refreshedTokens: null };
  }
  const tokens = await refreshAccessToken(session.refreshToken);
  return {
    accessToken: tokens.access_token,
    refreshedTokens: {
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    },
  };
}

async function driveList(accessToken, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,webViewLink,iconLink,size)');
  const url = `${DRIVE_API}/files?q=${q}&fields=${fields}&orderBy=folder,name&pageSize=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive list failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function driveCreateFolder(accessToken, parentId, name) {
  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  if (!res.ok) throw new Error(`Drive create folder failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function driveUploadFile(accessToken, parentId, filename, mimeType, base64Data) {
  const metadata = { name: filename, parents: [parentId] };
  const boundary = 'markit-portal-boundary-' + Date.now();
  const buffer = Buffer.from(base64Data, 'base64');

  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  const multipartBody = Buffer.concat([head, buffer, tail]);

  const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}

module.exports = {
  buildAuthUrl,
  exchangeCode,
  refreshAccessToken,
  getUserInfo,
  ensureAccessToken,
  driveList,
  driveCreateFolder,
  driveUploadFile,
};
