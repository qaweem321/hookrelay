import { isValidObjectId, Types } from "mongoose";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what);

// Route params that aren't valid ObjectIds are treated as "not found", not as server errors.
export function objectId(value: unknown, what = "Not found"): Types.ObjectId {
  if (typeof value !== "string" || !isValidObjectId(value) || !/^[0-9a-f]{24}$/i.test(value))
    throw notFound(what);
  return new Types.ObjectId(value);
}

export function optionalObjectId(value: unknown): Types.ObjectId | undefined {
  return typeof value === "string" && /^[0-9a-f]{24}$/i.test(value) ? new Types.ObjectId(value) : undefined;
}
