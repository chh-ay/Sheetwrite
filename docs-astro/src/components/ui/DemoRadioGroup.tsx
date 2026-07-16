import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { ReactNode } from "react";

interface DemoRadioGroupProps<Value extends string> {
  label: string;
  value: Value;
  onValueChange: (value: Value) => void;
  children: ReactNode;
  className?: string;
}

export function DemoRadioGroup<Value extends string>({
  label,
  value,
  onValueChange,
  children,
  className,
}: DemoRadioGroupProps<Value>) {
  return (
    <RadioGroup
      className={["sw-demo-radio-group", className].filter(Boolean).join(" ")}
      aria-label={label}
      value={value}
      onValueChange={onValueChange}
    >
      {children}
    </RadioGroup>
  );
}

interface DemoRadioItemProps<Value extends string> {
  value: Value;
  children: ReactNode;
  className?: string;
}

export function DemoRadioItem<Value extends string>({
  value,
  children,
  className,
}: DemoRadioItemProps<Value>) {
  return (
    <Radio.Root
      className={["sw-demo-radio-item", className].filter(Boolean).join(" ")}
      value={value}
    >
      {children}
    </Radio.Root>
  );
}
