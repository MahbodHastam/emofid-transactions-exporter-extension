import { createApp, type App } from 'vue';
import ExportPanel from '../../src/ui/ExportPanel.vue';

const isTransactionsRoute = (pathname: string) => /^\/fund-transfer\/transactions\/?$/.test(pathname);

// @font-face inside a shadow root is ignored by Chrome, so the bundled Vazirmatn files
// are registered on the document. The family name is private to avoid touching the site.
function registerFont() {
  const faces: [path: '/fonts/vazirmatn-arabic.woff2' | '/fonts/vazirmatn-latin.woff2', unicodeRange: string][] = [
    ['/fonts/vazirmatn-arabic.woff2', 'U+0600-06FF,U+0750-077F,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC'],
    ['/fonts/vazirmatn-latin.woff2', 'U+0000-00FF,U+2000-206F,U+2212'],
  ];
  for (const [path, unicodeRange] of faces) {
    document.fonts.add(
      new FontFace('EmxVazirmatn', `url(${browser.runtime.getURL(path)}) format('woff2')`, {
        weight: '100 900',
        unicodeRange,
      }),
    );
  }
}

export default defineContentScript({
  matches: ['https://my.emofid.com/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi<App>(ctx, {
      name: 'emofid-transactions-exporter',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const app = createApp(ExportPanel);
        app.mount(container);
        return app;
      },
      onRemove: (app) => app?.unmount(),
    });

    let mounted = false;
    let fontReady = false;
    const sync = (pathname: string) => {
      const want = isTransactionsRoute(pathname);
      if (want === mounted) return;
      mounted = want;
      if (!want) return ui.remove();
      if (!fontReady) {
        fontReady = true;
        registerFont();
      }
      ui.mount();
    };
    // The event fires before the SPA commits the URL, so read the destination from it.
    ctx.addEventListener(window, 'wxt:locationchange', (event) => sync(event.newUrl.pathname));
    sync(location.pathname);
  },
});
