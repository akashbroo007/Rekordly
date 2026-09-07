import * as RadixSwitch from '@radix-ui/react-switch';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label': string;
}

export function Switch({ checked, onCheckedChange, disabled, 'aria-label': ariaLabel }: SwitchProps) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-elevated transition-colors duration-150 data-[state=checked]:border-transparent data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RadixSwitch.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-foreground-muted shadow transition-transform duration-150 data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white" />
    </RadixSwitch.Root>
  );
}
