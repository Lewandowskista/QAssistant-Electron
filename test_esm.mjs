import pkg from 'electron';
const { app } = pkg;
console.log('App object:', typeof app);
if (app) {
  app.whenReady().then(() => {
    console.log('App ready');
    process.exit(0);
  });
} else {
  console.log('App is undefined in pkg:', pkg);
  process.exit(1);
}
