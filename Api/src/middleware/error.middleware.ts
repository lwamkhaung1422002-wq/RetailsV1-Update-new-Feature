import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof Error && error.name === "NotFoundError") {
    response.status(404).json({ message: error.message });
    return;
  }

  if (error instanceof Error && error.name === "BadRequestError") {
    response.status(400).json({ message: error.message });
    return;
  }

  if (error instanceof Error && error.name === "ForbiddenError") {
    response.status(403).json({ message: error.message });
    return;
  }
  if (error instanceof Error && error.name === "ConflictError") {
    response.status(409).json({ message: error.message });
    return;
  }

  if (error instanceof Error && error.name === "RateLimitError") {
    response.status(429).json({ message: error.message });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      message: "Validation error.",
      errors: error.flatten().fieldErrors,
    });
    return;
  }

  // Keep production responses generic, but record enough context in the server
  // logs to diagnose unexpected failures without logging request bodies or secrets.
  const unexpectedError = error instanceof Error ? error : new Error(String(error));
  console.error("Unhandled API error", {
    method: request.method,
    path: request.originalUrl,
    name: unexpectedError.name,
    message: unexpectedError.message,
    stack: unexpectedError.stack,
  });

  if (error instanceof Error && process.env.NODE_ENV !== "production") {
    response.status(500).json({ message: error.message });
    return;
  }

  response.status(500).json({ message: "Something went wrong." });
}
