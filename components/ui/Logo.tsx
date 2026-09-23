import Image from "next/image";
import type { Logo as LogoT } from "@/types";

interface Props {
  logo: LogoT;
  alt: string;
  size?: number;
  className?: string;
  priority?: boolean;
}

/**
 * Logo avec variantes claire (/500/) et sombre (/500-dark/) basculées en CSS :
 * aucun flash au changement de thème, aucune requête JavaScript.
 */
export function Logo({ logo, alt, size = 32, className = "", priority }: Props) {
  if (!logo.light) {
    return (
      <span
        aria-hidden={alt === ""}
        className={`inline-grid place-items-center rounded-full bg-line text-[10px] font-bold text-muted ${className}`}
        style={{ width: size, height: size }}
      >
        {alt.slice(0, 3).toUpperCase()}
      </span>
    );
  }
  const common = {
    width: size,
    height: size,
    sizes: `${size}px`,
    priority,
    unoptimized: logo.light.endsWith(".svg"),
  } as const;
  if (logo.light === logo.dark) {
    return <Image src={logo.light} alt={alt} {...common} className={`object-contain ${className}`} />;
  }
  return (
    <>
      <Image src={logo.light} alt={alt} {...common} className={`object-contain dark:hidden ${className}`} />
      <Image src={logo.dark} alt={alt} {...common} className={`hidden object-contain dark:block ${className}`} />
    </>
  );
}
