// Country / region gazetteer used by extraction and the eligibility engine.
// Codes: ISO 3166-1 alpha-2 for countries; uppercase words for regions.

export const COUNTRIES: Record<string, string[]> = {
  US: ["united states", "united states of america", "usa", "u.s.a.", "u.s.", "us", "america"],
  CA: ["canada"],
  MX: ["mexico", "méxico"],
  BR: ["brazil", "brasil"],
  AR: ["argentina"],
  CL: ["chile"],
  CO: ["colombia"],
  PE: ["peru"],
  UY: ["uruguay"],
  CR: ["costa rica"],
  GB: ["united kingdom", "uk", "u.k.", "great britain", "britain", "england", "scotland", "wales", "northern ireland"],
  IE: ["ireland"],
  DE: ["germany", "deutschland"],
  FR: ["france"],
  ES: ["spain"],
  PT: ["portugal"],
  IT: ["italy"],
  NL: ["netherlands", "the netherlands", "holland"],
  BE: ["belgium"],
  LU: ["luxembourg"],
  CH: ["switzerland"],
  AT: ["austria"],
  SE: ["sweden"],
  NO: ["norway"],
  DK: ["denmark"],
  FI: ["finland"],
  IS: ["iceland"],
  PL: ["poland"],
  CZ: ["czech republic", "czechia"],
  SK: ["slovakia"],
  HU: ["hungary"],
  RO: ["romania"],
  BG: ["bulgaria"],
  GR: ["greece"],
  HR: ["croatia"],
  SI: ["slovenia"],
  RS: ["serbia"],
  EE: ["estonia"],
  LV: ["latvia"],
  LT: ["lithuania"],
  UA: ["ukraine"],
  TR: ["turkey", "türkiye", "turkiye"],
  CY: ["cyprus"],
  MT: ["malta"],
  IL: ["israel"],
  AE: ["united arab emirates", "uae", "dubai", "abu dhabi"],
  SA: ["saudi arabia"],
  EG: ["egypt"],
  NG: ["nigeria"],
  KE: ["kenya"],
  ZA: ["south africa"],
  GH: ["ghana"],
  MA: ["morocco"],
  IN: ["india"],
  PK: ["pakistan"],
  BD: ["bangladesh"],
  LK: ["sri lanka"],
  NP: ["nepal"],
  SG: ["singapore"],
  MY: ["malaysia"],
  ID: ["indonesia"],
  TH: ["thailand"],
  VN: ["vietnam", "viet nam"],
  PH: ["philippines"],
  JP: ["japan"],
  KR: ["south korea", "korea"],
  CN: ["china"],
  HK: ["hong kong"],
  TW: ["taiwan"],
  AU: ["australia"],
  NZ: ["new zealand"],
};

export const COUNTRY_NAME: Record<string, string> = {
  US: "United States", CA: "Canada", MX: "Mexico", BR: "Brazil", AR: "Argentina", CL: "Chile", CO: "Colombia",
  PE: "Peru", UY: "Uruguay", CR: "Costa Rica", GB: "United Kingdom", IE: "Ireland", DE: "Germany", FR: "France",
  ES: "Spain", PT: "Portugal", IT: "Italy", NL: "Netherlands", BE: "Belgium", LU: "Luxembourg", CH: "Switzerland",
  AT: "Austria", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", IS: "Iceland", PL: "Poland",
  CZ: "Czechia", SK: "Slovakia", HU: "Hungary", RO: "Romania", BG: "Bulgaria", GR: "Greece", HR: "Croatia",
  SI: "Slovenia", RS: "Serbia", EE: "Estonia", LV: "Latvia", LT: "Lithuania", UA: "Ukraine", TR: "Türkiye",
  CY: "Cyprus", MT: "Malta", IL: "Israel", AE: "UAE", SA: "Saudi Arabia", EG: "Egypt", NG: "Nigeria", KE: "Kenya",
  ZA: "South Africa", GH: "Ghana", MA: "Morocco", IN: "India", PK: "Pakistan", BD: "Bangladesh", LK: "Sri Lanka",
  NP: "Nepal", SG: "Singapore", MY: "Malaysia", ID: "Indonesia", TH: "Thailand", VN: "Vietnam", PH: "Philippines",
  JP: "Japan", KR: "South Korea", CN: "China", HK: "Hong Kong", TW: "Taiwan", AU: "Australia", NZ: "New Zealand",
};

const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
const EUROPE = [...EU, "GB", "CH", "NO", "IS", "RS", "UA", "TR"];
const MENA = ["IL", "AE", "SA", "EG", "MA", "TR"];
const AFRICA = ["EG", "NG", "KE", "ZA", "GH", "MA"];
const LATAM = ["MX", "BR", "AR", "CL", "CO", "PE", "UY", "CR"];
const APAC = ["IN", "PK", "BD", "LK", "NP", "SG", "MY", "ID", "TH", "VN", "PH", "JP", "KR", "CN", "HK", "TW", "AU", "NZ"];

/** Region code -> member country codes. */
export const REGIONS: Record<string, string[]> = {
  NORTH_AMERICA: ["US", "CA", "MX"],
  US_CANADA: ["US", "CA"],
  AMERICAS: ["US", "CA", ...LATAM],
  LATAM,
  EU,
  EUROPE,
  EMEA: [...new Set([...EUROPE, ...MENA, ...AFRICA])],
  MENA,
  AFRICA,
  APAC,
  ASIA: APAC.filter((c) => !["AU", "NZ"].includes(c)),
};

export const REGION_ALIASES: Record<string, string[]> = {
  NORTH_AMERICA: ["north america", "n. america", "north american"],
  US_CANADA: ["us/canada", "us or canada", "u.s. or canada", "us and canada", "united states or canada", "united states and canada", "usa or canada", "usa/canada", "us & canada"],
  AMERICAS: ["americas", "the americas"],
  LATAM: ["latam", "latin america", "south america", "central america"],
  EU: ["eu", "european union"],
  EUROPE: ["europe", "european"],
  EMEA: ["emea"],
  MENA: ["mena", "middle east"],
  AFRICA: ["africa"],
  APAC: ["apac", "asia pacific", "asia-pacific"],
  ASIA: ["asia"],
};

/** Does a list of allowed codes (countries or regions) include the given country? */
export function codesInclude(codes: string[], country: string): boolean {
  return codes.some((c) => c === country || (REGIONS[c]?.includes(country) ?? false));
}

export function expandCodes(codes: string[]): string[] {
  return [...new Set(codes.flatMap((c) => REGIONS[c] ?? [c]))];
}

export const US_STATES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut",
  DE: "delaware", FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan",
  MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire",
  NJ: "new jersey", NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio", OK: "oklahoma",
  OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota", TN: "tennessee",
  TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington", WV: "west virginia", WI: "wisconsin",
  WY: "wyoming", DC: "district of columbia",
};

/** Common cities seen in the location field -> country. Extended as the data shows more. */
export const CITIES: Record<string, string> = {
  "san francisco": "US", "sf": "US", "bay area": "US", "new york": "US", "nyc": "US", "brooklyn": "US", "seattle": "US",
  "los angeles": "US", "austin": "US", "boston": "US", "chicago": "US", "denver": "US", "palo alto": "US",
  "mountain view": "US", "menlo park": "US", "san jose": "US", "san mateo": "US", "redwood city": "US", "oakland": "US",
  "sunnyvale": "US", "santa clara": "US", "san diego": "US", "washington": "US", "washington dc": "US", "miami": "US",
  "atlanta": "US", "dallas": "US", "houston": "US", "philadelphia": "US", "pittsburgh": "US", "portland": "US",
  "salt lake city": "US", "phoenix": "US", "irvine": "US", "costa mesa": "US", "el segundo": "US", "santa monica": "US",
  "arlington": "US", "boulder": "US", "cambridge": "US", "princeton": "US", "raleigh": "US", "nashville": "US",
  "minneapolis": "US", "detroit": "US", "columbus": "US", "st. louis": "US", "baltimore": "US", "hawthorne": "US",
  "london": "GB", "manchester": "GB", "edinburgh": "GB", "dublin": "IE", "berlin": "DE", "munich": "DE", "hamburg": "DE",
  "paris": "FR", "amsterdam": "NL", "barcelona": "ES", "madrid": "ES", "lisbon": "PT", "zurich": "CH", "zürich": "CH",
  "stockholm": "SE", "copenhagen": "DK", "oslo": "NO", "helsinki": "FI", "warsaw": "PL", "prague": "CZ", "vienna": "AT",
  "milan": "IT", "tel aviv": "IL", "toronto": "CA", "vancouver": "CA", "montreal": "CA", "waterloo": "CA",
  "bengaluru": "IN", "bangalore": "IN", "mumbai": "IN", "delhi": "IN", "new delhi": "IN", "gurgaon": "IN",
  "gurugram": "IN", "noida": "IN", "hyderabad": "IN", "pune": "IN", "chennai": "IN", "singapore": "SG", "tokyo": "JP",
  "seoul": "KR", "sydney": "AU", "melbourne": "AU", "são paulo": "BR", "sao paulo": "BR", "mexico city": "MX",
  "buenos aires": "AR", "bogotá": "CO", "bogota": "CO", "dubai": "AE", "lagos": "NG", "nairobi": "KE",
};
