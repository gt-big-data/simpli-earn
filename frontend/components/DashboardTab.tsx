import Link from "next/link";

export default function DashboardTab() {
  return (
    <div className="z-100 pt-4">
      <Link href="/" className="btn-outline no-underline">
        Return to Library
      </Link>
    </div>
  );
}
