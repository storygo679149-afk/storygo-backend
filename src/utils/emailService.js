const nodemailer = require('nodemailer');

// ────────────────────────────────────────────────────────────
// Transporter — Gmail SMTP (App Password required)
// .env mein SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS set karo
// ────────────────────────────────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // TLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

/**
 * OTP email bhejta hai user ko
 * @param {string} email - recipient email
 * @param {string} otp - 6-digit OTP
 * @param {string} username - user ka naam
 */
const sendOTPEmail = async (email, otp, username) => {
  const transporter = createTransporter();

  // Verify transporter before sending
  await transporter.verify();

  const displayName = username || 'User';

  const mailOptions = {
    from: `"StoryGo" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `${otp} — Your StoryGo Login OTP`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>StoryGo OTP</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#141414;border-radius:16px;overflow:hidden;border:1px solid #2a2a2a;">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#e50914 0%,#b00710 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">StoryGo</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:1px;">AUDIO STORYTELLING PLATFORM</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;color:#aaaaaa;font-size:14px;">Hello,</p>
              <h2 style="margin:0 0 24px;color:#ffffff;font-size:22px;font-weight:600;">
                Hi <span style="color:#e50914;">${displayName}</span> 👋
              </h2>
              <p style="margin:0 0 8px;color:#888888;font-size:14px;line-height:1.6;">
                Your login OTP for StoryGo is:
              </p>

              <!-- OTP Box -->
              <div style="background:#1e1e1e;border:2px solid #e50914;border-radius:12px;padding:28px;text-align:center;margin:24px 0;">
                <div style="letter-spacing:18px;font-size:42px;font-weight:900;color:#ffffff;font-family:'Courier New',monospace;">
                  ${otp}
                </div>
              </div>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#1a1a1a;border-left:3px solid #e50914;border-radius:4px;padding:12px 16px;">
                    <p style="margin:0;color:#ffcc00;font-size:13px;">
                      ⏱ &nbsp;This OTP expires in <strong>10 minutes</strong>
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;color:#666666;font-size:13px;">Security tips:</p>
              <ul style="margin:0 0 24px;padding-left:20px;color:#666666;font-size:13px;line-height:1.8;">
                <li>Never share this OTP with anyone</li>
                <li>StoryGo team will never ask for your OTP</li>
                <li>If you did not request this, change your password immediately</li>
              </ul>

              <p style="margin:0;color:#444444;font-size:12px;text-align:center;border-top:1px solid #2a2a2a;padding-top:24px;">
                © 2026 StoryGo · All rights reserved<br/>
                <span style="color:#333333;">This is an automated email. Please do not reply.</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `Hi ${displayName},\n\nYour StoryGo login OTP is: ${otp}\n\nThis OTP expires in 10 minutes.\nDo not share it with anyone.\n\n— StoryGo Team`,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[EmailService] OTP sent to ${email} | MessageId: ${info.messageId}`);
  return info;
};

module.exports = { sendOTPEmail };
