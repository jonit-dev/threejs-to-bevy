declare module "node:test" {
  export interface TestContext {
    name: string;
  }

  export default function test(name: string, fn: (context: TestContext) => void | Promise<void>): void;
}
