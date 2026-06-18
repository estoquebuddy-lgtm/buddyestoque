/**
 * Utility to load the Buddy Construtora logo for embedding in jsPDF reports.
 */
export function getBuddyLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = '/favicon.png';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
}
