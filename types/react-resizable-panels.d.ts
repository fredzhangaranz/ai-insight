declare module 'react-resizable-panels' {
  import * as React from 'react';

  export interface ResizablePanelGroupProps extends React.HTMLAttributes<HTMLDivElement> {
    direction?: 'horizontal' | 'vertical';
    [key: string]: any;
  }

  export interface ResizablePanelProps extends React.HTMLAttributes<HTMLDivElement> {
    defaultSize?: number;
    minSize?: number;
    maxSize?: number;
    [key: string]: any;
  }

  export interface ResizableHandleProps extends React.HTMLAttributes<HTMLDivElement> {
    withHandle?: boolean;
    [key: string]: any;
  }

  export const PanelGroup: React.ComponentType<ResizablePanelGroupProps>;
  export const Panel: React.ComponentType<ResizablePanelProps>;
  export const PanelResizeHandle: React.ComponentType<ResizableHandleProps>;
}

