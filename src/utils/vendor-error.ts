/** HTTP status from an Autotask/vendor error, when it carries one. */
export function vendorStatus(error: unknown): number | undefined {
  const status = error && typeof error === 'object' && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined;
  return typeof status === 'number' ? status : undefined;
}
