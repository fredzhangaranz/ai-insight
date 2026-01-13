declare module 'input-otp' {
  import * as React from 'react';

  export interface OTPInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    maxLength?: number;
    value?: string;
    onChange?: (value: string) => void;
    containerClassName?: string;
    [key: string]: any;
  }

  export const OTPInput: React.ForwardRefExoticComponent<
    OTPInputProps & React.RefAttributes<HTMLInputElement>
  >;

  export interface OTPInputSlot {
    char: string;
    hasFakeCaret: boolean;
    isActive: boolean;
  }

  export interface OTPInputContextValue {
    value: string;
    valueLength: number;
    maxLength: number;
    slots: OTPInputSlot[];
    setValue: (value: string) => void;
  }

  export const OTPInputContext: React.Context<OTPInputContextValue | null>;
}

