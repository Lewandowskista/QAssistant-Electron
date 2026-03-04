import pkg from './test_workaround.cjs';
console.log('Type of pkg:', typeof pkg);
if (typeof pkg === 'object') {
    console.log('App type:', typeof pkg.app);
} else {
    console.log('Value of pkg:', pkg);
}
