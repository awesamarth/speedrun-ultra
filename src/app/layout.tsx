import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto_Condensed } from "next/font/google";
import { SiteHeader } from "./_components/site-header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const condensed = Roboto_Condensed({ variable: "--font-condensed", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "speedrun-ultra — can you actually apply from where you are?",
  description:
    "Country eligibility, visa sponsorship and experience requirements extracted from every engineering and product job description on the a16z speedrun talent board, with quotes. Web, JSON API and MCP.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${condensed.variable} h-full antialiased`}>
      <body className="min-h-full">
        <a className="skip-link" href="#main">Skip to content</a>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <p>Data: speedrun-talent-network.com public API (read-only, attributed as source=speedrun-ultra). Listings link to their canonical pages; nothing is re-hosted.
            No accounts, no tracking; your profile lives in the URL only. Built by <a href="https://github.com/awesamarth">Samarth Saxena</a>.
          </p>
          <p className="affiliation">Independent project, not affiliated with a16z or speedrun.</p>
        </footer>
      </body>
    </html>
  );
}
