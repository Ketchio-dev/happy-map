export interface Place { kind: "cool" | "warm"; name: string; type: string; address: string; phone: string | null; url: string | null; hours: Record<string, string | null>; lon: number | null; lat: number | null }
export interface PlacesFile { meta: Record<string, string>; cool: Place[]; warm: Place[] }
