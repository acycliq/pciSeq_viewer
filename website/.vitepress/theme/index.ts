// Default VitePress theme plus our own colours and fonts, the work-in-progress
// banner in the layout-top slot, and the components the pages use.
import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import AnnouncementBar from './AnnouncementBar.vue'
import NotFound from './NotFound.vue'
import DemoSwap from './DemoSwap.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-top': () => h(AnnouncementBar),
      'not-found': () => h(NotFound),
    })
  },
  enhanceApp({ app }) {
    app.component('DemoSwap', DemoSwap)
  },
}
