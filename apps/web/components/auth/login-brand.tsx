"use client";

import Image from "next/image";
import { useState } from "react";

export function LoginBrand() {
  const [sealFailed, setSealFailed] = useState(false);

  return (
    <div className="flex items-center gap-3">
      {!sealFailed ? (
        <Image
          src="https://www.usant.edu.ph/images/usant_logo_new.png"
          alt="USANT seal"
          width={44}
          height={44}
          className="h-11 w-11 object-contain"
          onError={() => setSealFailed(true)}
          priority
        />
      ) : null}
      <div>
        <div className="text-xl font-semibold tracking-wide">
          University of Saint Anthony
        </div>
        <div className="text-sm font-medium text-primary-foreground/80">
          libraryhub
        </div>
      </div>
    </div>
  );
}