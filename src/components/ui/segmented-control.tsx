"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * The Signal segmented control: a sunken track with a white thumb on the option that is on.
 *
 * Built on Radix's radio group rather than a strip of buttons. A strip is one tab stop per option
 * and no arrow keys, which is both wrong for the pattern and what axe flags: a set of mutually
 * exclusive choices is a radio group, so the group is one tab stop and the arrows move the
 * selection inside it. Radix gives that for free through its roving focus.
 *
 * Orientation is left unset on purpose. Radix reads "horizontal" as left and right only, but the
 * WAI-ARIA radio group pattern moves the selection on all four arrows, and unset is what gives that.
 *
 * The track is --secondary (#F2F3F9, described in globals.css as the segmented-control tint) with
 * 3px of padding, and the thumb is a --card surface carrying --shadow-thumb.
 */

const segmentedControlVariants = cva(
  "inline-flex w-fit items-center gap-0.5 rounded-lg bg-secondary p-[3px]",
  {
    variants: {
      size: {
        sm: "h-8",
        default: "h-9",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function SegmentedControl({
  className,
  size,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root> &
  VariantProps<typeof segmentedControlVariants>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented-control"
      className={cn(segmentedControlVariants({ size }), className)}
      {...props}
    />
  )
}

function SegmentedControlItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="segmented-control-item"
      className={cn(
        "inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-bold whitespace-nowrap text-muted-foreground transition-colors outline-none",
        "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:text-[var(--disabled)]",
        "data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-[var(--shadow-thumb)]",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

export { SegmentedControl, SegmentedControlItem, segmentedControlVariants }
