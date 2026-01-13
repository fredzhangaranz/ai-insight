declare module 'sonner' {
  import * as React from 'react';

  export interface ToasterProps {
    position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
    toastOptions?: {
      classNames?: {
        toast?: string;
        description?: string;
        actionButton?: string;
        cancelButton?: string;
        [key: string]: string | undefined;
      };
    };
    theme?: 'light' | 'dark' | 'system';
    className?: string;
    [key: string]: any;
  }

  export const Toaster: React.ComponentType<ToasterProps>;
  export const toast: {
    success: (message: string, options?: any) => void;
    error: (message: string, options?: any) => void;
    info: (message: string, options?: any) => void;
    warning: (message: string, options?: any) => void;
    [key: string]: any;
  };
}

