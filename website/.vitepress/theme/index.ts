// Default VitePress theme plus our own colours, fonts and the work-in-progress
// banner injected into the layout-top slot.
import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import AnnouncementBar from './AnnouncementBar.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-top': () => h(AnnouncementBar),
    })
  },
}
