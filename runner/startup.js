const { spawn } = require( "child_process" );

function startProcess( command ) {
    // Start the process in a new process group
    const parts = command.split( " " );
    return spawn( parts[0], parts.slice( 1 ), { stdio: "inherit", shell: true, detached: true } );
}

if( process.argv.length !== 4 ) {
    console.error( "Usage: node startup.js \"<command1>\" \"<command2>\"" );
    process.exit( 1 );
}

const child1 = startProcess( process.argv[2] );
const child2 = startProcess( process.argv[3] );

function terminateProcessGroup( processToKill ) {
    if( processToKill && !processToKill.killed ) {
        // Use negative PID to kill the process group
        process.kill( -processToKill.pid, "SIGTERM" );
    }
}

function getShortExitedChildDescription( exitedChild ) {
    if( ! exitedChild )
        return "N/A";
    const arrParts = exitedChild.split( " " );
    if( arrParts.length <= 1 )
        return exitedChild;
    for( let i = 0; i < arrParts.length; ++ i ) {
        const part = arrParts[ i ];
        if( part.indexOf( ".js" ) >= 0 )
            return part;
    }
    let s = arrParts[ 0 ];
    if( arrParts.length >= 2 )
        s += " " + arrParts[ 1 ];
    return s;
}

function onChildExit( exitedIndex, exitedChild, otherChild, code, signal ) {
    console.log(
        "IMPORTANT NOTICE: IMA docker container will exit, exited child",
        exitedIndex, "is", getShortExitedChildDescription( exitedChild ),
        ", exit code is", code, "exit signal is", signal );
    terminateProcessGroup( otherChild );
    // Exit with the code or signal of the process that ended first
    process.exit( code || signal );
}

child1.on( "exit", function( code, signal ) { onChildExit( 1, process.argv[2], child2, code, signal ); } );
child2.on( "exit", function( code, signal ) { onChildExit( 2, process.argv[3], child1, code, signal ); } );

process.on( "SIGINT", () => {
    console.log( "Received SIGINT. Exiting..." );

    terminateProcessGroup( child1 );
    terminateProcessGroup( child2 );

    process.exit( 130 );
} );
