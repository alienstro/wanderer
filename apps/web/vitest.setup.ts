import "@testing-library/jest-dom/vitest";

// jsdom has no pointer capture. Sonner calls it when a test clicks a button in a toast.
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => false;
}
