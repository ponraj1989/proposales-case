// ─── Common ───
export interface ApiError {
  error: {
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
}

export interface SingleResponse<T> {
  data: T;
}

export type IntegrationFieldIconName =
  | 'person'
  | 'attendees'
  | 'accommodation'
  | 'chevron-right'
  | 'add';

export type IntegrationSelectField = {
  type: 'select';
  id: string;
  helpLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  options?: {
    name: string;
    value?: string;
  }[];
};

export type IntegrationTextField = {
  type: 'text' | 'url' | 'tel' | 'email' | 'password';
  id: string;
  helpLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  icon?: IntegrationFieldIconName;
};

export type IntegrationNumberField = {
  type: 'number';
  id: string;
  defaultValue?: number | string;
  helpLabel?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  icon?: IntegrationFieldIconName;
  min?: number;
  max?: number;
  integerOnly?: boolean;
};

export type IntegrationHiddenField = {
  type: 'hidden';
  defaultValue?: string | number | boolean;
};

export type IntegrationSwitchField = {
  type: 'switch';
  id: string;
  defaultValue?: boolean;
  helpLabel?: string;
  readOnly?: boolean;
};

export type IntegrationLinkButtonField = {
  type: 'linkButton';
  label: string;
  href: string;
  icon: IntegrationFieldIconName;
};

export type IntegrationDividerField = {
  type: 'divider';
  text?: string;
};

export type IntegrationHeaderField = {
  type: 'header';
  text: string;
};

export type IntegrationTextBodyField = {
  type: 'textBody';
  text: string;
  markdown?: boolean;
};

export type IntegrationField =
  | IntegrationSelectField
  | IntegrationTextField
  | IntegrationNumberField
  | IntegrationHiddenField
  | IntegrationSwitchField
  | IntegrationLinkButtonField
  | IntegrationDividerField
  | IntegrationHeaderField
  | IntegrationTextBodyField;

export type IntegrationMetadata = Record<string, unknown> & {
  integration_fields?: IntegrationField[];
};

// ─── Proposal ───
export type ProposalStatus =
  | 'draft'
  | 'template'
  | 'active'
  | 'expired'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'replaced'
  | null;

export interface AssetRef {
  id: number;
  uuid: string;
}

export interface Recipient {
  id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  sources?: {
    integration?: {
      id: number;
      contactId: string;
      metadata: IntegrationMetadata;
    };
  };
}

export interface TaxOptions {
  mode?: 'standard' | 'simplified' | 'tax-free' | 'none';
  tax_included?: boolean;
  tax_label_key?: string;
}

export interface ProposalBlock {
  uuid: string;
  type: 'product-block' | 'video-block';
  content_id?: number;
  title?: string;
  description?: string;
  currency?: string;
  language: string;
  quantity?: number;
  quantity_editable?: boolean;
  quantity_min?: number;
  quantity_max?: number;
  quantity_variable?: boolean;
  quantity_variable_data?: string;
  optional?: boolean;
  optional_picked?: boolean;
  recurring?: boolean;
  relative?: boolean;
  fixed_discount?: number;
  percent_discount?: number;
  image_uuids?: string[];
  multi_product_enabled?: boolean;
  multi_product_data?: MultiProductRow[];
  unit?: string;
  unit_value_with_discount_with_tax?: number;
  unit_value_with_discount_without_tax?: number;
  unit_value_without_discount_with_tax?: number;
  unit_value_without_discount_without_tax?: number;
  video_url?: string;
  comment?: string;
  package_split?: PackageSplit;
  sources?: Record<string, unknown>;
  updated_at?: number;
  source_content_updated_at?: number;
  inventory_connected?: boolean;
  quantity_visible?: boolean;
}

export interface MultiProductSubRow {
  uuid: string;
  label?: string;
  notes?: string;
  quantity?: number;
  unit?: string;
  unitValueWithDiscountWithoutTax: number;
  unitValueWithDiscountWithTax: number;
  unitValueWithoutDiscountWithoutTax: number;
  unitValueWithoutDiscountWithTax: number;
}

export interface MultiProductRow {
  uuid: string;
  dateFrom?: string;
  dateTo?: string;
  discount?: number;
  fixed_discount?: number;
  packageInfo?: {
    packageName?: string;
    sourceRowUuid: string;
  };
  occupancy?: number;
  label?: string;
  notes?: string;
  setup?: string;
  quantity?: number;
  unit?: string;
  subrows?: MultiProductSubRow[];
  unitValueWithDiscountWithoutTax: number;
  unitValueWithDiscountWithTax: number;
  unitValueWithoutDiscountWithoutTax: number;
  unitValueWithoutDiscountWithTax: number;
  _unitValueWasOverridden?: boolean;
  compoundedValues?: {
    unitValueWithDiscountWithoutTax: number;
    unitValueWithDiscountWithTax: number;
    unitValueWithoutDiscountWithoutTax: number;
    unitValueWithoutDiscountWithTax: number;
  };
}

export interface PackageSplitItem {
  enable_discount?: boolean;
  fixed?: boolean;
  type: 'accommodation' | 'meetingRoom' | 'food' | 'other';
  value_saved_with_tax?: boolean;
  value_with_tax?: number;
  value_without_tax?: number;
  vat?: number;
  /** @deprecated Use value_without_tax instead */
  value?: number;
}

export type PackageSplit = PackageSplitItem[];

export interface ProposalSignature {
  date: string;
  ip: string;
  name: string;
  user_agent: string;
  user_id?: number;
}

export interface ProposalAttachment {
  id: number;
  mime_type: string;
  name: string;
  url?: string;
  uuid?: string;
}

export interface Proposal {
  uuid: string;
  series_uuid?: string;
  status: ProposalStatus;
  version: number | null;
  title?: string;
  title_md: string | null;
  description_md: string | null;
  description_html?: string;
  language: string;
  currency: string;
  company_id: number;
  company_website?: string;
  contact_avatar_uuid?: string;
  company_name?: string;
  company_email?: string;
  company_phone?: string;
  company_address?: string;
  company_logo_uuid?: string;
  company_avatar_uuid?: string;
  company_registration_number?: string;
  company_timezone?: string;
  company_powerups?: Record<string, unknown>;
  company_powerups_live?: Record<string, unknown>;
  company_tax_mode_live?: string;
  creator_id: number;
  creator_name: string | null;
  contact_id?: number;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  contact_title: string | null;
  contact_avatar_transform?: string;
  user_email?: string;
  recipient_id: number | null;
  recipient_is_set: boolean;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_company_name: string | null;
  recipient_sources?: Record<string, unknown>;
  blocks: ProposalBlock[];
  attachments: ProposalAttachment[];
  signatures: ProposalSignature[];
  background_image: AssetRef | null;
  background_video: AssetRef | null;
  background_image_uuid?: string;
  data: Record<string, unknown>;
  tax_options: TaxOptions;
  invoicing?: {
    data_prefill?: unknown;
    data?: Record<string, string>;
    enabled?: boolean;
    form_overrides?: object;
    reminder_sent_at?: string;
    submitted_at?: string;
  };
  editor?: {
    cc?: number[];
    notification_user_ids?: number[];
  };
  tracking?: {
    accepted_at?: string;
    accepted_by_mobile?: boolean;
    created_from_proposal?: string;
    created_from_rfp?: number;
    created_from_template?: string;
    expired_at?: string;
    expiration_reminder_sent_at?: string;
    first_viewed_at?: string;
    last_viewed_at?: string;
    number_of_views?: number;
    rejected_at?: string;
    sent_at?: string;
    withdrawn_at?: string;
    marked_as_accepted_by_user?: {
      email?: string;
      id: number;
      name?: string;
    };
  };
  value_with_tax: number;
  value_without_tax: number;
  expires_at: number | null;
  updated_at: number;
  status_changed_at: number;
  archived_at: number | null;
  is_agreement: boolean;
  is_only_proposal_in_series: boolean;
  is_test: boolean;
  pending: boolean;
  pending_reason: string | null;
  pdf_url?: string | null;
  payments_enabled?: boolean;
  payment?: Record<string, unknown>;
}

export interface ProposalSearchResult {
  created_at: number;
  updated_at: number;
  title: string;
  uuid: string;
  series_uuid: string;
  company_id: number;
  version: number;
  status: ProposalStatus;
  data: Record<string, unknown>;
}

// ─── Content ───
export interface ContentImage {
  uuid: string;
  filename?: string;
  mime_type?: string;
  url?: string;
  size?: number;
  height?: number;
  width?: number;
}

export interface Content {
  created_at: number;
  description: Record<string, string>;
  product_id: number;
  variation_id: number;
  title: Record<string, string>;
  is_archived?: boolean;
  sources?: Record<string, unknown>;
  images?: ContentImage[];
  integration_id?: number;
  integration_metadata?: Record<string, unknown>;
}

// ─── Company ───
export interface Company {
  id: number;
  created_at: number;
  name: string;
  currency: string;
  tax_mode: string;
  registration_number: string;
  website_url: string;
}

export interface CompanyTemplate {
  title: string;
  uuid: string;
  language: string;
  background_image_uuid: string;
}

// ─── Attachment ───
export interface Attachment {
  created_at: number;
  filename: string;
  id: number;
}

// ─── RFP/Inbox ───
export interface RfpResponse {
  id: number | string;
}
