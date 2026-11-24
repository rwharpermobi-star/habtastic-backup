import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { vibrateLight } from "@/lib/haptics";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
    glowColor?: "blue" | "green" | "orange";
  }
>(({ className, glowColor = "blue", onCheckedChange, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=unchecked]:bg-input",
      glowColor === "blue" && "data-[state=checked]:bg-[hsl(212,100%,50%)] data-[state=checked]:shadow-[0_0_10px_hsl(212,100%,50%/0.5),0_0_20px_hsl(212,100%,50%/0.2)]",
      glowColor === "green" && "data-[state=checked]:bg-[hsl(81,100%,50%)] data-[state=checked]:shadow-[0_0_10px_hsl(81,100%,50%/0.5),0_0_20px_hsl(81,100%,50%/0.2)]",
      glowColor === "orange" && "data-[state=checked]:bg-[hsl(25,100%,50%)] data-[state=checked]:shadow-[0_0_10px_hsl(25,100%,50%/0.5),0_0_20px_hsl(25,100%,50%/0.2)]",
      className,
    )}
    onCheckedChange={(checked) => {
      vibrateLight();
      onCheckedChange?.(checked);
    }}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 data-[state=checked]:scale-110 data-[state=unchecked]:scale-100",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
