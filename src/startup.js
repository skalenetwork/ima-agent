const { spawn } = require('child_process');

function startProcess(command) {
    // Start the process in a new process group
    const parts = command.split(' ');
    return spawn(parts[0], parts.slice(1), { stdio: 'inherit', shell: true, detached: true });
}

if (process.argv.length !== 4) {
    console.error('Usage: node startup.js "<command1>" "<command2>"');
    process.exit(1);
}

const child1 = startProcess(process.argv[2]);
const child2 = startProcess(process.argv[3]);

function terminateProcessGroup(processToKill) {
    if (processToKill && !processToKill.killed) {
        // Use negative PID to kill the process group
        process.kill(-processToKill.pid, 'SIGTERM');
    }
}

function onChildExit(otherChild, code, signal) {
    terminateProcessGroup(otherChild);
    // Exit with the code or signal of the process that ended first
    process.exit(code || signal);
}

child1.on('exit', (code, signal) => onChildExit(child2, code, signal));
child2.on('exit', (code, signal) => onChildExit(child1, code, signal));

process.on('SIGINT', () => {
    console.log('Received SIGINT. Exiting...');

    terminateProcessGroup(child1);
    terminateProcessGroup(child2);

    process.exit(130);
});
