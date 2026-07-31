const to = 'studyvaultapp@gmail.com';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const { Resend } = require('resend');
  return new Resend(key);
}

async function sendEmail(subject, html) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({ from: 'StudyVault <onboarding@resend.dev>', to: [to], subject, html });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

module.exports = { sendEmail };
