import Image from "next/image";

interface LogoProps {
  width: number;
  height: number;
  className?: string;
}

// Renders both logo variants and lets `dark:` utilities pick the right one —
// avoids a useTheme() flash-of-wrong-logo on first paint, matching the
// class-based dark mode strategy in theme-provider.tsx. The light logo's text
// isn't legible against a dark background, hence logo-dark.png.
export function Logo({ width, height, className }: LogoProps) {
  return (
    <>
      <Image
        src="/logo-light.png"
        unoptimized
        alt="Pagevo"
        loading="eager"
        priority
        width={width}
        height={height}
        className={[className, "dark:hidden"].filter(Boolean).join(" ")}
      />
      <Image
        src="/logo-dark.png"
        unoptimized
        alt="Pagevo"
        loading="eager"
        priority
        width={width}
        height={height}
        className={[className, "hidden dark:block"].filter(Boolean).join(" ")}
      />
    </>
  );
}
