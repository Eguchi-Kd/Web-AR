// main.js
import { startTitle } from './title-screen.js';

window.addEventListener('load', async () => {
  // Initialize title screen
  await startTitle();

  // Bind Start button to navigate to load screen (hook)
  document.getElementById('btnStart').addEventListener('click', () => {
    // Here we change to the loading screen. For now we just show an alert and log.
    console.log('Start pressed: transition to load screen (implement load-screen next).');
    // Replace with actual navigation, e.g. window.location = 'load.html';
    alert('Start pressed: next will be the load screen (not yet implemented in this package).');
  });
});
