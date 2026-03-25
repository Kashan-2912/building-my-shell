import path from "path";
import { createInterface } from "readline";
import fs, { existsSync } from "fs";
import { spawn } from "child_process";

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
      commandName === "exit" ||
      commandName === "pwd"
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
          if (fs.existsSync(commandPath)) {
            fs.accessSync(commandPath, fs.constants.X_OK);
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
  } else if (command === "pwd") {
    console.log(process.cwd());
    rl.prompt();
    return;
  } else if (command.startsWith("cd ")) {
    const dir = command.slice(3);
    //  handling both absolute and relative paths...
    const targetDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    try {
      if(existsSync(targetDir)) {
        process.chdir(targetDir);
        rl.prompt();
      } else {
        console.log(`cd: ${dir}: No such file or directory`);
        rl.prompt();
      }
    } catch (error) {
      // Ignore errors
    }
  } else {
    const args = command.split(" ");
    const programName = args[0];
    const programArgs = args.slice(1);
    try {
      const child = spawn(programName, programArgs, { stdio: "inherit" });
      child.on("error", () => {
        console.log(`${command}: not found`);
        rl.prompt();
      });
      child.on("close", () => {
        rl.prompt();
      });
    } catch (error) {
      // Ignore errors
    }
  }
});
