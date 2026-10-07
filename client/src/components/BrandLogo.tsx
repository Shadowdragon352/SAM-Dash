/** Display the supplied artwork without its empty outer margins. */
export default function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="575 725 850 550"
      role="img"
      aria-label="SAM Patient Monitoring Tool"
      className={`block shrink-0 rounded-lg bg-[#0c1f2e] ${className}`}
    >
      <image href="/sam-logo.png" width="2000" height="2000" />
    </svg>
  );
}
