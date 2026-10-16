import type { TestProject } from "vitest/node";

// One MongoDB for the whole run; each test file uses its own database. Set TEST_MONGO_URL to use
// an existing server (CI does) instead of downloading one.
export default async function setup(project: TestProject) {
  if (process.env.TEST_MONGO_URL) {
    project.provide("mongoUrl", process.env.TEST_MONGO_URL);
    return;
  }
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const server = await MongoMemoryServer.create();
  project.provide("mongoUrl", server.getUri());
  return async () => {
    await server.stop();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    mongoUrl: string;
  }
}
