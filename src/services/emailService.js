const SibApiV3Sdk = require('@getbrevo/brevo');

// Configure API key
let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
let apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = process.env.BREVO_API_KEY; // Your existing xkeysib-... key

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendVerificationEmail = async (toEmail, otp) => {
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.sender = { email: process.env.EMAIL_FROM, name: 'StoryGo' };
  sendSmtpEmail.to = [{ email: toEmail }];
  sendSmtpEmail.subject = 'Verify Your StoryGo Account';
  sendSmtpEmail.htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">Welcome to StoryGo!</h2>
      <p>Thank you for signing up. Please use the verification code below:</p>
      <div style="background-color: #F3F4F6; padding: 15px; text-align: center; font-size: 32px; letter-spacing: 5px; font-weight: bold; border-radius: 8px; margin: 20px 0;">
        ${otp}
      </div>
      <p>This code will expire in <strong>10 minutes</strong>.</p>
      <p>If you didn't request this, please ignore this email.</p>
      <hr />
      <p style="color: #6B7280; font-size: 12px;">&copy; 2026 StoryGo. All rights reserved.</p>
    </div>
  `;

  try {
    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Verification email sent to ${toEmail} with OTP: ${otp} (messageId: ${response.messageId})`);
  } catch (error) {
    console.error('❌ Failed to send email via Brevo API:', error.message);
    throw new Error('Email could not be sent');
  }
};

module.exports = { generateOTP, sendVerificationEmail };
