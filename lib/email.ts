import nodemailer from "nodemailer";

export interface SendEmailOptions {
  to: string;
  firstName: string;
  queueNumber: number;
  eventName: string;
  guestToken: string;
}

export interface EmailResult {
  success: boolean;
  provider?: "smtp" | "resend" | "skipped";
  messageId?: string;
  error?: string;
}

/**
 * Builds the editorial-style confirmation email content with both text and HTML versions.
 */
export function buildConfirmationEmailContent(options: {
  firstName: string;
  queueNumber: number;
  eventName: string;
  guestToken: string;
}) {
  const { firstName, queueNumber, eventName, guestToken } = options;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const ticketUrl = `${baseUrl}/guest?token=${guestToken}`;
  const formattedNumber = String(queueNumber).padStart(2, "0");

  const subject = `Your Snap & Snack queue number: #${formattedNumber}`;

  const text = `Hi ${firstName},

Your queue number for ${eventName} is #${formattedNumber}.

Open your ticket:
${ticketUrl}

- Snap & Snack`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f4f1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #161513;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f4f1; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #f6f4f1;">
          <tr>
            <td style="padding-bottom: 24px;">
              <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 900; font-size: 20px; letter-spacing: 2px; text-transform: uppercase; color: #161513;">
                Snap &amp; Snack
              </span>
            </td>
          </tr>

          <tr>
            <td style="background-color: #ecebe7; border-radius: 20px; padding: 32px 28px; text-align: left;">
              <p style="margin: 0 0 14px 0; font-size: 15px; line-height: 1.5; color: #161513;">
                Hi <strong>${firstName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.5; color: #73706b;">
                You are in line for <strong>${eventName}</strong>. Here is your queue number:
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center" style="background-color: #f6f4f1; border-radius: 16px; padding: 24px 16px;">
                    <div style="font-family: monospace; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #73706b; margin-bottom: 6px;">
                      Queue Spot
                    </div>
                    <div style="font-family: monospace; font-size: 52px; font-weight: 900; color: #161513; line-height: 1;">
                      #${formattedNumber}
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${ticketUrl}" target="_blank" style="display: inline-block; background-color: #161513; color: #f6f4f1; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; padding: 14px 32px; border-radius: 9999px;">
                      Open my ticket
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #73706b; text-align: center; word-break: break-all;">
                Or copy your ticket link: <a href="${ticketUrl}" style="color: #e8541e; text-decoration: none;">${ticketUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-top: 24px; text-align: center; font-size: 11px; color: #73706b;">
              <span style="font-family: monospace; text-transform: uppercase; letter-spacing: 1px;">
                Snap &amp; Snack · Photo Booth
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function maskEmail(email: string): string {
  if (!email || typeof email !== "string") return "***";
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const [user, domain] = parts;
  const maskedUser =
    user.length > 2
      ? `${user[0]}***${user[user.length - 1]}`
      : `${user[0] || "*"}*`;
  return `${maskedUser}@${domain}`;
}

/**
 * Dispatches a registration confirmation email.
 * Priority:
 * 1. Gmail SMTP (smtp.gmail.com:465) if SMTP_USER and SMTP_PASS are set
 * 2. Resend API fallback if RESEND_API_KEY is set and SMTP is not configured
 * 3. Log "email skipped" if neither is configured
 *
 * Never throws: errors are logged and returned cleanly.
 */
export async function sendRegistrationEmail(options: SendEmailOptions): Promise<EmailResult> {
  const { to, firstName, queueNumber, eventName, guestToken } = options;
  const content = buildConfirmationEmailContent({ firstName, queueNumber, eventName, guestToken });

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM || (smtpUser ? `Snap & Snack <${smtpUser}>` : "Snap & Snack <onboarding@resend.dev>");

  // 1. Primary: SMTP via Gmail
  if (smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });

      console.log(`Confirmation email sent via SMTP to ${maskEmail(to)} (messageId: ${info.messageId})`);
      return { success: true, provider: "smtp", messageId: info.messageId };
    } catch (smtpErr: any) {
      console.error("SMTP delivery failed:", smtpErr?.message || smtpErr);
      return { success: false, provider: "smtp", error: smtpErr?.message || String(smtpErr) };
    }
  }

  // 2. Fallback: Resend API (only if RESEND_API_KEY is set and SMTP is not configured)
  if (resendApiKey) {
    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to,
          subject: content.subject,
          text: content.text,
          html: content.html,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error("Resend delivery failed with status:", resendRes.status);
        return { success: false, provider: "resend", error: errText };
      }

      const resendData = await resendRes.json();
      console.log(`Confirmation email sent via Resend to ${maskEmail(to)} (id: ${resendData.id})`);
      return { success: true, provider: "resend", messageId: resendData.id };
    } catch (resendErr: any) {
      console.error("Resend delivery error:", resendErr?.message || resendErr);
      return { success: false, provider: "resend", error: resendErr?.message || String(resendErr) };
    }
  }

  // 3. Neither configured
  console.log("email skipped");
  return { success: true, provider: "skipped" };
}

/**
 * Sends a test confirmation email for operator verification in Event Setup.
 */
export async function sendTestEmail(to: string, eventName?: string): Promise<EmailResult> {
  return sendRegistrationEmail({
    to,
    firstName: "Test Guest",
    queueNumber: 1,
    eventName: eventName || "Snap & Snack Event",
    guestToken: "test-token-sample-preview",
  });
}
