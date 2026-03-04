import { createRequire } from 'module';
const require = createRequire(import.meta.url);
try {
    const electron = require('electron');
    console.log('Electron type:', typeof electron);
    if (typeof electron === 'object') {
        console.log('App type:', typeof electron.app);
    } else {
        console.log('Electron value:', electron);
    }
} catch (e) {
    console.error('Require failed:', e.message);
}
