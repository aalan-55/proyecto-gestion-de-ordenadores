const nodemailer = require("nodemailer");

function getTransport() {
    // Mapping to your specific .env variable names
    const mailService = process.env.MAIL_SERVICE || "gmail";
    const mailUser = process.env.MAIL_USERNAME;
    const mailPass = process.env.APP_PASSWORD;

    if (!mailUser || !mailPass) {
        throw new Error(
            "Missing MAIL_USERNAME or APP_PASSWORD in environment variables."
        );
    }

    return nodemailer.createTransport({
        service: mailService,
        auth: {
            user: mailUser,
            pass: mailPass,
        },
    });
}

async function sendEmail({ to, subject, text, html }) {
    const emailFrom =
        process.env.EMAIL_FROM ||
        process.env.MAIL_USERNAME ||
        "no-reply@gmail.com";

    const transporter = getTransport();
    
    return transporter.sendMail({
        from: emailFrom,
        to,
        subject: String(subject || ""),
        text: text ? String(text) : undefined,
        html: html ? String(html) : undefined
    });
}

module.exports = { sendEmail };