import path from "path";
import { createInterface } from "readline";
import fs, { existsSync, createWriteStream } from "fs";
import { spawn } from "child_process";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: tabCompleter,
  prompt: "$ ",
});

// ======================================== HELPERS ========================================

function envVariables() : {normalized: string[]} {
  const envVar = process.env.PATH || "";
  const normalized = path.delimiter === ";" ? envVar.split(";") : envVar.split(":");

  return { normalized };
}

let lastPrefix = "";
let tabCount = 0;

function tabCompleter(line: string) {
  const builtins = ["echo", "exit"];
  const { normalized } = envVariables();

  const parts = line.split(" ");
  const last = parts[parts.length - 1];

  const commands = new Set<string>(builtins);

  for (const dir of normalized) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          try {
            fs.accessSync(path.join(dir, file), fs.constants.X_OK);
            commands.add(file);
          } catch {}
        }
      }
    } catch {}
  }

  const hits = Array.from(commands)
    .filter(cmd => cmd.startsWith(last))
    .sort();

  // Track TAB presses
  if (last === lastPrefix) {
    tabCount++;
  } else {
    tabCount = 1;
    lastPrefix = last;
  }

  // ❌ No matches → bell
  if (hits.length === 0) {
    process.stdout.write("\x07");
    return [[], line];
  }

  // ✅ Single match → complete with space
  if (hits.length === 1) {
    tabCount = 0;
    const newLine =
      line.slice(0, line.length - last.length) + hits[0] + " ";
    return [[newLine], line];
  }

  // Compute LCP
  const commonPrefix = hits.reduce((prefix, cmd) => {
    let i = 0;
    while (
      i < prefix.length &&
      i < cmd.length &&
      prefix[i] === cmd[i]
    ) {
      i++;
    }
    return prefix.slice(0, i);
  });

  // If LCP extends input → autocomplete
  if (commonPrefix.length > last.length) {
    tabCount = 0;
    const newLine =
      line.slice(0, line.length - last.length) + commonPrefix;
    return [[newLine], line];
  }

  // No LCP progress → handle TAB behavior

  // First TAB → bell
  if (tabCount === 1) {
    process.stdout.write("\x07");
    return [[], line];
  }

  // Second TAB → show matches
  console.log("\n" + hits.join("  "));
  process.stdout.write(`$ ${line}`);

  tabCount = 0;

  return [[], line];
}

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
  let stdoutFile: string | null = null;
  let stderrFile: string | null = null;
  let stdoutAppend = false;
  let stderrAppend = false;

  const index = args.findIndex(
    (a) => a === ">" || a === "1>" || a === "2>" || a === ">>" || a === "1>>" || a === "2>>"
  );

  if (index !== -1) {
    const op = args[index];
    const file = args[index + 1];

    if(op === ">" || op === "1>") {
      stdoutFile = file;
      stdoutAppend = false;
    } else if (op === ">>" || op === "1>>") {
      stdoutFile = file;
      stdoutAppend = true;
    } else if(op === "2>") {
      stderrFile = file;
      stdoutAppend = false;
    } else if (op === "2>>") {
      stderrFile = file;
      stderrAppend = true;
    }

    args = args.slice(0, index);
  }

  return { args, stdoutFile, stderrFile, stdoutAppend, stderrAppend };
}

// ======================================== HELPERS ========================================

rl.prompt();

rl.on("line", (command) => {
  if (command === "exit") {
    rl.close();
    return;
  } else if (command.startsWith("echo ")) {
    let args = parseArgs(command);

    const {args: newArgs, stdoutFile, stderrFile, stdoutAppend, stderrAppend} = handleRedirection(args);
    args = newArgs;
    const outputFile = stdoutFile;
    const errorFile = stderrFile;

    const output = args.slice(1).join(" ");

    if (errorFile) {
      const flags = stderrAppend ? "a" : "w";
      fs.closeSync(fs.openSync(errorFile, flags));
    }
    
    if (outputFile) {
      const flags = stdoutAppend ? "a" : "w";
      const stream = fs.createWriteStream(outputFile, { flags });
      stream.write(output + "\n");
      stream.end();
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
      const {normalized} = envVariables();
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

    const {args: newArgs, stdoutFile, stderrFile, stdoutAppend, stderrAppend} = handleRedirection(args);
    args = newArgs;
     
    const programName = args[0];
    const programArgs = args.slice(1);

    try {
      const child = spawn(programName, programArgs, {
        stdio: [
          "inherit",
          stdoutFile ? "pipe" : "inherit",
          stderrFile ? "pipe" : "inherit"
        ],
      });

      if(stdoutFile) {
        const out = createWriteStream(stdoutFile, {flags: stdoutAppend ? "a" : "w"});
        child.stdout?.pipe(out);
      }

      if(stderrFile) {
        const err = createWriteStream(stderrFile, {flags: stderrAppend ? "a" : "w"});
        child.stderr?.pipe(err);
      }

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