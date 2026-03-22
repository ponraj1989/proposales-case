import mongoose, { Schema, type Document } from 'mongoose';

// ─── User ───
export interface IUser extends Document {
  email: string;
  name: string;
  image?: string;
  role: 'customer' | 'sales';
  authMethod: 'google' | 'passkey';
  passkey?: string; // only for passkey users - stored as-is, matched at login
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    image: { type: String },
    role: { type: String, enum: ['customer', 'sales'], required: true, default: 'customer' },
    authMethod: { type: String, enum: ['google', 'passkey'], required: true },
    passkey: { type: String, select: false }, // excluded from queries by default
  },
  { timestamps: true },
);

// ─── Event (extracted from chat) ───
export interface IEvent extends Document {
  userId: mongoose.Types.ObjectId;
  date?: string;
  guests?: number;
  eventType?: string;
  budget?: number;
  location?: string;
  time?: string;
  setupType?: string;
  notes?: string;
  status: 'gathering' | 'complete' | 'proposal_sent' | 'booked' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<IEvent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String },
    guests: { type: Number },
    eventType: { type: String },
    budget: { type: Number },
    location: { type: String },
    time: { type: String },
    setupType: { type: String },
    notes: { type: String },
    status: {
      type: String,
      enum: ['gathering', 'complete', 'proposal_sent', 'booked', 'cancelled'],
      default: 'gathering',
    },
  },
  { timestamps: true },
);

// ─── Proposal ───
export interface IProposal extends Document {
  eventId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  proposalesUuid?: string; // UUID from Proposales API
  proposalUrl?: string; // URL for viewing/e-signing the proposal
  title: string;
  description?: string;
  price: number;
  currency: string;
  packages?: Array<{ name: string; description: string; price: number }>;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'negotiating';
  negotiationRound: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProposalSchema = new Schema<IProposal>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    proposalesUuid: { type: String },
    proposalUrl: { type: String },
    title: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    packages: [
      {
        name: { type: String },
        description: { type: String },
        price: { type: Number },
      },
    ],
    status: {
      type: String,
      enum: ['draft', 'sent', 'accepted', 'rejected', 'negotiating'],
      default: 'draft',
    },
    negotiationRound: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// ─── Booking ───
export interface IBooking extends Document {
  proposalId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  status: 'confirmed' | 'cancelled' | 'completed';
  invoiceUrl?: string;
  totalAmount: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema = new Schema<IBooking>(
  {
    proposalId: { type: Schema.Types.ObjectId, ref: 'Proposal', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    status: {
      type: String,
      enum: ['confirmed', 'cancelled', 'completed'],
      default: 'confirmed',
    },
    invoiceUrl: { type: String },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
  },
  { timestamps: true },
);

// ─── Conversation (MongoDB source of truth, Redis cache) ───
export interface IConversation extends Document {
  conversationId: string;   // UUID used in APIs
  userId: string;           // stable user ID (user-1, sales-1, google:email)
  title: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    parts?: unknown[];
    toolInvocations?: unknown[];
    createdAt: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    conversationId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    title: { type: String, default: 'New Conversation' },
    messages: [
      {
        id: { type: String, required: true },
        role: { type: String, required: true },
        content: { type: String, default: '' },
        parts: { type: Schema.Types.Mixed },
        toolInvocations: { type: Schema.Types.Mixed },
        createdAt: { type: Number, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
ConversationSchema.index({ userId: 1, updatedAt: -1 });

// ─── PMS Space ───
export interface IPmsSpace extends Document {
  spaceId: string;
  venueId: string;
  name: string;
  type: 'banquet' | 'boardroom' | 'outdoor' | 'conference' | 'restaurant';
  capacity: number;
  basePriceCents: number;
  amenities: string[];
  description: string;
  contentVariationId?: number;
  seedVersion?: number;
}

const PmsSpaceSchema = new Schema<IPmsSpace>(
  {
    spaceId: { type: String, required: true, unique: true },
    venueId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['banquet', 'boardroom', 'outdoor', 'conference', 'restaurant'], required: true },
    capacity: { type: Number, required: true },
    basePriceCents: { type: Number, required: true },
    amenities: [{ type: String }],
    description: { type: String },
    contentVariationId: { type: Number },
    seedVersion: { type: Number },
  },
  { timestamps: true },
);

// ─── PMS Inventory ───
export interface IPmsInventory extends Document {
  spaceId: string;
  date: string;
  timeSlotId: string;
  booked: boolean;
  bookingRef?: string;
}

const PmsInventorySchema = new Schema<IPmsInventory>(
  {
    spaceId: { type: String, required: true },
    date: { type: String, required: true },
    timeSlotId: { type: String, required: true },
    booked: { type: Boolean, default: false },
    bookingRef: { type: String },
  },
  { timestamps: true },
);
PmsInventorySchema.index({ spaceId: 1, date: 1, timeSlotId: 1 }, { unique: true });
PmsInventorySchema.index({ date: 1 });

// ─── PMS Hold ───
export interface IPmsHold extends Document {
  proposalUuid: string;
  spaceId: string;
  date: string;
  timeSlotId: string;
  guests: number;
  eventType?: string;
  contactEmail?: string;
  contactName?: string;
  heldAt: Date;
  expiresAt: Date;
  status: 'held' | 'confirmed' | 'expired' | 'released';
}

const PmsHoldSchema = new Schema<IPmsHold>(
  {
    proposalUuid: { type: String, required: true, index: true },
    spaceId: { type: String, required: true },
    date: { type: String, required: true },
    timeSlotId: { type: String, required: true },
    guests: { type: Number, required: true },
    eventType: { type: String },
    contactEmail: { type: String },
    contactName: { type: String },
    heldAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['held', 'confirmed', 'expired', 'released'], default: 'held' },
  },
  { timestamps: true },
);
PmsHoldSchema.index({ spaceId: 1, date: 1, timeSlotId: 1 });

// ─── User Proposal (tracks proposals created by a user via chat) ───
export interface IUserProposal extends Document {
  userEmail: string;
  proposalUuid: string;
  proposalTitle: string;
  proposalUrl?: string;
  status: 'draft' | 'active' | 'sent' | 'viewed' | 'accepted' | 'signed' | 'rejected' | 'expired';
  totalAmountCents: number;
  currency: string;
  venueType?: string;
  eventDate?: string;
  guests?: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserProposalSchema = new Schema<IUserProposal>(
  {
    userEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    proposalUuid: { type: String, required: true, unique: true },
    proposalTitle: { type: String, required: true },
    proposalUrl: { type: String },
    status: {
      type: String,
      enum: ['draft', 'active', 'sent', 'viewed', 'accepted', 'signed', 'rejected', 'expired'],
      default: 'draft',
    },
    totalAmountCents: { type: Number, default: 0 },
    currency: { type: String, default: 'EUR' },
    venueType: { type: String },
    eventDate: { type: String },
    guests: { type: Number },
  },
  { timestamps: true },
);
UserProposalSchema.index({ userEmail: 1, createdAt: -1 });

// ─── Email Log ───
export interface IEmailLog extends Document {
  proposalUuid?: string;
  to: string;
  recipientName: string;
  subject: string;
  type: 'esign' | 'proposal' | 'reminder' | 'follow_up';
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  sentAt: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  sentBy?: string;
  metadata?: Record<string, unknown>;
}

const EmailLogSchema = new Schema<IEmailLog>(
  {
    proposalUuid: { type: String, index: true },
    to: { type: String, required: true },
    recipientName: { type: String, required: true },
    subject: { type: String, required: true },
    type: { type: String, enum: ['esign', 'proposal', 'reminder', 'follow_up'], required: true },
    status: { type: String, enum: ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'], default: 'sent' },
    sentAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date },
    openedAt: { type: Date },
    clickedAt: { type: Date },
    sentBy: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
EmailLogSchema.index({ to: 1 });

// ─── Model exports (handle hot reload) ───
export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export const Event = mongoose.models.Event || mongoose.model<IEvent>('Event', EventSchema);
export const Proposal = mongoose.models.Proposal || mongoose.model<IProposal>('Proposal', ProposalSchema);
export const Booking = mongoose.models.Booking || mongoose.model<IBooking>('Booking', BookingSchema);
export const Conversation = mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', ConversationSchema);
export const PmsSpace = mongoose.models.PmsSpace || mongoose.model<IPmsSpace>('PmsSpace', PmsSpaceSchema);
export const PmsInventory = mongoose.models.PmsInventory || mongoose.model<IPmsInventory>('PmsInventory', PmsInventorySchema);
export const PmsHold = mongoose.models.PmsHold || mongoose.model<IPmsHold>('PmsHold', PmsHoldSchema);
export const UserProposal = mongoose.models.UserProposal || mongoose.model<IUserProposal>('UserProposal', UserProposalSchema);
export const EmailLog = mongoose.models.EmailLog || mongoose.model<IEmailLog>('EmailLog', EmailLogSchema);
