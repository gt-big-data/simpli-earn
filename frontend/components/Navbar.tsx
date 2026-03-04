"use client";

import React, { useState, useEffect, useRef } from 'react';
import Image from "next/image";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { FaUserCircle } from 'react-icons/fa';

const NavBar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement | null>(null);
  const { user, loading: authLoading, signOut } = useAuth();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleOutSideClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handleOutSideClick);

    return () => {
      window.removeEventListener("mousedown", handleOutSideClick);
    };
  }, [ref]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  const navLinkClass = "text-white hover:text-[#81D18D] transition-colors font-normal text-sm whitespace-nowrap no-underline";
  const greenBtnClass = "bg-[#81D18D] text-[#121612] font-semibold rounded-full px-4 py-2 text-sm whitespace-nowrap no-underline hover:brightness-110 transition-all inline-flex items-center justify-center";

  return (
    <nav
      className="font-montserrat fixed top-5 left-1/2 -translate-x-1/2 flex items-center flex-nowrap gap-5 md:gap-6 px-5 py-2.5 border border-white/20 bg-[#121612] rounded-full shadow-lg z-[1000] w-auto"
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 shrink-0 no-underline">
        <Image src="/logo.png" alt="SimpliEarn" width={22} height={22} />
        <span className="text-white font-medium text-base tracking-wide whitespace-nowrap">SimpliEarn</span>
      </Link>

      {/* Nav Links - hidden on mobile */}
      <div className="hidden md:flex items-center gap-5 md:gap-6 shrink-0">
        <Link href="/about" className={navLinkClass}>About Us</Link>
        <Link href="/faq" className={navLinkClass}>FAQs</Link>
        <Link href="mailto:simpliearnbdbi@gmail.com" className={navLinkClass}>Contact</Link>
      </div>

      {/* Auth + hamburger */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={toggleMenu}
          className="md:hidden p-2 border-none bg-transparent cursor-pointer text-white hover:text-[#81D18D]"
          aria-label="Menu"
        >
          <div className="space-y-1.5">
            <span className="block w-5 h-0.5 bg-current rounded" />
            <span className="block w-5 h-0.5 bg-current rounded" />
            <span className="block w-5 h-0.5 bg-current rounded" />
          </div>
        </button>

        {!authLoading && (
          <div className="hidden md:flex items-center gap-3 flex-nowrap">
            {user ? (
              <>
                <Link href="/my-dashboard" className={greenBtnClass}>
                  My Dashboard
                </Link>
                <Link
                  href="/settings"
                  className="text-[#81D18D] hover:brightness-125 transition-all p-1"
                  aria-label="Account settings"
                >
                  <FaUserCircle size={24} />
                </Link>
              </>
            ) : (
              <Link href="/login" className={greenBtnClass}>
                Login
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div
          ref={ref}
          className="md:hidden fixed top-20 left-4 right-4 flex flex-col gap-4 p-5 bg-[#0f110f]/99 border border-white/20 rounded-2xl z-[999]"
        >
          <Link href="/about" className="text-white hover:text-[#81D18D] no-underline font-normal">
            About Us
          </Link>
          <Link href="/faq" className="text-white hover:text-[#81D18D] no-underline font-normal">
            FAQs
          </Link>
          <Link href="mailto:simpliearnbdbi@gmail.com" className="text-white hover:text-[#81D18D] no-underline font-normal">
            Contact
          </Link>
          {!authLoading && (
            user ? (
              <>
                <Link href="/my-dashboard" className={greenBtnClass}>
                  My Dashboard
                </Link>
                <Link href="/settings" className="text-white hover:text-[#81D18D] no-underline font-normal">
                  Account
                </Link>
                <button
                  onClick={() => signOut()}
                  className="text-white hover:text-[#81D18D] text-left font-normal bg-transparent border-none cursor-pointer py-1"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link href="/login" className={greenBtnClass}>
                Login
              </Link>
            )
          )}
        </div>
      )}
    </nav>
  );
};

export default NavBar;
