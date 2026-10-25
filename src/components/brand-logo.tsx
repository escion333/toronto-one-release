import { appPath } from "@/lib/app-path";
import Image from "next/image";

/** Final outlined wordmark, shared by the mobile header and desktop sidebar. */
export function BrandLogo() {
  return (
    <Image
      className="brand-logo"
      src={appPath("/brand/toronto-one-wordmark.svg")}
      alt="Toronto One"
      width={555.702}
      height={197.96}
      loading="eager"
      unoptimized
    />
  );
}
