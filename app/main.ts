import path from "path";
import { createInterface } from "readline";
import fs from "fs";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

// TODO: Uncomment the code below to pass the first stage
rl.prompt();

rl.on("line", (command) => {
  if (command === "exit") {
    rl.close();
    return;
  } else if (command.startsWith("echo ")) {
    console.log(command.slice(5));
    rl.prompt();
    return;
  } else if (command.startsWith("type ")) {
    const commandName = command.slice(5);

    if (
      commandName === "type" ||
      commandName === "echo" ||
      commandName === "exit"
    ) {
      console.log(`${commandName} is a shell builtin`);
      rl.prompt();
      return;
    } else {
      const envVar = process.env.PATH || "";

      const normalized =
        path.delimiter === ";" ? envVar.split(";") : envVar.split(":");

      for (const dir of normalized) {
        const commandPath = path.join(dir, commandName);

        try {
          if (
            fs.existsSync(commandPath)
          ) {
            fs.accessSync(commandPath, fs.constants.X_OK)
            console.log(`${commandName} is ${commandPath}`);
            rl.prompt();
            return;
          }
        } catch (error) {
          // Ignore errors and continue searching
        }
      }

      console.log(`${commandName}: not found`);
      rl.prompt();
    }
  } else {
    console.log(`${command}: command not found`);
    rl.prompt();
  }
});
