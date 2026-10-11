export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  if (name === "chat")
    return (
      <svg
        className={`icon ${className}`}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
        <path d="M8 11h8m-8 4h5" />
      </svg>
    );
  if (name === "send")
    return (
      <svg
        className={`icon ${className}`}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="m22 2-7 20-4-9-9-4L22 2ZM22 2 11 13" />
      </svg>
    );
  return (
    <svg className={`icon ${className}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
