import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id"),
  title: {
    default: "Hadona Workspace — Agency Operating System",
    template: "%s | Hadona Workspace",
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  description:
    "Platform internal all-in-one untuk Hadona Digital Media. Task manager, ads spend tracker, weekly & monthly report, creative pipeline, dan kolaborasi tim.",
  keywords: [
    "Hadona",
    "Digital Media",
    "Workspace",
    "Agency OS",
    "Task Manager",
    "Ads Tracker",
    "Weekly Report",
  ],
  authors: [{ name: "Hadona Digital Media" }],
  creator: "Hadona Digital Media",
  publisher: "Hadona Digital Media",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id",
    siteName: "Hadona Workspace",
    title: "Hadona Workspace — Agency Operating System",
    description:
      "Platform internal all-in-one untuk Hadona Digital Media. Task manager, ads spend tracker, weekly & monthly report, dan lebih.",
    images: [
      {
        url: "/logo/logo-hadona.png",
        width: 1200,
        height: 630,
        alt: "Hadona Digital Media",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hadona Workspace — Agency Operating System",
    description:
      "Platform internal all-in-one untuk Hadona Digital Media. Task manager, ads spend tracker, weekly & monthly report.",
    images: ["/logo/logo-hadona.png"],
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
        <Toaster
          position="top-right"
          theme="light"
          toastOptions={{
            style: {
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              color: "#18181B",
            },
          }}
        />
      </body>
    </html>
  );
}