declare module 'embla-carousel-react' {
  import * as React from 'react';

  export interface EmblaCarouselType {
    canScrollPrev: () => boolean;
    canScrollNext: () => boolean;
    scrollPrev: () => void;
    scrollNext: () => void;
    scrollTo: (index: number) => void;
    selectedScrollSnap: () => number;
    scrollSnapList: () => number[];
    on: (event: string, callback: (api: EmblaCarouselType) => void) => void;
    off: (event: string, callback: (api: EmblaCarouselType) => void) => void;
    destroy: () => void;
    reInit: () => void;
  }

  export type UseEmblaCarouselType = (
    options?: any,
    plugins?: any[]
  ) => [React.RefObject<HTMLDivElement>, EmblaCarouselType];

  const useEmblaCarousel: UseEmblaCarouselType;
  export default useEmblaCarousel;
}

