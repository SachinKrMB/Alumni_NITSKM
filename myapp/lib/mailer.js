// lib/mailer.js
const nodemailer = require('nodemailer');

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  FROM_EMAIL
} = process.env;

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER) {
    console.warn('SMTP not configured. Emails will not be sent.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: SMTP_PORT && Number(SMTP_PORT) === 465, // true for 465
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
  return transporter;
}

async function sendOtpEmail(to, otp, opts = {}) {
  const tr = getTransporter();
  if (!tr) {
    console.warn('No transporter configured, skipping sendOtpEmail for', to);
    return;
  }

  const subject = opts.subject || 'Your verification code';
  const html = opts.html || `
    <div style="font-family:Inter,Arial,sans-serif">
      <h3 style="margin-bottom:6px">Your verification code</h3>
      <div style="font-size:22px;font-weight:700;padding:10px 14px;background:#f4f6ff;border-radius:8px;display:inline-block">${otp}</div>
      <p style="color:#666;margin-top:12px">This code will expire in ${opts.expireMinutes || 5} minutes.</p>
      <p style="color:#999;font-size:13px">If you didn't request this, you can ignore this email.</p>
    </div>
  `;

  await tr.sendMail({
    from: FROM_EMAIL || 'no-reply@example.com',
    to,
    subject,
    html
  });
}

module.exports = { sendOtpEmail, getTransporter };
