import { appPath } from "@/lib/app-path";
import Image from "next/image";

/** Approved Wide lens artwork; adjacent brand text supplies its accessible name. */
export function BrandLogo() {
  return (
    <Image
      className="brand-logo"
      src={appPath("/brand/toronto-one-wide-lens.svg")}
      alt=""
      width={320}
      height={320}
      loading="eager"
      unoptimized
    />
  );
}
