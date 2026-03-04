const e = require('electron');
console.log('E type:', typeof e);
console.log('E value:', e);
try {
    const e2 = require('module')._load('electron', null, true);
    console.log('E2 type:', typeof e2);
} catch(err) {
    console.log('E2 failed:', err.message);
}
