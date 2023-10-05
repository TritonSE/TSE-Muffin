function getPort(): number {
  const port = process.env.PORT;
  if (port !== undefined) {
    const parsed = parseInt(port, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 3000;
}

function assertEnvVar(
  env: Record<string, string | undefined>,
  key: string,
): string {
  const value = env[key];
  if (typeof value === "string") {
    return value;
  }

  throw new Error(
    [
      `Environment variable '${key}' is not defined.`,
      "Refer to the .env.example file for the required environment variables.",
      "If this is a development environment, you can create a local .env file,",
      "using .env.example as a template.",
    ].join(" "),
  );
}

function assertBooleanEnvVar(
  env: Record<string, string | undefined>,
  key: string,
): boolean {
  const value = assertEnvVar(env, key);
  if (value === "true") {
    return true;
  } else if (value === "false") {
    return false;
  }

  throw new Error(
    [
      `Environment variable '${key}' is invalid:`,
      "acceptable values are 'true' and 'false'.",
    ].join(" "),
  );
}

function assertIntegerEnvVar(
  env: Record<string, string | undefined>,
  key: string,
): number {
  const value = assertEnvVar(env, key);

  if (/^[0-9]+$/.test(value)) {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  throw new Error(
    `Environment variable '${key}' cannot be parsed as an integer.`,
  );
}

const env = {
  PORT: getPort(),
  MONGODB_URI: assertEnvVar(process.env, "MONGODB_URI"),
  SLACK_BOT_TOKEN: assertEnvVar(process.env, "SLACK_BOT_TOKEN"),
  SLACK_SIGNING_SECRET: assertEnvVar(process.env, "SLACK_SIGNING_SECRET"),
  PERIODIC_JOB_INTERVAL_SEC: assertIntegerEnvVar(
    process.env,
    "PERIODIC_JOB_INTERVAL_SEC",
  ),
  MOCK_SCHEDULED_MESSAGES: assertBooleanEnvVar(
    process.env,
    "MOCK_SCHEDULED_MESSAGES",
  ),

  // Initialized at application startup.
  BOT_USER_ID: "",
} as const;

export default env;
