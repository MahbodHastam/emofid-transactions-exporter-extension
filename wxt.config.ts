import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue', '@wxt-dev/auto-icons'],
  autoIcons: { baseIconPath: 'assets/icon.svg' },
  manifest: {
    name: 'Transactions Exporter for Emofid (unofficial)',
    description:
      'Export your own Emofid transactions to CSV or XLSX. Read-only, local-only. Not affiliated with Emofid.',
    permissions: ['storage'],
    web_accessible_resources: [{ resources: ['fonts/*.woff2'], matches: ['https://my.emofid.com/*'] }],
  },
});
