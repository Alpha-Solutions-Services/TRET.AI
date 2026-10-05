import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { readAppVersion } from "@/lib/version";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const version = readAppVersion();

export const metadata: Metadata = {
  title: "TRET.AI",
  description: "Accounting and reporting for Legacy Inc Global freight operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <ToastProvider>
          <div data-app-version={version}>{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
