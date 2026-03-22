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

export interface EsignEmailResult {
  sent: boolean;
  esignId?: string;
  esignUrl?: string;
}

async function createInboxRfp(input: {
  email: string;
  first_name?: string;
  last_name?: string;
  message?: string;
  company_name?: string;
  language?: string;
  start_date?: string;
  end_date?: string;
}): Promise<{ created: boolean; id?: string }> {
  const inboxToken = process.env.PROPOSALES_INBOX_TOKEN;
  if (!inboxToken) {
    console.warn('PROPOSALES_INBOX_TOKEN not configured — skipping inbox RFP creation');
    return { created: false };
  }

  const sdk = getSDK();
  const rfpResponse = await sdk.inbox.createRfp(inboxToken, input);
  const rawId = (rfpResponse as { id?: string | number })?.id;

  return {
    created: true,
    id: rawId != null ? String(rawId) : undefined,
  };
}


/**
 * Sends an e-sign email via the Proposales Inbox/RFP API.
 * The API sends a confirmation email to the provided address.
 */
export async function sendEsignEmail(options: EsignEmailOptions): Promise<EsignEmailResult> {
  const { to, recipientName, proposalTitle, totalAmount, esignUrl, proposalUuid, sentBy } = options;

  const nameParts = recipientName.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const created = await createInboxRfp({
    email: to,
    first_name: firstName,
    last_name: lastName,
    message: `Your proposal "${proposalTitle}" (${totalAmount}) has been confirmed. View & e-sign: ${esignUrl}`,
    language: 'en',
  });

  if (!created.created) {
    return { sent: false };
  }

  const esignId = created.id;
  const resolvedEsignUrl = esignUrl;

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

  return {
    sent: true,
    esignId,
    esignUrl: resolvedEsignUrl,
  };
}
