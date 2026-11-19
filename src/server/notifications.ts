import nodemailer from 'nodemailer';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { notifications } from '../db/schema.ts';

export interface NotificationInput {
  userId?: number | null;
  email?: string | null;
  type: string;
  title: string;
  message: string;
  channel?: 'IN_APP' | 'EMAIL';
  metadata?: Record<string, any>;
  sendEmailToo?: boolean;
}

async function dispatchRealEmail(to: string, subject: string, textBody: string): Promise<{ sent: boolean; note: string }> {
  const from = process.env.EMAIL_FROM || 'BookMyte <no-reply@bookmyte.com>';

  // Option 1: Resend API
  if (process.env.RESEND_API_KEY) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text: textBody,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return { sent: false, note: `Resend HTTP ${resp.status}: ${errText}` };
      }
      return { sent: true, note: 'Delivered via Resend API' };
    } catch (err: any) {
      return { sent: false, note: err?.message || 'Resend dispatch error' };
    }
  }

  // Option 2: SMTP via Nodemailer
  if (process.env.SMTP_HOST) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        auth: process.env.SMTP_USER
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS || '',
            }
          : undefined,
      });
      await transporter.sendMail({
        from,
        to,
        subject,
        text: textBody,
      });
      return { sent: true, note: `Delivered via SMTP (${process.env.SMTP_HOST})` };
    } catch (err: any) {
      return { sent: false, note: err?.message || 'SMTP dispatch error' };
    }
  }

  // Honest fallback when external email transport is not configured
  return {
    sent: false,
    note: 'Email transport not configured (set RESEND_API_KEY or SMTP_HOST). Queued in notifications log for retry.',
  };
}

export async function createNotification(input: NotificationInput) {
  const results = [];

  if (input.userId) {
    const [inApp] = await db
      .insert(notifications)
      .values({
        userId: input.userId,
        email: input.email || null,
        type: input.type,
        title: input.title,
        message: input.message,
        channel: 'IN_APP',
        status: 'SENT',
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      })
      .returning();
    results.push(inApp);
  }

  if (input.email && (input.channel === 'EMAIL' || input.sendEmailToo)) {
    const delivery = await dispatchRealEmail(input.email, input.title, input.message);
    const [emailLog] = await db
      .insert(notifications)
      .values({
        userId: input.userId || null,
        email: input.email,
        type: input.type,
        title: input.title,
        message: input.message,
        channel: 'EMAIL',
        status: delivery.sent ? 'SENT' : 'PENDING',
        lastError: delivery.sent ? null : delivery.note,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      })
      .returning();
    results.push(emailLog);
  }

  return results;
}

export async function retryEmailNotification(notificationId: number) {
  const [notif] = await db.select().from(notifications).where(eq(notifications.id, notificationId));
  if (!notif) return { ok: false, error: 'Notification not found' };
  if (!notif.email) return { ok: false, error: 'No recipient email on record' };

  const delivery = await dispatchRealEmail(notif.email, notif.title, notif.message);
  const [updated] = await db
    .update(notifications)
    .set({
      status: delivery.sent ? 'SENT' : 'FAILED',
      retryCount: notif.retryCount + 1,
      lastError: delivery.sent ? null : delivery.note,
    })
    .where(eq(notifications.id, notificationId))
    .returning();

  return { ok: delivery.sent, notification: updated, note: delivery.note };
}
