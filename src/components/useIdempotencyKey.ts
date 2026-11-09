"use client";

import { useEffect, useState } from "react";

// randomUUID only exists on localhost/HTTPS, so fall back to getRandomValues, which works everywhere.
export function newKey(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A fresh key per attempt makes retries safe (the server posts each key at most once).
 * Generated after mount so server and client HTML match; refreshed whenever `dep` changes
 * (pass the form state so a new key is made after each submission).
 */
export function useIdempotencyKey(dep: unknown) {
  const [key, setKey] = useState("");
  useEffect(() => {
    setKey(newKey());
  }, [dep]);
  return key;
}
