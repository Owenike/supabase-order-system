import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // 基底樣式：對齊、間距、焦點、禁用
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
  {
    variants: {
      variant: {
        // 舊有變體（保留）
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        ghost: "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // 新增變體
        warning: "bg-amber-500 text-white hover:bg-amber-600",
        success: "bg-emerald-600 text-white hover:bg-emerald-700",
        muted: "bg-muted text-muted-foreground hover:bg-muted/80",
        // 深色頁面友善的柔和卡感（白底卡片上也通用）
        soft: "bg-white/10 text-white hover:bg-white/15 border border-white/15",
      },
      size: {
        xs: "h-8 px-2.5 text-sm",
        sm: "h-9 px-3 rounded-md text-sm",
        default: "h-10 px-4 py-2 text-sm",
        lg: "h-11 px-8 rounded-md",
        icon: "h-10 w-10",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      fullWidth: false,
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** 顯示載入中（自帶左側轉圈，並自動 disabled） */
  loading?: boolean
  /** 左側圖示（非 loading 狀態才會顯示） */
  startIcon?: React.ReactNode
  /** 右側圖示 */
  endIcon?: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      loading = false,
      startIcon,
      endIcon,
      asChild = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    const isDisabled = disabled || loading

    return (
      <Comp
        ref={ref}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        disabled={isDisabled}
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        {...props}
      >
        {/* loading spinner（左側） */}
        {loading ? (
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        ) : (
          startIcon && <span className="inline-flex -ml-0.5">{startIcon}</span>
        )}

        <span>{children}</span>

        {endIcon && !loading && <span className="inline-flex -mr-0.5">{endIcon}</span>}
      </Comp>
    )
  }
)

Button.displayName = "Button"

export { Button, buttonVariants }
