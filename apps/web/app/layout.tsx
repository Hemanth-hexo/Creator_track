import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Creator Outreach",
  description: "Internal outreach CRM for discovering and pitching paid creative work — not limited to photography",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <Nav />
          <main className="flex-1 p-8 max-w-6xl">{children}</main>
        </div>
      </body>
    </html>
  );
}
