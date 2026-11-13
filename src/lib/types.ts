export type AccountProvider = "gmail_api" | "smtp";
export type AccountStatus = "active" | "paused" | "error";

export interface SendingAccount {
  id: string;
  email: string;
  display_name: string;
  provider: AccountProvider;
  provider_label: string;
  smtp_host: string | null;
  smtp_port: number | null;
  imap_host: string | null;
  imap_port: number | null;
  daily_limit: number;
  warmup_enabled: boolean;
  warmup_daily_cap: number;
  sent_today: number;
  health_score: number;
  signature: string;
  status: AccountStatus;
  has_credentials: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export type Attachment =
  | { kind: "file"; path: string; name: string; size: number; type: string }
  | { kind: "link"; url: string; label: string }
  | { kind: "video"; url: string; label: string; provider?: "loom" | "youtube" | "vimeo" | "video" };

export interface FollowUpStep {
  delay_days: number;
  body: string;
  attachments?: Attachment[];
}

export type CampaignStatus = "draft" | "running" | "paused" | "completed";

export interface BehaviorRules {
  out_of_office: "continue" | "stop";
  later_check_in: boolean;
  later_delay_days: number;
  later_body: string;
  stop_on_reply: boolean;
  stop_on_bounce: boolean;
  stop_on_unsubscribe: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  account_ids: string[];
  subject: string;
  body: string;
  attachments: Attachment[];
  follow_ups: FollowUpStep[];
  daily_limit: number;
  sent_today: number;
  behavior: BehaviorRules;
  created_at: string;
  updated_at: string;
}

export type EmailCheckStatus = "valid" | "risky" | "invalid" | "unchecked";
export type LeadStatus = "new" | "contacted" | "replied" | "interested" | "not_interested" | "bounced" | "unsubscribed";

export interface Lead {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  designation: string;
  industry: string;
  tags: string[];
  status: LeadStatus;
  email_check: EmailCheckStatus;
  email_check_reason: string | null;
  email_checked_at: string | null;
  ai_line: string | null;
  ai_line_at: string | null;
  custom_fields: Record<string, string>;
  created_at: string;
}

export type CampaignLeadStatus = "pending" | "active" | "replied" | "completed" | "bounced" | "unsubscribed" | "paused";

export interface CampaignLead {
  id: string;
  campaign_id: string;
  lead_id: string;
  account_id: string | null;
  current_step: number;
  status: CampaignLeadStatus;
  last_sent_at: string | null;
  next_send_at: string | null;
  sequence_stopped_at: string | null;
  stop_reason: string | null;
  error: string | null;
}

export type MessageDirection = "outbound" | "inbound";
export type ReplyCategory = "interested" | "question" | "follow_up_later" | "not_interested" | "out_of_office" | "unsubscribe" | "bounce" | null;

export interface EmailMessage {
  id: string;
  thread_id: string;
  campaign_id: string | null;
  lead_id: string;
  account_id: string;
  direction: MessageDirection;
  step: number;
  is_manual: boolean;
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  attachments: Attachment[];
  message_id_header: string;
  in_reply_to: string | null;
  category: ReplyCategory;
  created_at: string;
}

export interface ConversationState {
  thread_id: string;
  lead_id: string;
  campaign_id: string | null;
  account_id: string;
  status: "open" | "closed";
  last_message_at: string;
  closed_at: string | null;
  auto_closed: boolean;
  unread: boolean;
}

export interface Template {
  id: string;
  name: string;
  kind: "email" | "follow_up" | "reply";
  subject: string;
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  send_start_hour: number;
  send_end_hour: number;
  send_weekdays_only: boolean;
  time_zone: string;
  auto_close_days: number;
  ai_context: string;
  default_signature: string;
  default_follow_up_delays: number[];
  default_behavior: BehaviorRules;
  tracking_pixels_disabled: true;
  click_tracking_disabled: true;
}

export interface Suppression {
  id: string;
  email: string;
  reason: "unsubscribed" | "bounced" | "manual";
  source: string;
  created_at: string;
}

export interface DashboardDailyMetric {
  date: string;
  label: string;
  sent: number;
  replies: number;
  bounces: number;
}

export interface DashboardStats {
  total_sent: number;
  sent_today: number;
  total_replies: number;
  positive_replies: number;
  reply_rate: number;
  positive_rate: number;
  bounce_rate: number;
  active_campaigns: number;
  open_threads: number;
  verified_leads: number;
  daily_series: DashboardDailyMetric[];
}

export interface InboxThreadItem {
  state: ConversationState;
  lead: Lead;
  campaign: Pick<Campaign, "id" | "name"> | null;
  account: Pick<SendingAccount, "id" | "email" | "display_name" | "signature">;
  messages: EmailMessage[];
  last_message: EmailMessage;
}
