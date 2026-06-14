import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const GITHUB_URL = 'https://github.com/jordachmakaya/index-ai-validator'

const config = withMermaid(
  defineConfig({
    base: '/index-ai-validator/',
    title: 'index-ai-validator',
    description:
      'Free CLI that checks whether your site is readable by AI agents: index-ai manifest, Agent Index, clean endpoints, and content_chars.',
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
        { text: 'Scope', link: '/guide/scope' },
        { text: 'About', link: '/about' },
      ],
      socialLinks: [
        { icon: 'github', link: GITHUB_URL },
      ],
      sidebar: [
        {
          text: 'Get a result',
          items: [
            { text: 'Overview', link: '/' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'CLI', link: '/guide/cli' },
          ],
        },
        {
          text: 'Read your report',
          items: [
            { text: 'Fix Your Report', link: '/guide/fix-your-report' },
            { text: 'Conformance vs Passed', link: '/guide/conformance-vs-passed' },
            { text: 'JSON Output', link: '/guide/json-output' },
            { text: 'CI', link: '/guide/ci' },
          ],
        },
        {
          text: 'What each check means',
          items: [
            { text: 'Level 1 Manifest', link: '/guide/level-1-manifest' },
            { text: 'Level 2a Agent Index', link: '/guide/level-2a-shadow-index' },
            { text: 'content_chars', link: '/guide/content-chars' },
            { text: 'Security', link: '/guide/security' },
            { text: 'Discovery', link: '/guide/discovery' },
          ],
        },
        {
          text: 'Scope & honesty',
          items: [
            { text: 'Scope', link: '/guide/scope' },
            { text: 'About', link: '/about' },
          ],
        },
      ],
    },
  }),
)

export default config
