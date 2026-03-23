const nodemailer = require("nodemailer");
const logger = require("./logger");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (options) => {
  try {
    const mailOptions = {
      from: `"${process.env.APP_NAME || "Fita Vnua"}" <${process.env.EMAIL_USER}>`,
      to: options.email,
      subject: options.subject,
      text: options.message,
      html: options.html,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error("Error sending email:", error);
    throw new Error("Could not send email. Please try again later.");
  }
};

const sendOTP = async (email, otp) => {
  const subject = "Mã xác thực (OTP) - Forum";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; borderRadius: 8px;">
      <h2 style="color: #4f46e5; text-align: center;">Mã xác thực Forum</h2>
      <p>Chào bạn,</p>
      <p>Bạn đã yêu cầu mã xác thực để truy cập hoặc đổi mật khẩu. Mã OTP của bạn là:</p>
      <div style="background-color: #f8fafc; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e293b;">${otp}</span>
      </div>
      <p>Mã này có hiệu lực trong <strong>30 phút</strong>. Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
      <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
      <p style="font-size: 12px; color: #64748b; text-align: center;">Đây là email tự động, vui lòng không trả lời.</p>
    </div>
  `;
  return sendEmail({ email, subject, html });
};

module.exports = { sendEmail, sendOTP };
