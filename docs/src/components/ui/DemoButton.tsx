import { Button } from "@base-ui/react/button";
import type { ComponentProps } from "react";

export type DemoButtonProps = ComponentProps<typeof Button> & {
  variant?: "default" | "primary" | "quiet";
};

export function DemoButton({ className = "", variant = "default", ...props }: DemoButtonProps) {
  return (
    <Button {...props} className={`sw-demo-button ${className}`.trim()} data-variant={variant} />
  );
}
