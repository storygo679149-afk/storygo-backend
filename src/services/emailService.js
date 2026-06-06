const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

// ─── HTML builder ────────────────────────────────────────────
const buildHtml = (otp, actionText) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0f071a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#1a1a2e;border-radius:24px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.4);border:1px solid rgba(139,92,246,0.2);">

    <!-- Header -->
    <div style="text-align:center;padding:32px 24px 16px;background:linear-gradient(135deg,rgba(139,92,246,0.1),rgba(99,102,241,0.05));border-bottom:1px solid rgba(139,92,246,0.15);">
      <h1 style="margin:0;font-size:26px;font-weight:900;color:#a78bfa;letter-spacing:3px;">📖 STORY GO</h1>
      <p style="margin:6px 0 0;font-size:11px;color:#555;letter-spacing:2px;text-transform:uppercase;">Audio Storytelling</p>
    </div>

    <!-- Content -->
    <div style="padding:32px 28px;text-align:center;">
      <h2 style="font-size:22px;font-weight:600;color:#ffffff;margin:0 0 12px;">🔐 One-Time Password</h2>
      <p style="font-size:16px;line-height:1.5;color:#c0c0d0;margin-bottom:24px;">
        You requested this code for ${actionText}.<br>
        It expires in <strong style="color:#a78bfa;">5 minutes</strong>.
      </p>

      <!-- OTP Box -->
      <div style="background:#0f071a;border-radius:16px;padding:24px;margin:16px 0;border:1px solid rgba(139,92,246,0.3);">
        <span style="font-size:48px;font-weight:800;letter-spacing:10px;font-family:monospace;color:#a78bfa;">${otp}</span>
      </div>

      <p style="font-size:13px;color:#6b7280;margin-top:24px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:rgba(0,0,0,0.2);padding:20px;text-align:center;border-top:1px solid rgba(139,92,246,0.1);">
      <p style="font-size:12px;color:#6b7280;margin:0;">
        &copy; ${new Date().getFullYear()} Story Go – Your audio storytelling platform
      </p>
    </div>

  </div>
</body>
</html>`;

// ─── sendOTPEmail — called by authController login/resend ────
const sendOTPEmail = async (to, otp, nameOrUsername) => {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Login OTP – Story Go',
    html: buildHtml(otp, `logging in as <strong>${nameOrUsername}</strong>`),
  });

  if (error) {
    console.error('[Resend] sendOTPEmail error:', error);
    throw new Error(error.message);
  }
};

// ─── sendOTP — generic, for signup / other flows ─────────────
const sendOTP = async (to, otp, purpose) => {
  const actionText = purpose === 'signup' ? 'creating your account' : 'logging in';

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: purpose === 'signup' ? 'Verify your email – Story Go' : 'Login OTP – Story Go',
    html: buildHtml(otp, actionText),
  });

  if (error) {
    console.error('[Resend] sendOTP error:', error);
    throw new Error(error.message);
  }
};

module.exports = { sendOTPEmail, sendOTP };
