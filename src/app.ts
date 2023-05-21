import { AllMiddlewareArgs, App, SlackEventMiddlewareArgs } from "@slack/bolt";

import { CommandContext, runCommand } from "./commands";
import { cacheProvider } from "./config-cache";
import env from "./env";
import { formatUser } from "./formatting";
import { shell } from "./shell";
import { addReaction, getUserInfo } from "./wrappers";

const app = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  port: env.PORT,
});

async function processCommandMessage(
  user: string | null,
  text: string,
  context: CommandContext
) {
  const { event, say } = context;

  console.log(`${user ?? "(unknown user)"} muffin> ${text}`);

  let privileged = false;
  if (user !== null) {
    const userInfoResult = await getUserInfo(app, user);
    if (userInfoResult.ok) {
      privileged = userInfoResult.value.is_admin ?? false;
    } else {
      console.error(
        `shell: could not determine privilege: ${userInfoResult.error}`
      );
    }
  }

  const result = await runCommand(text, app, context, privileged);
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
  // Only respond to messages that start with a mention.
  const botUserId = (await cacheProvider.get(app)).botUserId;
  const botMention = formatUser(botUserId);
  let text = context.event.text.trimStart();
  if (!text.startsWith(botMention)) {
    // TODO: use postEphemeral to send a hint to the user?
    return;
  }

  // Remove the mention.
  text = text.substring(botMention.length);

  await processCommandMessage(context.event.user ?? null, text, context);
});

app.message(async (context) => {
  const { message } = context;
  if (
    message.channel_type === "im" &&
    message.subtype === undefined &&
    message.text !== undefined
  ) {
    await processCommandMessage(message.user, message.text, context);
  }
});

app.error(async (error) => {
  console.error(error);
});

async function main() {
  await app.start();
  console.log(`port: ${env.PORT}`);

  try {
    await cacheProvider.get(app);
  } catch (e) {
    const message = "failed to initialize config cache";
    console.error(`${message}: stopping the app...`);
    await app.stop();

    throw new Error(message, { cause: e });
  }

  console.log(`bot user ID: ${(await cacheProvider.get(app)).botUserId}`);
  shell(app).catch(console.error);
}

main().catch(console.error);
