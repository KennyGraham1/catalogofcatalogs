/**
 * Notification utilities
 * Stores in-app notifications and logs email delivery attempts.
 */

import { getCollection, COLLECTIONS } from './mongodb';
import { Logger } from './errors';
import type { UserNotification } from './auth/types';

const logger = new Logger('Notifications');

interface NotificationInput {
  userId: string;
  title: string;
  message: string;
  type: string;
  metadata?: Record<string, unknown> | null;
}

interface EmailNotificationInput {
  to: string;
  subject: string;
  message: string;
}

export async function createUserNotification(input: NotificationInput): Promise<UserNotification> {
  const collection = await getCollection<UserNotification>(COLLECTIONS.NOTIFICATIONS);
  const now = new Date().toISOString();

  const notification: UserNotification = {
    id: `notification_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    user_id: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    created_at: now,
    read_at: null,
    metadata: input.metadata || null,
  };

  await collection.insertOne(notification as any);
  return notification;
}

export async function sendEmailNotification(input: EmailNotificationInput): Promise<void> {
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.info('Email notification logged (no webhook configured)', {
      to: input.to,
      subject: input.subject,
    });
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: input.to,
        subject: input.subject,
        message: input.message,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Email webhook failed: ${response.status} ${body}`);
    }
  } catch (error) {
    logger.warn('Email notification failed', { error: error instanceof Error ? error.message : error });
  }
}

