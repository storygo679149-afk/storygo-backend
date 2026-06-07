// src/services/emailService.js
const nodemailer = require('nodemailer');
const Transport = require('nodemailer-brevo-transport');

// Create a transporter using the Brevo transport
const transporter = nodemailer.createTransport(
  new Transport({ apiKey: process.env.BREVO_API_KEY })
);

/**
 * Generate a random 6-digit OTP.
 * @returns {string} 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send a verification OTP email.
 * @param {string} toEmail - Recipient's email address.
 * @param {string} otp - The 6-digit OTP.
 * @returns {Promise<void>}
 */
const sendVerificationEmail = async (toEmail, otp) => {
  const mailOptions = {
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
  };

  await transporter.sendMail(mailOptions);
  console.log(`✅ Verification email sent to ${toEmail} with OTP: ${otp}`);
};

module.exports = { generateOTP, sendVerificationEmail };
