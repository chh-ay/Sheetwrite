import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

export interface DemoSelectOption {
  label: string;
  value: string;
}

interface DemoSelectProps {
  label: string;
  value: string;
  options: readonly DemoSelectOption[];
  onValueChange: (value: string) => void;
  className?: string;
}

export function DemoSelect({ label, value, options, onValueChange, className }: DemoSelectProps) {
  return (
    <div className={["sw-demo-select", className].filter(Boolean).join(" ")}>
      <Select.Root
        items={options}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onValueChange(next);
        }}
      >
        <Select.Label className="sw-demo-select__label">{label}</Select.Label>
        <Select.Trigger className="sw-demo-select__trigger">
          <Select.Value />
          <Select.Icon className="sw-demo-select__icon">
            <ChevronDown size={14} aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className="sw-demo-select__positioner" sideOffset={4}>
            <Select.Popup className="sw-demo-select__popup">
              <Select.List className="sw-demo-select__list">
                {options.map((option) => (
                  <Select.Item
                    className="sw-demo-select__item"
                    key={option.value}
                    value={option.value}
                  >
                    <Select.ItemIndicator className="sw-demo-select__indicator">
                      <Check size={14} aria-hidden="true" />
                    </Select.ItemIndicator>
                    <Select.ItemText>{option.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
