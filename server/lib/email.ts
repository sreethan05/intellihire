import nodemailer from "nodemailer";
import { logger } from "./logger.js";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "IntelliHire <noreply@intellihire.com>";

const isEmailEnabled = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter: nodemailer.Transporter | null = null;

if (isEmailEnabled) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  logger.info("Email service initialized");
} else {
  logger.warn("Email service not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env");
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}) {
  if (!transporter) {
    logger.warn({ to: options.to, subject: options.subject }, "Email skipped — SMTP not configured");
    return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const result = await transporter.sendMail({
      from: SMTP_FROM,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    logger.info({ messageId: result.messageId, to: options.to }, "Email sent");
    return { sent: true, messageId: result.messageId };
  } catch (err) {
    logger.error({ err, to: options.to, subject: options.subject }, "Email send failed");
    return { sent: false, reason: "SEND_FAILED", error: (err as Error).message };
  }
}

export async function sendExamAssignedEmail(
  candidateEmail: string,
  candidateName: string,
  examTitle: string,
  appUrl: string = "http://localhost:3000"
) {
  return sendEmail({
    to: candidateEmail,
    subject: `New Exam Assigned: ${examTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Hello ${candidateName},</h2>
        <p>You have been assigned a new exam on <strong>IntelliHire</strong>.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: bold;">${examTitle}</p>
        </div>
        <p>Log in to your dashboard to view and attempt the exam:</p>
        <a href="${appUrl}/login" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Go to IntelliHire</a>
        <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">This is an automated message from IntelliHire. Please do not reply.</p>
      </div>
    `,
    text: `Hello ${candidateName},\n\nYou have been assigned a new exam: ${examTitle}.\n\nLog in at ${appUrl}/login to attempt it.\n\n— IntelliHire`,
  });
}

export async function sendDriveRegisteredEmail(
  candidateEmail: string,
  candidateName: string,
  driveTitle: string,
  companyName: string,
  appUrl: string = "http://localhost:3000"
) {
  return sendEmail({
    to: candidateEmail,
    subject: `Registered for Drive: ${driveTitle} at ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Hello ${candidateName},</h2>
        <p>You have been registered for a new recruitment drive on <strong>IntelliHire</strong>.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: bold;">${driveTitle}</p>
          <p style="margin: 4px 0 0 0; color: #6b7280;">${companyName}</p>
        </div>
        <p>Log in to your dashboard to view details:</p>
        <a href="${appUrl}/login" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Go to IntelliHire</a>
        <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">This is an automated message from IntelliHire. Please do not reply.</p>
      </div>
    `,
    text: `Hello ${candidateName},\n\nYou have been registered for the drive: ${driveTitle} at ${companyName}.\n\nLog in at ${appUrl}/login to view details.\n\n— IntelliHire`,
  });
}

export async function sendResultPublishedEmail(
  candidateEmail: string,
  candidateName: string,
  examTitle: string,
  score: number,
  totalMarks: number,
  passed: boolean,
  appUrl: string = "http://localhost:3000"
) {
  const statusColor = passed ? "#16a34a" : "#dc2626";
  const statusText = passed ? "PASSED" : "DID NOT PASS";

  return sendEmail({
    to: candidateEmail,
    subject: `Results Available: ${examTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Hello ${candidateName},</h2>
        <p>Your results for <strong>${examTitle}</strong> are now available.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0; text-align: center;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">Score</p>
          <p style="margin: 4px 0; font-size: 32px; font-weight: bold; color: ${statusColor};">${score} / ${totalMarks}</p>
          <p style="margin: 0; font-size: 14px; color: ${statusColor}; font-weight: bold;">${statusText}</p>
        </div>
        <p>View your full results and certificate on your dashboard:</p>
        <a href="${appUrl}/login" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Results</a>
        <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">This is an automated message from IntelliHire. Please do not reply.</p>
      </div>
    `,
    text: `Hello ${candidateName},\n\nYour results for ${examTitle} are now available.\n\nScore: ${score} / ${totalMarks}\nStatus: ${statusText}\n\nView details at ${appUrl}/login\n\n— IntelliHire`,
  });
}

export { isEmailEnabled };
