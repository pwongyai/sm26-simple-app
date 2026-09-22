import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  // What a phone shows under the icon once the app is added to a home screen,
  // so it says what it is rather than what the project was called.
  title: "Smart Machine",
  description: "Farm machinery work orders and reports",
  appleWebApp: { capable: true, title: "Smart Machine", statusBarStyle: "black-translucent" },
};

// The dark tile behind the icon, and the colour Android paints the status bar
// when the app is opened from the home screen.
export const viewport = {
  themeColor: "#171717",
  // Let the page reach under the Dynamic Island and the home indicator, so
  // `env(safe-area-inset-*)` below has real numbers to work with. Without it
  // iOS letterboxes a standalone app between grey bars.
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
