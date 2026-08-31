"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircle2, Info, AlertTriangle, XCircle, LoaderCircle } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  /* resolvedTheme, not theme: `theme` is "system" whenever the user has not
     made an explicit choice, and Sonner would then apply its own OS media
     query independently of ours. resolvedTheme is always a concrete
     "light" | "dark", so the toast can never disagree with the app. */
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={(resolvedTheme ?? "light") as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CheckCircle2 className="size-4.5 text-success" />
        ),
        info: (
          <Info className="size-4.5 text-primary" />
        ),
        warning: (
          <AlertTriangle className="size-4.5 text-warning" />
        ),
        error: (
          <XCircle className="size-4.5 text-error" />
        ),
        loading: (
          <LoaderCircle className="size-4.5 animate-spin text-base-content/70" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--color-base-100)",
          "--normal-text": "var(--color-base-content)",
          "--normal-border": "var(--color-base-300)",
          "--border-radius": "var(--radius-md)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      visibleToasts={1}
      {...props}
    />
  )
}

export { Toaster }
