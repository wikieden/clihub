import { mount } from 'svelte';
import App from './App.svelte';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app mount point missing');

export default mount(App, { target });
