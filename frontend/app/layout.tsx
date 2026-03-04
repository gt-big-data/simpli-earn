import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Footer from "../components/Footer";
import ScrollToTop from "../components/ScrollToTop";
import { AuthProvider } from "@/lib/auth/AuthContext";

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
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
      <body className={`${montserrat.variable} antialiased`}>
        <AuthProvider>
          {children}
          <Analytics />
          <Footer />
          <ScrollToTop />
        </AuthProvider>
      </body>
    </html>
  );
}