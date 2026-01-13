declare module 'vaul' {
  import * as React from 'react';

  export interface DrawerProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
    shouldScaleBackground?: boolean;
    [key: string]: any;
  }

  export const Drawer: React.ComponentType<DrawerProps> & {
    Root: React.ComponentType<DrawerProps>;
    Trigger: React.ComponentType<any>;
    Content: React.ComponentType<any>;
    Header: React.ComponentType<any>;
    Title: React.ComponentType<any>;
    Description: React.ComponentType<any>;
    Footer: React.ComponentType<any>;
    Close: React.ComponentType<any>;
    Portal: React.ComponentType<any>;
    Overlay: React.ComponentType<any>;
  };
}

