import electron from 'electron';
console.log('Default import type:', typeof electron);
if (typeof electron === 'object') {
    console.log('Keys:', Object.keys(electron).slice(0, 10));
    console.log('App type:', typeof electron.app);
} else {
    console.log('Value:', electron);
}
