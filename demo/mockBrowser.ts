export const browser = {
  storage: { local: { get: async () => ({}), set: async () => {} } },
  runtime: { getManifest: () => ({ version: 'demo' }) },
};
