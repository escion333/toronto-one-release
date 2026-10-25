/** Build-time prefix shared by the public UI and same-origin API routes. */
export const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const appPath = (path: string) => `${appBasePath}${path}`;
