export type ProviderPreset = {
  key: string;
  label: string;
  shortLabel: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  spfInclude: string | null;
  dkimSelectors: string[];
  suggestedDailyLimit: number;
  help: string;
  passwordSteps: string[];
  passwordLink: { label: string; url: string } | null;
  extraLink?: { label: string; url: string };
  needsAppPassword: boolean;
};

export const PROVIDERS: ProviderPreset[] = [
  {
    key: "gmail",
    label: "Gmail / Google Workspace",
    shortLabel: "Gmail / Google Workspace",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    imapHost: "imap.gmail.com",
    imapPort: 993,
    spfInclude: "include:_spf.google.com",
    dkimSelectors: ["google"],
    suggestedDailyLimit: 50,
    help: "Google doesn't accept your normal password for SMTP. Turn on 2-step verification and create a 16-letter App Password.",
    passwordSteps: [
      "Google doesn't accept your normal password here.",
      "Turn on 2-step verification for this Google account, then create an app password (button below) and paste the 16-letter code.",
    ],
    passwordLink: {
      label: "Create Google app password",
      url: "https://myaccount.google.com/apppasswords",
    },
    extraLink: {
      label: "Turn on 2-step verification",
      url: "https://myaccount.google.com/signinoptions/twosv",
    },
    needsAppPassword: true,
  },
  {
    key: "zoho_in",
    label: "Zoho Mail",
    shortLabel: "Zoho Mail",
    smtpHost: "smtppro.zoho.in",
    smtpPort: 465,
    imapHost: "imappro.zoho.in",
    imapPort: 993,
    spfInclude: "include:zoho.in",
    dkimSelectors: ["zmail", "zoho", "default"],
    suggestedDailyLimit: 50,
    help: "Turn on IMAP access in Zoho Mail Settings → Mail Accounts → IMAP. Use an app password if 2FA is active.",
    passwordSteps: [
      "Turn on IMAP in Zoho Mail (button below) so replies can be read.",
      "If Zoho asks for a code when you sign in, create an app password and paste it here. Otherwise your normal Zoho password works.",
    ],
    passwordLink: {
      label: "Create Zoho app password",
      url: "https://accounts.zoho.in/home#security/app_password",
    },
    extraLink: {
      label: "Turn on IMAP in Zoho",
      url: "https://mail.zoho.in/zm/#settings/mail/imap",
    },
    needsAppPassword: false,
  },
  {
    key: "zoho_com",
    label: "Zoho Mail",
    shortLabel: "Zoho Mail",
    smtpHost: "smtppro.zoho.com",
    smtpPort: 465,
    imapHost: "imappro.zoho.com",
    imapPort: 993,
    spfInclude: "include:zoho.com",
    dkimSelectors: ["zmail", "zoho", "default"],
    suggestedDailyLimit: 50,
    help: "Enable IMAP in Zoho Mail Settings → Mail Accounts → IMAP.",
    passwordSteps: [
      "Turn on IMAP in Zoho Mail (button below) so replies can be read.",
      "If Zoho asks for a code when you sign in, create an app password and paste it here. Otherwise your normal Zoho password works.",
    ],
    passwordLink: {
      label: "Create Zoho app password",
      url: "https://accounts.zoho.com/home#security/app_password",
    },
    extraLink: {
      label: "Turn on IMAP in Zoho",
      url: "https://mail.zoho.com/zm/#settings/mail/imap",
    },
    needsAppPassword: false,
  },
  {
    key: "zoho_eu",
    label: "Zoho Mail (EU)",
    shortLabel: "Zoho Mail",
    smtpHost: "smtppro.zoho.eu",
    smtpPort: 465,
    imapHost: "imappro.zoho.eu",
    imapPort: 993,
    spfInclude: "include:zoho.eu",
    dkimSelectors: ["zmail", "zoho", "default"],
    suggestedDailyLimit: 50,
    help: "Enable IMAP in Zoho Mail EU Settings → Mail Accounts → IMAP.",
    passwordSteps: [
      "Turn on IMAP in Zoho Mail (button below) so replies can be read.",
      "If Zoho asks for a code when you sign in, create an app password and paste it here. Otherwise your normal Zoho password works.",
    ],
    passwordLink: {
      label: "Create Zoho app password",
      url: "https://accounts.zoho.eu/home#security/app_password",
    },
    extraLink: {
      label: "Turn on IMAP in Zoho",
      url: "https://mail.zoho.eu/zm/#settings/mail/imap",
    },
    needsAppPassword: false,
  },
  {
    key: "outlook",
    label: "Outlook / Microsoft 365",
    shortLabel: "Outlook / Microsoft 365",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    imapHost: "outlook.office365.com",
    imapPort: 993,
    spfInclude: "include:spf.protection.outlook.com",
    dkimSelectors: ["selector1", "selector2"],
    suggestedDailyLimit: 50,
    help: "Ensure Authenticated SMTP and IMAP are enabled in Microsoft 365 Admin Center.",
    passwordSteps: [
      "Allow Authenticated SMTP and IMAP for this mailbox in Microsoft 365.",
      "Paste an app password if MFA is enforced on your account.",
    ],
    passwordLink: {
      label: "Microsoft security settings",
      url: "https://account.microsoft.com/security",
    },
    needsAppPassword: false,
  },
  {
    key: "godaddy",
    label: "GoDaddy Email (Workspace / Pro)",
    shortLabel: "GoDaddy Email",
    smtpHost: "smtpout.secureserver.net",
    smtpPort: 465,
    imapHost: "imap.secureserver.net",
    imapPort: 993,
    spfInclude: "include:secureserver.net",
    dkimSelectors: ["default", "secureserver", "s1"],
    suggestedDailyLimit: 50,
    help: "Use your full email address and mailbox password.",
    passwordSteps: [
      "Enter your full email address and mailbox password from email.secureserver.net.",
    ],
    passwordLink: null,
    needsAppPassword: false,
  },
  {
    key: "custom",
    label: "Custom SMTP / IMAP Host",
    shortLabel: "Custom mail server",
    smtpHost: "",
    smtpPort: 465,
    imapHost: "",
    imapPort: 993,
    spfInclude: null,
    dkimSelectors: ["default", "mail", "dkim", "selector1"],
    suggestedDailyLimit: 50,
    help: "We try your domain's MX/mail host automatically, or you can specify custom SMTP/IMAP details.",
    passwordSteps: [
      "Enter your mailbox password or app-specific password.",
      "SMTP (465/587) and IMAP (993) settings are auto-filled from your domain.",
    ],
    passwordLink: null,
    needsAppPassword: false,
  },
];

export function providerByKey(key: string | null | undefined): ProviderPreset {
  return PROVIDERS.find((p) => p.key === key) ?? PROVIDERS[PROVIDERS.length - 1]!;
}

export function presetForAccount(a: {
  provider: string;
  provider_label: string;
  smtp_host: string | null;
}): ProviderPreset {
  if (a.provider === "gmail_api") return providerByKey("gmail");
  const byLabel = PROVIDERS.find((p) => p.key === a.provider_label);
  if (byLabel) return byLabel;
  const host = (a.smtp_host ?? "").toLowerCase();
  if (host.includes("zoho.in")) return providerByKey("zoho_in");
  if (host.includes("zoho.eu")) return providerByKey("zoho_eu");
  if (host.includes("zoho")) return providerByKey("zoho_com");
  if (host.includes("secureserver")) return providerByKey("godaddy");
  if (host.includes("gmail") || host.includes("google")) return providerByKey("gmail");
  if (host.includes("office365") || host.includes("outlook")) return providerByKey("outlook");
  return providerByKey("custom");
}
