const REQUIRED_ENV = {
  openai: ["OPENAI_API_KEY"],
  supabase: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  supabaseAdmin: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
} as const;

type EnvGroup = keyof typeof REQUIRED_ENV;

export function requireEnv(group: EnvGroup) {
  const missing = REQUIRED_ENV[group].filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}.`);
  }
}

export function requireGoogleExportEnv() {
  const missing = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"].filter(
    (key) => !process.env[key],
  );

  if (missing.length > 0) {
    throw new Error(`Missing Google export credentials: ${missing.join(", ")}.`);
  }
}
