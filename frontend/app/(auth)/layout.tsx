import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center bg-[url(/bg.svg)] bg-cover px-4 pt-20 pb-12">
      <Link href="/" className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
        <Image src="/logo.png" alt="SimpliEarn" width={28} height={28} />
        <span className="text-xl font-medium text-white">SimpliEarn</span>
      </Link>
      <div className="w-full max-w-md flex-1 flex flex-col justify-center">{children}</div>
    </div>
  );
}
