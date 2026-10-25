export function votingMapLinks(address: string, venueName?: string) {
  // The polling venue is the only location sent to Google; never include the lookup address.
  const building = venueName?.split(",")[0]?.trim();
  const query = `${building ? `${building}, ` : ""}${address}, Toronto, Ontario, Canada`;
  const embed = new URL("https://www.google.com/maps");
  embed.search = new URLSearchParams({ q: query, output: "embed" }).toString();
  const external = new URL("https://www.google.com/maps/search/");
  external.search = new URLSearchParams({ api: "1", query }).toString();
  return { embed: embed.href, external: external.href };
}
