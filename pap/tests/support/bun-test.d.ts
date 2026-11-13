// Minimal typing for the test-only preloaded probe. The repository otherwise
// targets `node:test`; the probe needs Bun's module mock in a child process.
declare module "bun:test" {
  export const mock: {
    module(specifier: string, factory: () => unknown): void;
  };
}
