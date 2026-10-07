import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Footer from "../components/Footer";
import ScrollToTop from "../components/ScrollToTop";
import { AuthProvider } from "@/lib/auth/AuthContext";

const urbanist = Urbanist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-urbanist",
});

export const metadata: Metadata = {
  title: "SimpliEarn",
  description: "Investing made simple",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${urbanist.variable} ${urbanist.className} antialiased`}>
        <AuthProvider>
          <div className="relative z-10">
            {children}
            <Footer />
            <ScrollToTop />
          </div>
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}
