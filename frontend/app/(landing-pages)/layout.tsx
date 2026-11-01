import NavBar from "../../components/Navbar";
import PointCloud from "@/components/PointCloud";

export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <PointCloud />
      <NavBar />
      {children}
    </>
  );
}
