import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tor-mcp — Route requests through the Tor network as an MCP skill",
  description:
    "Give any MCP-compatible agent anonymous HTTP fetching over Tor. Rotating exit IPs, .onion support, no request logging. Won't beat Cloudflare — use browser-mcp for those.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
