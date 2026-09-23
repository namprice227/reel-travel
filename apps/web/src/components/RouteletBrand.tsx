import Image from "next/image";

export function RouteletBrand({ size = 40 }: { size?: number }) {
  return (
    <span className="routelet-brand" aria-hidden="true">
      <Image src="/images/routelet-logo.jpg" alt="" width={size} height={size} priority
        className="routelet-brand-image" />
    </span>
  );
}
