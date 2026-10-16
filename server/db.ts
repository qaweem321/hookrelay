import mongoose from "mongoose";
import { models } from "./models";

export async function connectDb(url: string) {
  // autoIndex is off: indexes are built once, explicitly, instead of on every model's first use.
  mongoose.set("autoIndex", false);
  mongoose.set("strictQuery", true);
  await mongoose.connect(url, { serverSelectionTimeoutMS: 10_000 });
  await Promise.all(models.map((model) => model.createIndexes()));
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
