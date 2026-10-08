import nodemailer from 'nodemailer';

export type SmtpEnvironment = Partial<Record<string, string>>;
export const isEmailDeliveryConfigured = (env: SmtpEnvironment = process.env) => Boolean(
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM
);

export const getSmtpConfiguration = (env: SmtpEnvironment = process.env) => {
  if (!isEmailDeliveryConfigured(env)) {
    throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM must be configured for email delivery.');
  }
  const port = Number.parseInt(env.SMTP_PORT ?? '587', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a valid port number.');
  return {
    host: env.SMTP_HOST!,
    port,
    secure: env.SMTP_SECURE === 'true' || port === 465,
    auth: { user: env.SMTP_USER!, pass: env.SMTP_PASSWORD! },
    from: env.SMTP_FROM!,
  };
};

export const sendTransactionalEmail = async (input: {
  to: string; subject: string; text: string; html: string;
}) => {
  const { from, ...smtp } = getSmtpConfiguration();
  const transport = nodemailer.createTransport({
    ...smtp, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
  });
  try {
    await transport.sendMail({ from, to: input.to, subject: input.subject, text: input.text, html: input.html });
  } finally {
    transport.close();
  }
};
