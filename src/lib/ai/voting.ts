import { z } from "zod";
import type { VotingLookup } from "./contracts.ts";

const GIS = "https://gis.toronto.ca/arcgis/rest/services/";
const INTERSECTIONS =
  "https://services3.arcgis.com/b9WvedVPoizGfvfD/ArcGIS/rest/services/COTGEO_CENTRELINE_INTERSECTION/FeatureServer/0";
const facilities = [
  {
    layer: `${GIS}cot_geospatial28/MapServer/28`,
    name: "PLACE_NAME",
    fallbackName: "LIBRARY_NAME",
    address: "ADDRESS_FULL",
  },
  {
    layer: `${GIS}cot_geospatial13/MapServer/5`,
    name: "PUBLIC_NAME",
    fallbackName: "PUBLIC_NAME",
    address: "ADDRESS",
  },
  {
    layer:
      "https://services3.arcgis.com/b9WvedVPoizGfvfD/ArcGIS/rest/services/COT_Geospatial_Community_Recreation_Centre/FeatureServer/0",
    name: "PUBLIC_NAME",
    fallbackName: "PUBLIC_NAME",
    address: "ADDRESS",
  },
] as const;
const pointSchema = z.object({
  x: z.number().min(-80).max(-78),
  y: z.number().min(43).max(45),
});
const featuresSchema = z.object({
  features: z.array(
    z.object({ attributes: z.record(z.string(), z.unknown()), geometry: pointSchema }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});
type Point = z.infer<typeof pointSchema>;
type Fetcher = typeof fetch;

export function normalizeStreet(value: string) {
  const abbreviations: Record<string, string> = {
    STREET: "ST",
    AVENUE: "AVE",
    ROAD: "RD",
    BOULEVARD: "BLVD",
    DRIVE: "DR",
    CRESCENT: "CRES",
    COURT: "CT",
    LANE: "LANE",
    PARKWAY: "PKWY",
    WEST: "W",
    EAST: "E",
    NORTH: "N",
    SOUTH: "S",
  };
  return value
    .toUpperCase()
    .replace(/[,\s]+TORONTO(?:\s+ON(?:TARIO)?)?\s*$/i, "")
    .replace(/[.,]/g, " ")
    .replace(/\b[A-Z]+\b/g, (word) => abbreviations[word] ?? word)
    .replace(/\s+/g, " ")
    .trim();
}

export function intersectionStreets(value: string): [string, string] {
  const parts = value
    .trim()
    .replace(/,\s*Toronto(?:,?\s*ON)?\s*$/i, "")
    .split(/\s*(?:&|\/|@|\band\b|\bat\b)\s*/i);
  const [first, second] = parts;
  if (
    parts.length !== 2 ||
    !first ||
    !second ||
    first.length > 75 ||
    second.length > 75 ||
    ![first, second].every(
      (part) => /^[\p{L}\d .’'()-]+$/u.test(part) && /\p{L}/u.test(part),
    ) ||
    normalizeStreet(first) === normalizeStreet(second)
  )
    throw new Error("Enter two Toronto streets, for example Queen St & Bay St.");
  return [first, second];
}

async function query(
  layer: string,
  parameters: Record<string, string>,
  fetcher: Fetcher,
) {
  const url = new URL(`${layer}/query`);
  url.search = new URLSearchParams({
    f: "json",
    outSR: "4326",
    returnGeometry: "true",
    ...parameters,
  }).toString();
  let response: Response;
  try {
    response = await fetcher(url, {
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new Error(
      "The City's public location service is unavailable. Try again shortly or use a street address.",
    );
  }
  if (!response.ok)
    throw new Error(
      "The City's public location service is unavailable. Try again shortly.",
    );
  const parsed = featuresSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new Error(
      "The City's public location data could not be verified. Try a street address instead.",
    );
  return parsed.data;
}

function streetMatches(requested: string, actual: string) {
  const input = normalizeStreet(requested);
  const target = normalizeStreet(actual);
  return (
    input === target ||
    ["W", "E", "N", "S"].some((direction) => target === `${input} ${direction}`) ||
    (!/\b(?:ST|AVE|RD|BLVD|DR|CRES|CT|LANE|PKWY|W|E|N|S)$/.test(input) &&
      target.startsWith(`${input} `))
  );
}

export function distanceMetres(a: Point, b: Point) {
  const radians = Math.PI / 180;
  const h =
    Math.sin(((b.y - a.y) * radians) / 2) ** 2 +
    Math.cos(a.y * radians) *
      Math.cos(b.y * radians) *
      Math.sin(((b.x - a.x) * radians) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function resolveVotingIntersection(
  value: string,
  fetcher: Fetcher = fetch,
): Promise<VotingLookup> {
  const streets = intersectionStreets(value);
  // Only escaped street-name tokens enter a fixed query against one reviewed layer.
  const tokens = streets.flatMap((street) =>
    normalizeStreet(street)
      .split(" ")
      .filter(
        (token) => !/^(?:ST|AVE|RD|BLVD|DR|CRES|CT|LANE|PKWY|W|E|N|S)$/.test(token),
      ),
  );
  const streetFilter = tokens
    .map((token) => `UPPER(INTERSECTION_DESC) LIKE '%${token.replace(/'/g, "''")}%'`)
    .join(" AND ");
  const where = `TRANS_ID_EXPIRE = -1 AND ELEVATION_LEVEL = 0 AND (${streetFilter})`;
  const data = await query(
    INTERSECTIONS,
    { where, outFields: "INTERSECTION_ID,INTERSECTION_DESC", resultRecordCount: "50" },
    fetcher,
  );
  if (data.exceededTransferLimit)
    throw new Error(
      "Please include full street names and directions to identify one intersection.",
    );
  const matches = data.features.filter((feature) => {
    const description = feature.attributes.INTERSECTION_DESC;
    if (typeof description !== "string") return false;
    const names = description.split(/\s*\/\s*/);
    return names.some((first, index) =>
      names.some(
        (second, otherIndex) =>
          index !== otherIndex &&
          streetMatches(streets[0], first) &&
          streetMatches(streets[1], second),
      ),
    );
  });
  // Divided streets can have several centreline points for the same named crossing.
  const unique = matches.filter(
    (match, index) =>
      matches.findIndex(
        (other) =>
          other.attributes.INTERSECTION_DESC === match.attributes.INTERSECTION_DESC &&
          distanceMetres(other.geometry, match.geometry) < 100,
      ) === index,
  );
  const intersection = unique[0];
  if (!intersection || unique.length !== 1) {
    const choices = unique
      .map((feature) => feature.attributes.INTERSECTION_DESC)
      .slice(0, 5)
      .join("; ");
    throw new Error(
      choices
        ? `Several intersections match: ${choices}. Please specify the full street names and directions.`
        : "No unambiguous Toronto intersection was found. Check both street names, or use a street address.",
    );
  }
  const parameters = {
    where: "1=1",
    geometry: `${intersection.geometry.x},${intersection.geometry.y}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: "1500",
    units: "esriSRUnit_Meter",
    resultRecordCount: "100",
  };
  const nearby = await Promise.allSettled(
    facilities.map(async (facility) => {
      const records = await query(
        facility.layer,
        {
          ...parameters,
          outFields: [
            ...new Set([
              "OBJECTID",
              facility.name,
              facility.fallbackName,
              facility.address,
            ]),
          ].join(","),
        },
        fetcher,
      );
      if (records.exceededTransferLimit)
        throw new Error("Too many nearby public places to verify.");
      return records.features.flatMap((feature) => {
        const primaryName = feature.attributes[facility.name];
        const fallbackName = feature.attributes[facility.fallbackName];
        const name =
          typeof primaryName === "string" && primaryName.trim()
            ? primaryName
            : typeof fallbackName === "string" &&
                facility.fallbackName === "LIBRARY_NAME"
              ? `${fallbackName} Public Library`
              : fallbackName;
        const rawAddress = feature.attributes[facility.address];
        const id = feature.attributes.OBJECTID;
        if (
          typeof name !== "string" ||
          !name.trim() ||
          typeof rawAddress !== "string" ||
          typeof id !== "number"
        )
          return [];
        const address = rawAddress.split(",")[0]?.trim();
        const distance = distanceMetres(intersection.geometry, feature.geometry);
        if (!address || !/^\d+[A-Z]?\s+\S/i.test(address) || distance > 1500) return [];
        const source = new URL(`${facility.layer}/query`);
        source.search = new URLSearchParams({
          f: "pjson",
          objectIds: String(id),
          outFields: [
            ...new Set([facility.name, facility.fallbackName, facility.address]),
          ].join(","),
        }).toString();
        return [{ name: name.trim(), address, distance, sourceUrl: source.href }];
      });
    }),
  );
  const selected = nearby
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort((a, b) => a.distance - b.distance || a.address.localeCompare(b.address))[0];
  if (!selected)
    throw new Error(
      "No public example address could be verified within 1.5 km. Try another intersection or use a street address.",
    );
  const description = z.string().parse(intersection.attributes.INTERSECTION_DESC);
  const source = new URL(`${INTERSECTIONS}/query`);
  source.search = new URLSearchParams({
    f: "pjson",
    where,
    outFields: "INTERSECTION_ID,INTERSECTION_DESC",
    outSR: "4326",
  }).toString();
  return {
    type: "intersection",
    intersection: description,
    address: selected.address,
    publicPlace: selected.name,
    distanceMetres: Math.round(selected.distance),
    intersectionSourceUrl: source.href,
    publicPlaceSourceUrl: selected.sourceUrl,
  };
}

export function votingVenue(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const field = (label: string) => {
    const indices = lines.flatMap((line, index) => (line === label ? [index] : []));
    return indices.length === 1 ? lines[(indices[0] ?? -1) + 1] : undefined;
  };
  const name = field("Location");
  const address = field("Address");
  if (!name || !address || !/^\d+[A-Z]?\s+\S/i.test(address)) return undefined;
  return { name, address };
}
