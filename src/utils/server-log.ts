type LogContext = Record<string, string | number | boolean | null | undefined>;

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    };
  }

  return { message: String(error) };
}

export function logServerError(event: string, error: unknown, context: LogContext = {}) {
  console.error(
    JSON.stringify({
      context,
      error: normalizeError(error),
      event,
      level: "error",
      timestamp: new Date().toISOString(),
    }),
  );
}
