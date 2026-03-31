import path, { normalize } from "path";
import { createInterface } from "readline";
import fs, { existsSync, createWriteStream, readFileSync, writeFileSync } from "fs";
import { exec, spawn } from "child_process";

const myHistory: string[] = [];

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: tabCompleter,
  prompt: "$ ",
});

// ======================================== HELPERS ========================================

// ============= INITIALIZATIONS =============

type Job = {
  id: number;
  pid?: number;
  command: string;
  status: "Running" | "Done";
};

const jobs: Job[] = [];

let lastAppendedIndex = 0;

let lastPrefix = "";
let tabCount = 0;

// ============= INITIALIZATIONS =============

function envVariables() : {normalized: string[]} {
  const envVar = process.env.PATH || "";
  const normalized = path.delimiter === ";" ? envVar.split(";") : envVar.split(":");

  return { normalized };
}

function printBackgroundJobs(jobds: Job[]) {
  const statusSpacePadding = 24;
  const totalJobs = jobs.length;
  const plusMarker = totalJobs === 1 ? "+" : "";

  jobs.forEach(job => {
    const remainingSpaces = statusSpacePadding - job.status.length;
    if(job.status === "Running") {
      console.log(`[${job.id}]${plusMarker}  ${job.status}${" ".repeat(remainingSpaces)}${job.command}`);
    }
  })
}

function formatEntries(dir: string, items: string[]) {
  return items.map(item => {
    const full = path.join(dir, item);
    try {
      return fs.statSync(full).isDirectory() ? item + "/" : item;
    } catch {
      return item;
    }
  });
}

function longestCommonPrefix(arr: string[]) {
  return arr.reduce((prefix, cmd) => {
    let i = 0;
    while (
      i < prefix.length &&
      i < cmd.length &&
      prefix[i] === cmd[i]
    ) i++;
    return prefix.slice(0, i);
  });
}

function updateTabState(prefix: string) {
  if (prefix === lastPrefix) tabCount++;
  else {
    tabCount = 1;
    lastPrefix = prefix;
  }
}

function tabCompleter(line: string) {
  const builtins = ["echo", "exit", "history"];
  const { normalized } = envVariables();

  const parts = line.split(" ");
  const last = parts[parts.length - 1];

  function handleMultiple(matches: string[]) {
    if (tabCount === 1) {
      process.stdout.write("\x07");
      return [[], line];
    }

    console.log("\n" + matches.join("  "));
    process.stdout.write(`$ ${line}`);

    tabCount = 0;
    return [[], line];
  }

  // ================= FILE / FOLDER COMPLETION =================

  if (parts.length > 1) {
    const argPrefix = last;

    let dir = ".";
    let prefix = argPrefix;

    if (argPrefix.includes("/")) {
      if (argPrefix.endsWith("/")) {
        dir = argPrefix;
        prefix = "";
      } else {
        dir = path.dirname(argPrefix);
        prefix = path.basename(argPrefix);
      }
    }

    dir = dir || ".";

    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      const matches = files.filter(f => f.startsWith(prefix)).sort();
      const formatted = formatEntries(dir, matches);

      updateTabState(argPrefix);

      // No matches
      if (matches.length === 0) {
        process.stdout.write("\x07");
        return [[], line];
      }

      // Single match
      if (matches.length === 1) {
        tabCount = 0;

        const fullPath = path.join(dir, matches[0]);
        const isDir = fs.statSync(fullPath).isDirectory();

        const newLine =
          line.slice(0, line.length - argPrefix.length) +
          fullPath +
          (isDir ? "/" : " ");

        return [[newLine], line];
      }

      // LCP
      const lcp = longestCommonPrefix(matches);

      if (lcp.length > prefix.length) {
        tabCount = 0;

        const newLine =
          line.slice(0, line.length - argPrefix.length) +
          path.join(dir, lcp);

        return [[newLine], line];
      }

      // Multiple matches
      return handleMultiple(formatted);
    }
  }

  // ================= COMMAND COMPLETION =================

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

  updateTabState(last);

  // No matches
  if (hits.length === 0) {
    process.stdout.write("\x07");
    return [[], line];
  }

  // Single match
  if (hits.length === 1) {
    tabCount = 0;

    const newLine =
      line.slice(0, line.length - last.length) +
      hits[0] +
      " ";

    return [[newLine], line];
  }

  // LCP
  const lcp = longestCommonPrefix(hits);

  if (lcp.length > last.length) {
    tabCount = 0;

    const newLine =
      line.slice(0, line.length - last.length) +
      lcp;

    return [[newLine], line];
  }

  // Multiple matches
  return handleMultiple(hits);
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

const histFile = process.env.HISTFILE;

if(histFile && existsSync(histFile)) {
  const fileContents = readFileSync(histFile, "utf-8");
  const lines = fileContents.split("\n").filter(line => line.trim() !== "");
  myHistory.push(...lines);

  lastAppendedIndex = myHistory.length;
}

rl.prompt();

rl.on("line", (command) => {
  myHistory.push(command);
  if (command === "exit") {
    if (histFile) {
      writeFileSync(histFile, myHistory.join("\n") + "\n", "utf-8");
    }
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
      commandName === "pwd"  ||
      commandName === "history" ||
      commandName === "jobs"
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
  } else if (command === "history") {
    const ordered = [...myHistory];

    ordered.forEach((cmd, index) => {
      console.log(`    ${index + 1}  ${cmd}`);
    });

    rl.prompt();
    return;

  } else if (command.startsWith("history ")) {
    const parts = command.split(" ");
    
    if(parts[1] === "-r") {
      const filePath = parts[2];
      const fileContents = readFileSync(filePath, "utf-8");
      const lines = fileContents.split("\n").filter(line => line.trim() !== "");
      myHistory.push(...lines);

    } else if (parts[1] === "-w") {
      const filePath = parts[2];
        writeFileSync(filePath, myHistory.join("\n") + "\n", "utf-8");
        
        lastAppendedIndex = myHistory.length;
    } else if (parts[1] === "-a") {
      const newCommands = myHistory.slice(lastAppendedIndex);

      if(newCommands.length > 0) {
        const filePath = parts[2];
        writeFileSync(filePath, newCommands.join("\n") + "\n", {flag: "a", encoding: "utf-8"});

        // update pointer to last appended command
        lastAppendedIndex = myHistory.length;
      }
    } else {
      const num = parseInt(parts[1], 10);

      if (isNaN(num) || num <= 0) {
        console.log("history: argument must be a positive integer");
        rl.prompt();
        return;
      }

      // preserve numbering while slicing last N commands
      const originalLength = myHistory.length;
      const ordered = [...myHistory].reverse().slice(0, num).reverse();

      ordered.forEach((cmd, index) => {
        console.log(`    ${originalLength - num + 1 + index}  ${cmd}`);
      });
    }

    rl.prompt();
    return;

  } else {
    let args = parseArgs(command);

    const {args: newArgs, stdoutFile, stderrFile, stdoutAppend, stderrAppend} = handleRedirection(args);
    args = newArgs;
     
    const programName = args[0];

    if (programName === "jobs") {
      printBackgroundJobs(jobs);
      rl.prompt();
      return;
    }

    const lastArg = args[args.length - 1];
    const programArgs = args.slice(1);

    if (lastArg === "&") {
      programArgs.pop();
      const child = spawn(programName, programArgs, {
        stdio: "inherit",
      })
      
      jobs.push({
        id: jobs.length + 1,
        pid: child.pid,
        command: command,
        status: "Running"
      })

      console.log(`[1] ${child.pid}`);

      rl.prompt();
      return;
    }

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
        console.log(`${command}: command not found`);
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