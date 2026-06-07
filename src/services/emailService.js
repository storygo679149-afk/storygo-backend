const nodemailer = require('nodemailer');

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Create transporter only once
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  logger: true, // enable logging
  debug: true,  // include SMTP traffic in logs
});

const sendVerificationEmail = async (toEmail, otp) => {
  try {
    const info = await transporter.sendMail({
      from: `"StoryGo" <${process.env.EMAIL_FROM}>`,
      to: toEmail,
      subject: 'Verify Your StoryGo Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Welcome to StoryGo!</h2>
          <p>Thank you for signing up. Please use the verification code below to complete your registration:</p>
          <div style="background-color: #F3F4F6; padding: 15px; text-align: center; font-size: 32px; letter-spacing: 5px; font-weight: bold; border-radius: 8px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This code will expire in <strong>10 minutes</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="margin: 20px 0;" />
          <p style="color: #6B7280; font-size: 12px;">&copy; 2026 StoryGo. All rights reserved.</p>
        </div>
      `,
    });
    console.log(`✅ Verification email sent to ${toEmail} with OTP: ${otp} (messageId: ${info.messageId})`);
    return info;
  } catch (error) {
    console.error('❌ Failed to send verification email:', error.message);
    console.error('Full error:', error);
    throw new Error('Email could not be sent');
  }
};

module.exports = { generateOTP, sendVerificationEmail };
