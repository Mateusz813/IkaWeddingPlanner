import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { initAutoUpdate } from './lib/updater.js'

createApp(App).mount('#app')

initAutoUpdate()
