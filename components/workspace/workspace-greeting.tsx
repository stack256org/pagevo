"use client";

import { useEffect, useState } from "react";

export function WorkspaceGreeting({ firstName }: { firstName: string }) {
  const [name, setName] = useState(firstName);

  useEffect(() => {
    function handleNameChanged(e: Event) {
      const newName = (e as CustomEvent<{ name: string | null }>).detail.name;
      setName(newName?.trim().split(" ")[0] ?? "");
    }
    window.addEventListener("pagevo:user-name-changed", handleNameChanged);
    return () =>
      window.removeEventListener("pagevo:user-name-changed", handleNameChanged);
  }, []);

  const h = new Date().getHours();
  const label =
    h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return (
    <span suppressHydrationWarning>
      {name ? (
        <>
          {label}, {name} 👋
        </>
      ) : (
        <>{label} 👋</>
      )}
    </span>
  );
}
