import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter_Tight } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

// A tight neo-grotesque in the Helvetica tradition, for the look of Hedi Slimane-era fashion campaigns.
const sans = Inter_Tight({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Vitrine", template: "%s · Vitrine" },
  description: "Personal wardrobe and resale profit tracker.",
  applicationName: "Vitrine",
  appleWebApp: { capable: true, title: "Vitrine", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`dark ${sans.variable} ${geistMono.variable}`}>
      <head>
        {/* Runs before first paint, so a saved light theme never flashes dark. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("vitrine.theme")==="light")document.documentElement.classList.remove("dark")}catch(e){}` }} />
      </head>
      <body className="antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
