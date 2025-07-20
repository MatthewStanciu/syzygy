import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const romanaBt = localFont({
  src: [
    {
      path: "../fonts/romanabt_roman.otf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-romanabt",
});
export const metadata: Metadata = {
  title: "syzygy",
  description: "🔑",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${romanaBt.className} antialiased`}>{children}</body>
    </html>
  );
}
