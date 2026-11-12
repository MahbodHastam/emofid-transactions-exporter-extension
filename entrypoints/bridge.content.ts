import { installBridge } from '../src/data/bridge';

export default defineContentScript({
  matches: ['https://my.emofid.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main: installBridge,
});
