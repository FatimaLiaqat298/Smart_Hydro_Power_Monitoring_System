const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const port = Number(process.env.MAILER_PORT || 8025);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function authorized(request) {
  const username = process.env.SMTP_USER || '';
  const password = process.env.SMTP_PASSWORD || '';
  const provided = Buffer.from(request.headers['x-mailer-token'] || '', 'utf8');
  if (!username || !password || provided.length === 0) return false;
  const expected = Buffer.from(crypto.createHash('sha256').update(`${username}:${password}`).digest('hex'));
  return provided.length === expected.length && crypto.timingSafeEqual(expected, provided);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 16384) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method !== 'POST' || request.url !== '/send-welcome') {
    return sendJson(response, 404, { error: 'Not found' });
  }
  if (!authorized(request)) {
    return sendJson(response, 401, { error: 'Unauthorized' });
  }

  let user;
  try {
    user = await readJson(request);
  } catch (error) {
    return sendJson(response, error.message === 'Request body too large' ? 413 : 400, { error: error.message });
  }

  if (!user.name || !user.email || !user.password || !user.role) {
    return sendJson(response, 400, { error: 'Missing account email fields' });
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const configuredFrom = process.env.EMAIL_FROM || '';
  const sender = configuredFrom.toLowerCase() === smtpUser.toLowerCase() ? configuredFrom : smtpUser;
  const role = String(user.role).toUpperCase();
  const safeName = escapeHtml(user.name);
  const safeEmail = escapeHtml(user.email);
  const safePassword = escapeHtml(user.password);
  const safeRole = escapeHtml(role);
  const portalUrl = escapeHtml(process.env.PORTAL_URL || 'http://localhost:3000/login');

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
    });
    await transporter.sendMail({
      from: sender,
      to: user.email,
      subject: `Your SHPMFS Portal Credentials - ${role}`,
      text: `Hello ${user.name},\n\nYour SHPMFS account has been created.\nEmail: ${user.email}\nTemporary password: ${user.password}\nRole: ${role}\n\nSign in: ${process.env.PORTAL_URL || 'http://localhost:3000/login'}\nPlease change your password after signing in.`,
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0B2545"><h2>SHPMFS System Access</h2><p>Hello <strong>${safeName}</strong>,</p><p>Your account has been created with <strong>${safeRole}</strong> access.</p><table cellpadding="8" cellspacing="0" style="background:#f1f5f9;border:1px solid #cbd5e1"><tr><td>Email</td><td><strong>${safeEmail}</strong></td></tr><tr><td>Temporary password</td><td><strong>${safePassword}</strong></td></tr><tr><td>Role</td><td><strong>${safeRole}</strong></td></tr></table><p><a href="${portalUrl}">Sign in to SHPMFS</a></p><p>Please change your password after signing in.</p></body></html>`,
    });
    return sendJson(response, 200, { sent: true });
  } catch (error) {
    console.error(`Welcome email delivery failed (${error.code || 'SMTP error'}).`);
    return sendJson(response, 502, { error: 'SMTP delivery failed' });
  }
});

server.listen(port, process.env.MAILER_HOST || '127.0.0.1', () => {
  console.log(`SHPMFS mailer listening on port ${port}`);
});
