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

const sendOTP = async (email, otp, expiresMinutes = 30) => {
  const subject = "Mã xác thực (OTP) - Forum";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; borderRadius: 8px;">
      <h2 style="color: #4f46e5; text-align: center;">Mã xác thực Forum</h2>
      <p>Chào bạn,</p>
      <p>Bạn đã yêu cầu mã xác thực để truy cập hoặc đổi mật khẩu. Mã OTP của bạn là:</p>
      <div style="background-color: #f8fafc; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e293b;">${otp}</span>
      </div>
      <p>Mã này có hiệu lực trong <strong>${expiresMinutes} phút</strong>. Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
      <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
      <p style="font-size: 12px; color: #64748b; text-align: center;">Đây là email tự động, vui lòng không trả lời.</p>
    </div>
  `;
  return sendEmail({ email, subject, html });
};

const sendBanEmail = async (email, username, banReason) => {
  try {
    const subject = "Thông báo khóa tài khoản - Forum";
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #dc2626; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Thông Báo Khóa Tài Khoản</h2>
          <p style="color: #4b5563; font-size: 14px; margin-top: 5px;">Tài khoản của bạn đã tạm thời bị ngưng kích hoạt</p>
        </div>
        
        <p style="color: #1f2937; font-size: 16px; line-height: 1.5;">Chào <strong>${username}</strong>,</p>
        <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
          Chúng tôi rất tiếc phải thông báo rằng tài khoản của bạn trên hệ thống <strong>Forum</strong> đã bị khóa do vi phạm các tiêu chuẩn cộng đồng hoặc chính sách hoạt động của chúng tôi.
        </p>
        
        <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; margin: 25px 0; border-radius: 6px;">
          <h4 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #991b1b;">Lý do khóa tài khoản:</h4>
          <p style="margin: 0; font-size: 14px; color: #7f1d1d; line-height: 1.5; font-style: italic;">
            "${banReason}"
          </p>
        </div>
        
        <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
          Nếu bạn cho rằng đây là một sự nhầm lẫn hoặc muốn thực hiện khiếu nại để mở khóa tài khoản, vui lòng liên hệ với Ban quản trị Forum bằng cách phản hồi thông tin hỗ trợ.
        </p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6; text-align: center;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">
            Đây là email được gửi tự động từ hệ thống Forum. Vui lòng không phản hồi trực tiếp email này.
          </p>
          <p style="font-size: 12px; color: #9ca3af; margin: 5px 0 0 0;">
            &copy; 2026 Forum Fita Vnua. All rights reserved.
          </p>
        </div>
      </div>
    `;
    return await sendEmail({ email, subject, html });
  } catch (error) {
    logger.error(`[Email] Không thể gửi mail thông báo ban đến ${email}:`, error);
    return null;
  }
};

module.exports = { sendEmail, sendOTP, sendBanEmail };
