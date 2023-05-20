import { AllMiddlewareArgs, App, SlackEventMiddlewareArgs } from "@slack/bolt";

import { runCommand } from "./commands";
import env from "./env";
import { formatUser } from "./formatting";
import { shell } from "./shell";
import { addReaction, getBotUserId } from "./wrappers";

const app = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  port: env.PORT,
});

async function processCommandMessage(
  text: string,
  context: SlackEventMiddlewareArgs<"app_mention" | "message"> &
    AllMiddlewareArgs
) {
  const { event, say } = context;

  console.log(`(non-interactive) muffin> ${text}`);

  const result = await runCommand(text, app, context);
  const reply: string | null = result.ok ? result.value : result.error;

  if (reply !== null) {
    console.log(reply);
  }
  console.log(result.ok ? "(ok)" : "(err)");

  const promises: Promise<unknown>[] = [
    addReaction(
      app,
      event.channel,
      event.ts,
      result.ok ? "white_check_mark" : "x"
    ),
  ];

  if (reply !== null) {
    promises.push(say("```" + reply + "```"));
  }

  await Promise.allSettled(promises);
}

app.event("app_mention", async (context) => {
  const botMention = formatUser(await getBotUserId(app));
  let text = context.event.text.trimStart();
  if (!text.startsWith(botMention)) {
    // Don't respond to messages that don't start with a mention.
    // TODO: use postEphemeral to send a hint to the user?
    return;
  }

  // Remove the mention.
  text = text.substring(botMention.length);

  await processCommandMessage(text, context);
});

app.message(async (context) => {
  const { message } = context;
  if (
    message.channel_type === "im" &&
    message.subtype === undefined &&
    message.text !== undefined
  ) {
    await processCommandMessage(message.text, context);
  }
});

app.error(async (error) => {
  console.error(error);
});

async function main() {
  await app.start();
  console.log(`port: ${env.PORT}`);

  const botUserId = await getBotUserId(app);
  console.log(`bot user ID: ${botUserId}`);

  shell(app).catch(console.error);
}

main().catch(console.error);
