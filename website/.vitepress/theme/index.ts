// Default VitePress theme plus our own colours and fonts, and our own
// page-not-found.
import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import NotFound from './NotFound.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'not-found': () => h(NotFound),
    })
  },
}
