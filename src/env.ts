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

const env = {
  PORT: getPort(),
  MONGODB_URI: assertEnvVar(process.env, "MONGODB_URI"),
  SLACK_BOT_TOKEN: assertEnvVar(process.env, "SLACK_BOT_TOKEN"),
  SLACK_SIGNING_SECRET: assertEnvVar(process.env, "SLACK_SIGNING_SECRET"),
  MOCK_SCHEDULED_MESSAGES: assertBooleanEnvVar(
    process.env,
    "MOCK_SCHEDULED_MESSAGES",
  ),
} as const;

export default env;
