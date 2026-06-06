const nodemailer = require('nodemailer');
const environment = require('../config/environment');

const transporter = nodemailer.createTransport({
  host: environment.EMAIL_HOST,
  port: parseInt(environment.EMAIL_PORT) || 587,
  secure: environment.EMAIL_SECURE === 'true',
  family: 4, // ✅ force IPv4 — Render free tier blocks IPv6 outbound
  auth: {
    user: environment.EMAIL_USER,
    pass: environment.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 10000,
  greetingTimeout:   10000,
  socketTimeout:     15000,
});

// Logo URL – set EMAIL_LOGO_URL in .env
const LOGO_URL = environment.EMAIL_LOGO_URL || '';

const buildHtml = (otp, actionText) => {
  const logoHtml = LOGO_URL
    ? `<img src="${LOGO_URL}" alt="Story Go" style="height: 48px; margin-bottom: 16px;" />`
    : `<h2 style="color: #a78bfa; margin: 0;">📖 Story Go</h2>`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>OTP Verification</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #0f071a; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 560px; margin: 40px auto; background: #1a1a2e; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.4); border: 1px solid rgba(139,92,246,0.2);">

        <!-- Header -->
        <div style="text-align: center; padding: 32px 24px 16px; background: linear-gradient(135deg, rgba(139,92,246,0.1), rgba(99,102,241,0.05)); border-bottom: 1px solid rgba(139,92,246,0.15);">
          ${logoHtml}
          <h1 style="margin: 12px 0 0; font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #fff, #c4b5fd); -webkit-background-clip: text; background-clip: text; color: transparent;">Story Go</h1>
        </div>

        <!-- Content -->
        <div style="padding: 32px 28px; text-align: center;">
          <h2 style="font-size: 22px; font-weight: 600; color: #ffffff; margin: 0 0 12px 0;">🔐 One‑Time Password</h2>
          <p style="font-size: 16px; line-height: 1.5; color: #c0c0d0; margin-bottom: 24px;">
            You requested this code for ${actionText}. Use the OTP below to complete your action. It expires in <strong>5 minutes</strong>.
          </p>

          <!-- OTP Box -->
          <div style="background: #0f071a; border-radius: 16px; padding: 20px; margin: 16px 0; border: 1px solid rgba(139,92,246,0.3);">
            <span style="font-size: 42px; font-weight: 800; letter-spacing: 8px; font-family: monospace; color: #a78bfa;">${otp}</span>
          </div>

          <p style="font-size: 14px; color: #9ca3af; margin-top: 24px;">
            If you didn't request this, please ignore this email. Your account is safe.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: rgba(0,0,0,0.2); padding: 20px; text-align: center; border-top: 1px solid rgba(139,92,246,0.1);">
          <p style="font-size: 12px; color: #6b7280; margin: 0;">
            &copy; ${new Date().getFullYear()} Story Go – Your audio storytelling platform
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
};

// ✅ Named sendOTPEmail — matches what authController.js imports
const sendOTPEmail = async (to, otp, nameOrUsername) => {
  const actionText = `logging in as <strong>${nameOrUsername}</strong>`;

  await transporter.sendMail({
    from: environment.EMAIL_FROM || `"Story Go" <${environment.EMAIL_USER}>`,
    to,
    subject: 'Login OTP – Story Go',
    html: buildHtml(otp, actionText),
  });
};

// ✅ Also export sendOTP for any other callers (register flow etc.)
const sendOTP = async (to, otp, purpose) => {
  const actionText = purpose === 'signup' ? 'creating your account' : 'logging in';

  await transporter.sendMail({
    from: environment.EMAIL_FROM || `"Story Go" <${environment.EMAIL_USER}>`,
    to,
    subject: purpose === 'signup' ? 'Verify your email – Story Go' : 'Login OTP – Story Go',
    html: buildHtml(otp, actionText),
  });
};

module.exports = { sendOTPEmail, sendOTP };
