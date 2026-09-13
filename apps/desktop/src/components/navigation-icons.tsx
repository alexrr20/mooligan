import type { SVGProps } from "react";

import { DeckIcon } from "./deck-icon";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

// A shared 24px grid, soft corners, and transparent details match the Deck icon.
function Icon({ size = 24, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.5 2.84c1.5-1.12 3.5-1.12 5 0l5.75 4.3A4.4 4.4 0 0 1 22 10.66V17c0 3.33-1.67 5-5 5h-2.25v-6a2.75 2.75 0 0 0-5.5 0v6H7c-3.33 0-5-1.67-5-5v-6.34c0-1.39.65-2.69 1.75-3.52l5.75-4.3Z" />
    </Icon>
  );
}

export function CollectionIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2h8c1.66 0 2.5.84 2.5 2.5h-13C5.5 2.84 6.34 2 8 2ZM6 6h12c2 0 3 1 3 3v.5H3V9c0-2 1-3 3-3Z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 11h20v6c0 3.33-1.67 5-5 5H7c-3.33 0-5-1.67-5-5v-6Zm6.5 2.5a.75.75 0 0 0-.75.75 4.25 4.25 0 0 0 8.5 0 .75.75 0 0 0-1.5 0 2.75 2.75 0 0 1-5.5 0 .75.75 0 0 0-.75-.75Z"
      />
    </Icon>
  );
}

export function DecksIcon({ size = 24, ...props }: IconProps) {
  return <DeckIcon width={size} height={size} {...props} />;
}

export function SetsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="2" width="8.5" height="8.5" rx="2.75" />
      <rect x="13.5" y="2" width="8.5" height="8.5" rx="2.75" />
      <rect x="2" y="13.5" width="8.5" height="8.5" rx="2.75" />
      <rect x="13.5" y="13.5" width="8.5" height="8.5" rx="2.75" />
    </Icon>
  );
}

export function ListsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="2" width="20" height="5" rx="2" />
      <rect x="2" y="9.5" width="20" height="5" rx="2" />
      <rect x="2" y="17" width="20" height="5" rx="2" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.75 1.75a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5Z"
      />
      <path d="m19 16.6 2.72 2.72a1.7 1.7 0 0 1-2.4 2.4L16.6 19a10.5 10.5 0 0 0 2.4-2.4Z" />
    </Icon>
  );
}
