import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import PointCloud from "@/components/PointCloud";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center px-4 pt-20 pb-12">
      <PointCloud />
      <Link
        href="/"
        className="absolute top-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 no-underline"
      >
        <LogoMark className="size-7" />
        <span className="text-[1.65rem] font-light tracking-tight text-brand">SimpliEarn</span>
      </Link>
      <div className="relative z-10 flex w-full max-w-md flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}
