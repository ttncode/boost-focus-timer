import { createElement, forwardRef, type ReactNode, type SVGProps } from "react";

type IconNode = [tag: string, attrs: Record<string, string | number>][];

export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & {
  size?: number | string;
  absoluteStrokeWidth?: boolean;
  children?: ReactNode;
};

const toKebab = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().trim();

export function createIcon(name: string, node: IconNode) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(
    (
      {
        color = "currentColor",
        size = 24,
        strokeWidth = 2,
        absoluteStrokeWidth,
        className = "",
        children,
        ...rest
      },
      ref,
    ) =>
      createElement(
        "svg",
        {
          ref,
          xmlns: "http://www.w3.org/2000/svg",
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: color,
          strokeWidth: absoluteStrokeWidth
            ? (Number(strokeWidth) * 24) / Number(size)
            : strokeWidth,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          className: ["lucide", `lucide-${toKebab(name)}`, className].join(" "),
          ...rest,
        },
        ...node.map(([tag, attrs], i) => createElement(tag, { ...attrs, key: i })),
        children,
      ),
  );
  Icon.displayName = name;
  return Icon;
}
