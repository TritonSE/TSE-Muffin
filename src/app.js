const env = require("./env");

const { App } = require("@slack/bolt");

const app = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  port: env.PORT,
});

app.event("app_mention", async ({ event, say }) => {
  say(`Hello world! <@${event.user}> said: ${event.text}`);
});

async function main() {
  await app.start();
  console.log(`Running on port ${env.PORT}`);
}

main();
