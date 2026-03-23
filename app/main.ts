import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

// TODO: Uncomment the code below to pass the first stage
rl.prompt();

rl.on('line', (command) => {
  if (command === 'exit') {
    rl.close();
    return;
  } else if (command.startsWith('echo ')) {
    console.log(command.slice(5));
    rl.prompt();
    return;
  } else {
    console.log(`${command}: command not found`)
    rl.prompt();
  }
})