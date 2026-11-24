import { useSafeTheme } from "@/contexts/ThemeContext";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  // useSafeTheme never throws — falls back to 'dark' if provider is missing
  // and avoids direct document access during SSR / first render.
  const { theme } = useSafeTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border group-[.toaster]:border-primary/20 group-[.toaster]:shadow-card group-[.toaster]:rounded-2xl group-[.toaster]:backdrop-blur-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-xl",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-xl",
          success:
            "group-[.toaster]:!border-primary/40 group-[.toaster]:!text-foreground",
          error:
            "group-[.toaster]:!border-destructive/40 group-[.toaster]:!text-foreground",
          info:
            "group-[.toaster]:!border-accent/40 group-[.toaster]:!text-foreground",
          warning:
            "group-[.toaster]:!border-warning/40 group-[.toaster]:!text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
