"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import Image from "next/image";
import { Menu, UserRound } from "lucide-react";

const NavBar = () => {
  const pathname = usePathname();
  // The menu is open for the page it was opened on, so navigating closes it without an effect
  const [menuOpenOnPath, setMenuOpenOnPath] = useState<string | null>(null);
  const isMenuOpen = menuOpenOnPath === pathname;
  const ref = useRef<HTMLDivElement | null>(null);
  const { user, loading: authLoading, signOut } = useAuth();

  const toggleMenu = () => {
    setMenuOpenOnPath(isMenuOpen ? null : pathname);
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMenuOpenOnPath(null);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleOutSideClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setMenuOpenOnPath(null);
      }
    };

    window.addEventListener("mousedown", handleOutSideClick);

    return () => {
      window.removeEventListener("mousedown", handleOutSideClick);
    };
  }, [ref]);

  const navLinkClass =
    "text-sm font-normal whitespace-nowrap text-foreground no-underline transition-colors hover:text-brand";

  return (
    <nav className="fixed top-5 left-1/2 z-[1000] flex w-auto -translate-x-1/2 flex-nowrap items-center gap-5 border border-white/8 bg-[rgba(17,20,19,0.72)] px-5 py-2.5 backdrop-blur-xl rounded-2xl md:gap-6">
      <Link href="/" className="flex shrink-0 items-center gap-2 no-underline">
        <Image src="/logo.png" alt="" width={24} height={24} className="size-6" />
        <span className="whitespace-nowrap text-[1.65rem] font-light leading-none tracking-tight text-brand">
          SimpliEarn
        </span>
      </Link>

      <div className="hidden shrink-0 items-center gap-5 md:flex md:gap-6">
        <Link href="/about" className={navLinkClass}>
          About Us
        </Link>
        <Link href="/faq" className={navLinkClass}>
          FAQs
        </Link>
        <Link href="mailto:simpliearnbdbi@gmail.com" className={navLinkClass}>
          Contact
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          onClick={toggleMenu}
          className="cursor-pointer border-none bg-transparent p-2 text-foreground hover:text-brand md:hidden"
          aria-label="Menu"
        >
          <Menu className="size-4" />
        </button>

        {!authLoading && (
          <div className="hidden flex-nowrap items-center gap-3 md:flex">
            {user ? (
              <>
                <Link href="/my-dashboard" className="btn-primary no-underline">
                  My Dashboard
                </Link>
                <Link
                  href="/settings"
                  className="p-1 text-brand transition-colors hover:text-foreground"
                  aria-label="Account settings"
                >
                  <UserRound className="size-4" />
                </Link>
              </>
            ) : (
              <Link href="/login" className="btn-primary no-underline">
                Login
              </Link>
            )}
          </div>
        )}
      </div>

      {isMenuOpen && (
        <div
          ref={ref}
          className="surface fixed top-20 right-4 left-4 z-[999] flex flex-col gap-4 rounded-2xl p-5 md:hidden"
        >
          <Link href="/about" className="font-normal text-foreground no-underline hover:text-brand">
            About Us
          </Link>
          <Link href="/faq" className="font-normal text-foreground no-underline hover:text-brand">
            FAQs
          </Link>
          <Link
            href="mailto:simpliearnbdbi@gmail.com"
            className="font-normal text-foreground no-underline hover:text-brand"
          >
            Contact
          </Link>
          {!authLoading &&
            (user ? (
              <>
                <Link href="/my-dashboard" className="btn-primary no-underline">
                  My Dashboard
                </Link>
                <Link href="/settings" className="font-normal text-foreground no-underline hover:text-brand">
                  Account
                </Link>
                <button
                  onClick={() => signOut()}
                  className="cursor-pointer border-none bg-transparent py-1 text-left font-normal text-foreground hover:text-brand"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link href="/login" className="btn-primary no-underline">
                Login
              </Link>
            ))}
        </div>
      )}
    </nav>
  );
};

export default NavBar;
