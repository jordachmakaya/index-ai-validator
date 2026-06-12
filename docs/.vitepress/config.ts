import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'index-ai',
    description: 'Experimental free CLI validator for index-ai Level 1 and Level 2a.',
    cleanUrls: true,
    appearance: 'dark',
    vite: {
      optimizeDeps: {
        include: ['mermaid'],
      },
    },
    themeConfig: {
      nav: [
        { text: 'Guide', link: '/guide/getting-started' },
        { text: 'CLI', link: '/guide/cli' },
      ],
      sidebar: [
        {
          text: 'Start here',
          items: [
            { text: 'Overview', link: '/' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'CLI', link: '/guide/cli' },
          ],
        },
        {
          text: 'Validator concepts',
          items: [
            { text: 'Level 1 Manifest', link: '/guide/level-1-manifest' },
            { text: 'content_chars', link: '/guide/content-chars' },
          ],
        },
      ],
    },
  }),
)
