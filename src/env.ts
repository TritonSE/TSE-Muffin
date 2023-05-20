import "dotenv/config";

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

const env = {
  PORT: getPort(),
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
} as const;

export default env;
