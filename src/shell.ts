import { stdin, stdout } from "node:process";
import { promises as readline } from "node:readline";

import { App } from "@slack/bolt";

import { runCommand } from "./commands";
import { Result } from "./result";

async function shell(app: App) {
  const rl = readline.createInterface(stdin, stdout);

  const promptSuffix = "muffin> ";
  const setBlankPrompt = () => rl.setPrompt(promptSuffix);
  const setOkPrompt = () => rl.setPrompt("(ok) " + promptSuffix);
  const setErrPrompt = () => rl.setPrompt("(err) " + promptSuffix);

  setBlankPrompt();

  console.log(
    "shell: welcome to muffin interactive shell! (use `help` for help)"
  );
  rl.prompt();

  for await (const line of rl) {
    if (line.trim().length === 0) {
      setBlankPrompt();
      rl.prompt();
      continue;
    }

    let result: Result<string | null, string>;
    try {
      result = await runCommand(line, app, null, true);
    } catch (e) {
      console.error(e);
      setErrPrompt();
      rl.prompt();
      continue;
    }

    if (result.ok) {
      if (typeof result.value === "string") {
        console.log(result.value);
      }
      setOkPrompt();
    } else {
      console.error(result.error);
      setErrPrompt();
    }
    rl.prompt();
  }

  console.log(
    "shell: stdin closed: this interactive shell will exit, but muffin will continue to serve network requests"
  );
}

export { shell };
