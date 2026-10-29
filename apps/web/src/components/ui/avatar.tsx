/** A round picture, or the first letter of the name when there is no picture. */
export function Avatar({ name, src, size }: { name: string; src: string | null; size: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.44) };
  if (src) {
    // A plain img, because the Google picture host is not in the Next.js image config. no-referrer is necessary for Google.
    return <img className="av" src={src} alt="" width={size} height={size} style={style} referrerPolicy="no-referrer" />;
  }
  return (
    <span className="av bg-[#1a2a45] font-extrabold text-[#cfe0ff]" aria-hidden="true" style={style}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
