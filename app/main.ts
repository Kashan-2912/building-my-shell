import path from "path";
import { createInterface } from "readline";
import fs, { existsSync, createWriteStream } from "fs";
import { spawn } from "child_process";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

// ======================================== HELPERS ========================================

function parseArgs(input: string): string[] {
  const res: string[] = [];
  let cur = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let ch = 0; ch < input.length; ch++) {
    if (input[ch] === "'") {
      if (inDoubleQuote) {
        cur += "'";
      } else {
        inSingleQuote = !inSingleQuote;
      }
    } else if (input[ch] === '"') {
      if(inSingleQuote) {
        cur += '"';
      } else {
        inDoubleQuote = !inDoubleQuote;
      }
    } else if (input[ch] === " " && !inSingleQuote && !inDoubleQuote) {
      if (cur) {
        res.push(cur);
        cur = "";
      }
    } else if (input[ch] === "\\" && input[ch + 1] === " " && !inSingleQuote && !inDoubleQuote) {
      cur += input[ch + 1];
      ch++;
    } else if (input[ch] === "\\" && input[ch + 1] !== " " && !inSingleQuote && !inDoubleQuote) {
      if (input[ch + 1] === "\\" || input[ch + 1] === "'" || input[ch + 1] === '"') {
        cur += input[ch + 1];
        ch++;
      }
    } else if (input[ch] === "\\" && input[ch + 1] !== " " && !inSingleQuote && inDoubleQuote) {
      if (input[ch + 1] === "\\" || input[ch + 1] === '"') {
        cur += input[ch + 1];
        ch++;
      }
    } else {
      cur += input[ch];
    }
  }

  if (cur) res.push(cur);
  return res;
}

function handleRedirection(args: string[]) {
  let outputFile: string | null = null;

  const redirectIndex = args.findIndex(
    (a) => a === ">" || a === "1>"
  );

  if (redirectIndex !== -1) {
    outputFile = args[redirectIndex + 1];
    args = args.slice(0, redirectIndex);
  }

  return { args, outputFile };
}

// ======================================== HELPERS ========================================

rl.prompt();

rl.on("line", (command) => {
  if (command === "exit") {
    rl.close();
    return;
  } else if (command.startsWith("echo ")) {
    let args = parseArgs(command);

    const result = handleRedirection(args);
    args = result.args;
    const outputFile = result.outputFile;

    const output = args.slice(1).join(" ");

    if(outputFile) {
      fs.writeFileSync(outputFile, output + "\n");
    } else {
      console.log(output);
    }

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

    if (dir === "~") {
      const homeDir = process.env.HOME;
      if (homeDir) {
        process.chdir(homeDir);
        rl.prompt();
      }
    } else {
      const targetDir = path.isAbsolute(dir)
        ? dir
        : path.join(process.cwd(), dir);
      try {
        if (existsSync(targetDir)) {
          process.chdir(targetDir);
          rl.prompt();
        } else {
          console.log(`cd: ${dir}: No such file or directory`);
          rl.prompt();
        }
      } catch (error) {
        // Ignore errors
      }
    }
  } else {
    let args = parseArgs(command);

    const result = handleRedirection(args);
    args = result.args;
    const outputFile = result.outputFile;
     
    const programName = args[0];
    const programArgs = args.slice(1);

    try {
      if(outputFile) {
        const out = fs.createWriteStream(outputFile, { flags: "w" });
        const child = spawn(programName, programArgs, { stdio: ["inherit", "pipe", "inherit"] });

        child.stdout.pipe(out);

        child.on("error", () => {
          console.log(`${programName}: not found`);
          rl.prompt();
        });

        child.on("close", () => {
          rl.prompt();
        });

      } else {
        const child = spawn(programName, programArgs, { stdio: "inherit" });
        child.on("error", () => {
          console.log(`${command}: not found`);
          rl.prompt();
        });
        child.on("close", () => {
          rl.prompt();
        });
      }
    } catch (error) {
      // Ignore errors
    }
  }
});
