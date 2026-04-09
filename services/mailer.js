const sgMail = require("@sendgrid/mail");

exports.sendEmail = async ({
  to,
  from = "totumstructum@gmail.com",
  subject,
  html,
  text,
  attachments = [],
}) => {
  if (!process.env.SG_KEY) {
    throw new Error("SG_KEY is missing in environment variables");
  }

  sgMail.setApiKey(process.env.SG_KEY);

  const msg = {
    to,
    from,
    subject,
    html,
    text,
    attachments,
  };

  await sgMail.send(msg);
};
