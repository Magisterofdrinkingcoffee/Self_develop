import "./globals.css";
import { GeistSans } from "geist/font/sans";
import RegisterSW from "@/components/RegisterSW";

export const metadata = {
  title: "Life Tracker",
  description: "Studies, schedule, minimums, reading, sport, food and money in one place.",
  applicationName: "Life Tracker",
  appleWebApp: { capable: true, title: "Life", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/favicon-64.png", sizes: "64x64" }, { url: "/icons/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EEF1F5" },
    { media: "(prefers-color-scheme: dark)", color: "#121722" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
