const electron = require('electron');
console.log('MAIN_PROCESS_TEST: electron type:', typeof electron);
console.log('MAIN_PROCESS_TEST: app exists:', !!electron.app);
if (electron.app) {
    console.log('MAIN_PROCESS_TEST: SUCCESS!');
} else {
    console.log('MAIN_PROCESS_TEST: FAILED! electron value:', electron);
}
process.exit(0);
