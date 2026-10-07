import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SetupIncomplete } from "@/components/setup-incomplete";
import { ConfirmProvider } from "@/components/ui/confirm";
import { ToastProvider } from "@/components/ui/toast";
import {
  getMissingRequiredEnvNames,
  logMissingRequiredEnvNames,
} from "@/lib/env";
import { readAppVersion } from "@/lib/version";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const version = readAppVersion();

function ThemeBoot() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          '(function(){try{var t=localStorage.getItem("tret.theme");var ok={glass:1,mono:1,ocean:1,mint:1,sand:1,rose:1,graphite:1,midnight:1,aurora:1,carbon:1};if(t&&ok[t])document.documentElement.setAttribute("data-theme",t);}catch(e){}})();',
      }}
    />
  );
}

export const metadata: Metadata = {
  title: "TRET.AI",
  description: "Accounting and reporting for Legacy Inc Global freight operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const missing = getMissingRequiredEnvNames();
  if (missing.length > 0) {
    logMissingRequiredEnvNames(missing);
    return (
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.variable} antialiased`}>
          <ThemeBoot />
          <div data-app-version={version}>
            <SetupIncomplete />
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <ThemeBoot />
        <ToastProvider>
          <ConfirmProvider>
            <div data-app-version={version}>{children}</div>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
