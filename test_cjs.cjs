const electron = require('electron');
console.log('Type:', typeof electron);
if (typeof electron === 'object') {
    console.log('App type:', typeof electron.app);
} else {
    console.log('Value:', electron);
}
