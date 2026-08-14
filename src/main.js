import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { initAutoUpdate } from './lib/updater.js'
import { initSync } from './lib/sheets.js'

createApp(App).mount('#app')

initAutoUpdate()
// tylko wysyłanie do arkusza; pobieranie wyłącznie z przycisku
initSync()
