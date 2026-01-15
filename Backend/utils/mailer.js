const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,          // use 587 with secure: false if 465 is blocked
  secure: true,       // true for 465, false for 587
  auth: {
    user: process.env.SYSTEM_EMAIL,
    pass: process.env.SYSTEM_EMAIL_APP_PASSWORD, // Gmail App Password
  },
});

// optional: quick health check on startup
// transporter.verify().catch(err => console.error("SMTP connect failed:", err));

const sendMail = (options) => {
  const base = {
    from: `"MSSS" <${process.env.SYSTEM_EMAIL}>`,
  };
  return transporter.sendMail({ ...base, ...options });
};

module.exports = { transporter, sendMail };