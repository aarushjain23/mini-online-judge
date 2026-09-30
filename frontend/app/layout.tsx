import type { Metadata } from "next";
import Nav from "./Nav";
import "./globals.css";

export const metadata: Metadata = { title: "Mini Judge", description: "A tiny online judge" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
