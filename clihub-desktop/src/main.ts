import { mount } from 'svelte';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Main from './Main.svelte';
import Popover from './Popover.svelte';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app mount point missing');

// One SPA, two windows: the "main" window renders the full sidebar app; the
// borderless "popover" window (tray-toggled) renders the compact tab panel.
const label = getCurrentWindow().label;
const View = label === 'main' ? Main : Popover;

export default mount(View, { target });
