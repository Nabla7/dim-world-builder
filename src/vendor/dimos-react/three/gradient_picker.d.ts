import { HTMLAttributes } from 'react';
export interface GradientPickerProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
    value: string;
    onChange?: (name: string) => void;
    gradients?: string[];
    disabled?: boolean;
    className?: string;
}
export declare function GradientPicker({ value, onChange, gradients, disabled, className, ...rest }: GradientPickerProps): import('react').JSX.Element;
