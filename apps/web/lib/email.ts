import { getSDK } from '@/lib/sdk';
import connectDB from '@/lib/mongodb';
import { EmailLog } from '@/lib/models';

export interface EsignEmailOptions {
  to: string;
  recipientName: string;
  proposalTitle: string;
  totalAmount: string;
  esignUrl: string;
  proposalUuid?: string;
  sentBy?: string;
}

/**
 * Sends an e-sign email via the Proposales Inbox/RFP API.
 * The API sends a confirmation email to the provided address.
 */
export async function sendEsignEmail(options: EsignEmailOptions): Promise<boolean> {
  const { to, recipientName, proposalTitle, totalAmount, esignUrl, proposalUuid, sentBy } = options;

  const inboxToken = process.env.PROPOSALES_INBOX_TOKEN;
  if (!inboxToken) {
    console.warn('PROPOSALES_INBOX_TOKEN not configured — skipping e-sign email');
    return false;
  }

  const nameParts = recipientName.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const sdk = getSDK();
  await sdk.inbox.createRfp(inboxToken, {
    email: to,
    first_name: firstName,
    last_name: lastName,
    message: `Your proposal "${proposalTitle}" (${totalAmount}) has been confirmed. View & e-sign: ${esignUrl}`,
    language: 'en',
  });

  // Log the email to MongoDB for sales tracking
  if (proposalUuid) {
    try {
      await connectDB();
      await EmailLog.create({
        proposalUuid,
        to,
        recipientName,
        subject: `E-sign: ${proposalTitle}`,
        type: 'esign',
        status: 'sent',
        sentAt: new Date(),
        sentBy: sentBy || 'system',
      });
    } catch (err) {
      console.warn('Failed to log email:', err);
    }
  }

  return true;
}
