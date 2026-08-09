/**
 * The upload cap, shared by the screen that enforces it and the copy that
 * explains it. The Worker declares the same number independently
 * (`MAX_IMAGES` in backend/worker/src/index.ts) because it cannot trust a
 * client-supplied bound — these are deliberately two guards, not one value
 * split in half, and they only need to agree in what they tell the user.
 */
export const MAX_PHOTOS = 8;
