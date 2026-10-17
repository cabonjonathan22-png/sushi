import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Fraunces, Inter } from "next/font/google";
import { getLocale } from "@/i18n/server";
import { RTL } from "@/i18n/languages";
import "./globals.css";

// Sous-ensembles élargis : accents d'Europe centrale, cyrillique, grec, vietnamien.
// Les autres écritures (arabe, chinois, japonais…) utilisent les polices du système.
const bebas = Bebas_Neue({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-bebas", display: "swap" });
// Titres du site public : serif chaleureuse (axe optique, graisses variables).
const fraunces = Fraunces({ subsets: ["latin", "latin-ext", "vietnamese"], variable: "--font-fraunces", display: "swap", axes: ["opsz", "SOFT"] });
const inter = Inter({ subsets: ["latin", "latin-ext", "cyrillic", "greek", "vietnamese"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: "Commande en ligne",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#1f1a17", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={RTL.has(locale) ? "rtl" : "ltr"} className={`${bebas.variable} ${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
