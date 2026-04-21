"use client";

import Image from "next/image";
import { forwardRef } from "react";
import { ORV_READER_WORDMARK_PNG } from "@/lib/bittu-orv-assets";

type Props = {
  /**
   * Story library home: parent is a viewport-locked shell with
   * `overflow-hidden` — wordmark is `absolute` and nudged flush-right.
   * Chapter index pages scroll — wordmark is `fixed` so it stays a
   * right-edge backdrop like the home screen.
   */
  layout: "viewport" | "scroll";
};

/**
 * Shared vertical OMNISCIENT × READER wordmark used as a tinted
 * background on the story library home and on every chapter-index
 * “preview” surface (novel / manhwa / sequel).
 */
export const OrvLibraryWordmark = forwardRef<HTMLDivElement, Props>(
  function OrvLibraryWordmark({ layout }, ref) {
    const position = layout === "viewport" ? "absolute" : "fixed";
    const zClass = layout === "scroll" ? "z-[1]" : "z-0";

    return (
      <div
        ref={ref}
        aria-hidden
        className={`orv-wordmark-bg pointer-events-none ${position} inset-y-0 right-0 ${zClass} hidden w-[min(52vw,480px)] max-w-[100vw] items-center justify-end md:flex`}
      >
        <Image
          src={ORV_READER_WORDMARK_PNG}
          alt=""
          width={380}
          height={1000}
          className="h-[min(86vh,900px)] w-auto max-w-full translate-x-[4%] object-contain object-right opacity-[0.88]"
          priority={layout === "viewport"}
          sizes="(max-width: 768px) 0px, min(52vw, 480px)"
          unoptimized
        />
      </div>
    );
  },
);
