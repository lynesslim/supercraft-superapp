import { NextResponse } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

const buckets = new Map<string, Bucket>();

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

export function rateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      {
        headers: { "Retry-After": String(retryAfter) },
        status: 429,
      },
    );
  }

  bucket.count += 1;
  return null;
}

export function rateLimitByRequest(
  request: Request,
  scope: string,
  options: Omit<RateLimitOptions, "key">,
) {
  return rateLimit({
    ...options,
    key: `${scope}:${getRequestIp(request)}`,
  });
}
