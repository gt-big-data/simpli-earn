import { Mail } from "lucide-react";
import PointCloud from "./PointCloud";

export default function Footer() {
  return (
    <footer className="relative w-full overflow-hidden border-t border-white/8 py-4 text-muted-foreground">
      <PointCloud variant="footer" />
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center justify-between px-4 md:flex-row">
        <p className="text-sm">&copy; {new Date().getFullYear()} SimpliEarn. All rights reserved.</p>
        <div className="mt-2 flex items-center space-x-4 md:mt-0">
          <a href="/about" className="text-sm text-brand no-underline transition-colors hover:text-foreground">
            About Us
          </a>
          <a href="/faq" className="text-sm text-brand no-underline transition-colors hover:text-foreground">
            FAQ&rsquo;s
          </a>
          <a
            href="mailto:simpliearnbdbi@gmail.com"
            className="text-sm text-brand no-underline transition-colors hover:text-foreground"
          >
            Contact Us
          </a>
          <a href="mailto:simpliearnbdbi@gmail.com" className="text-brand hover:text-foreground" aria-label="Email us">
            <Mail className="size-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}
