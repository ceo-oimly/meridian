"use client";

import { useEffect } from "react";

/** Loads the Crisp live-chat widget when NEXT_PUBLIC_CRISP_WEBSITE_ID is set. Renders nothing otherwise. */
export default function ChatWidget() {
  const id = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
  useEffect(() => {
    if (!id) return;
    const w = window as unknown as { $crisp?: unknown[]; CRISP_WEBSITE_ID?: string };
    if (w.CRISP_WEBSITE_ID) return;
    w.$crisp = [];
    w.CRISP_WEBSITE_ID = id;
    const s = document.createElement("script");
    s.src = "https://client.crisp.chat/l.js";
    s.async = true;
    document.head.appendChild(s);
  }, [id]);
  return null;
}
